"""
把 churn 資料 + 模型預測 + 客群標籤輸出成 Tableau／Power BI 用的 CSV（放在 tableau/）。

使用 train_and_save.py 存的模型和 oof_predictions.csv（不重新訓練、不寫資料庫），所以要先跑過 train_and_save.py：
- churn_mart.csv：每位客戶一列的明細（原始特徵 + 是否流失 + 預測流失機率 + 客群 + 使用月數分組）。
  預測流失機率是交叉驗證的 out-of-fold 機率；Power BI 報表（ChurnBI/）讀這個檔
- churn_dashboard.csv：Tableau dashboard 用的明細，每位客戶一列，欄名中文，另外放好在 Tableau 裡彙總用的輔助欄。
  所有互動的圖都接這一個檔，所以在儀表板上點任何一張圖，整頁會一起篩選（連動）
- feature_importance.csv：模型的特徵重要度（模型整體的性質，不隨篩選改變）
- data_quality.csv：明細每個欄位的型態、缺值、相異值，資料檢核頁用

用法：
    uv run export_for_tableau.py
Tableau 操作步驟見 tableau/TABLEAU_GUIDE.md。
"""
import os

import numpy as np
import pandas as pd

from churn_features import (
    churn_prob_for_bi,
    count_addons,
    engineer,
    load_artifacts,
    predict_segment,
    source_column,
)

DATA_PATH = os.environ.get("CHURN_CSV", "train.csv")
OUT_DIR = "tableau"

# 標籤開頭是數字，Tableau 預設的字母排序剛好就是分組順序
TENURE_BINS = [-1, 12, 24, 48, float("inf")]
TENURE_LABELS = ["0-12 個月", "13-24 個月", "25-48 個月", "49 個月以上"]

# 風險分級（預測流失機率，左閉右開）。全體客戶在高／中／低風險的實際流失率約 71%／34%／4%，分得開
RISK_CUTS = [0, 0.2, 0.5, float("inf")]
RISK_LABELS = ["低風險（<20%）", "中風險（20–50%）", "高風險（≥50%）"]
RISK_ORDER = {label: i for i, label in enumerate(reversed(RISK_LABELS), start=1)}  # 高 = 1
# 挽留名單：還沒流失的客戶裡，每種合約各取機率最高的 100 位。全體的前幾百名都是同一種人
# （月約、光纖、電子支票、剛加入），分合約取才看得到長約裡也有人要走（多半是高價值客）
TOP_PER_CONTRACT = 100

TYPE_NAME = {"i": "整數", "f": "小數", "O": "文字"}  # 依 dtype.kind 對應

# 模型輸入欄 → 特徵重要度圖上的名稱（one-hot 欄會加總回原本的欄）
FEATURE_NAME = {
    "gender": "性別", "SeniorCitizen": "年長者", "Partner": "有伴侶", "Dependents": "有家眷",
    "tenure": "使用月數", "PhoneService": "電話服務", "MultipleLines": "多線電話",
    "InternetService": "網路服務", "OnlineSecurity": "線上安全", "OnlineBackup": "線上備份",
    "DeviceProtection": "裝置保護", "TechSupport": "技術支援", "StreamingTV": "串流電視",
    "StreamingMovies": "串流電影", "Contract": "合約類型", "PaperlessBilling": "無紙化帳單",
    "PaymentMethod": "付款方式", "MonthlyCharges": "月費", "TotalCharges": "累計費用",
    "avg_monthly_spend": "平均每月花費", "num_addons": "加值服務數",
}


def build_mart(df: pd.DataFrame, art: dict) -> pd.DataFrame:
    data = engineer(df)

    # 原始特徵取自未經補值的 df，新增欄位用中文
    mart = df.drop(columns=["Churn"]).copy()
    mart["是否流失"] = (df["Churn"] == "Yes").astype(int)
    mart["預測流失機率"] = churn_prob_for_bi(data, art)
    mart["客群"] = predict_segment(data, art)
    mart["使用月數分組"] = pd.cut(df["tenure"], bins=TENURE_BINS, labels=TENURE_LABELS)
    return mart


def build_dashboard(mart: pd.DataFrame) -> pd.DataFrame:
    """Tableau dashboard 用的明細。指標在 Tableau 裡用彙總算（不用計算欄位），所以先放好輔助欄。"""
    # 機率先取到小數 4 位（跟檔案裡寫的一樣），分級、排名才對得上看的人在 Tableau 裡看到的值
    churn, prob, charge = mart["是否流失"], mart["預測流失機率"].round(4), mart["MonthlyCharges"]
    lo = (charge // 10 * 10).astype(int)
    rank = prob.rank(method="first", ascending=False)
    decile = ((rank - 1) * 10 // len(mart) + 1).astype(int)
    retain = (mart.assign(機率=prob)[churn == 0].sort_values(["機率", "id"], ascending=[False, True])
                  .groupby("Contract").head(TOP_PER_CONTRACT).index)
    risk = pd.cut(prob, RISK_CUTS, right=False, labels=RISK_LABELS).astype(str)
    return pd.DataFrame({
        # ---- 維度（文字）----
        # 客戶編號加 C 開頭：全是數字的話 Tableau 會當成數值拿去加總
        "客戶編號": "C" + mart["id"].astype(str),
        "合約類型": mart["Contract"], "付款方式": mart["PaymentMethod"], "網路服務": mart["InternetService"],
        "使用月數分組": mart["使用月數分組"],
        "月費區間": lo.map(lambda v: f"${v}–{v + 10}"),
        "加值服務數": count_addons(mart).astype(str) + " 項",
        "客群": mart["客群"],
        "狀態": churn.map({1: "流失", 0: "留存"}),
        "風險等級": risk,
        "風險十分位": decile.map(lambda i: f"第{i:02d}組"),  # 補零，Tableau 照字母排就是 01 → 10
        "挽留名單": np.where(mart.index.isin(retain), "是", "否"),
        # ---- 度量（數字）：Tableau 預設加總；流失率、預測流失機率、平均使用月數、平均月費改成平均 ----
        "客戶數": 1,
        "流失人數": churn,
        "流失率": churn,
        "月營收": charge,
        "流失月營收": charge * churn,
        "預測流失機率": prob,
        "預期流失月營收": (prob * charge).round(2),
        "高風險人數": (prob >= 0.5).astype(int),
        "使用月數": mart["tenure"],
        "平均使用月數": mart["tenure"],
        "平均月費": charge,
        # 排序用：月費區間、風險等級照文字排會亂掉，排序視窗選這兩欄的最小值
        "區間排序": lo,
        "等級排序": risk.map(RISK_ORDER),
    })


def data_quality(mart: pd.DataFrame) -> pd.DataFrame:
    n = len(mart)
    na = mart.isna().sum()
    dq = pd.DataFrame({
        "欄位名稱": mart.columns,
        "型態": [TYPE_NAME.get(t.kind, str(t)) for t in mart.dtypes],
        "缺值數": na.values,
        "缺值比例": (na / n).values,
        "相異值個數": mart.nunique().values,
    })
    # 最後一列放總筆數；數字寫在「型態」欄，表格上讀起來是「總筆數 | 594,194 筆」
    total = pd.DataFrame([{"欄位名稱": "總筆數", "型態": f"{n:,} 筆"}])
    dq = pd.concat([dq, total], ignore_index=True)
    # 總筆數那列沒有數值，用 Int64 讓 CSV 寫成空白而不是 0.0
    return dq.astype({"缺值數": "Int64", "相異值個數": "Int64"})


def feature_importance(art: dict) -> pd.DataFrame:
    """LightGBM 的 gain 重要度，one-hot 欄加總回原本的欄，換算成占比。"""
    gain = art["model"].booster_.feature_importance(importance_type="gain")
    base = [source_column(f, art["levels"]) for f in art["meta"]["feature_order"]]
    imp = pd.Series(gain, index=base).groupby(level=0).sum()
    imp = (imp / imp.sum()).sort_values(ascending=False)
    return pd.DataFrame({"特徵": imp.index.map(FEATURE_NAME), "重要度": imp.values})


def main():
    print(f"讀取 {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    art = load_artifacts()
    mart = build_mart(df, art)
    dash = build_dashboard(mart)

    outputs = {
        "churn_mart.csv": mart.round({"預測流失機率": 4}),
        "churn_dashboard.csv": dash,
        "feature_importance.csv": feature_importance(art).round(4),
        "data_quality.csv": data_quality(mart).round(4),
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"\n輸出到 {OUT_DIR}/：")
    for name, table in outputs.items():
        # utf-8-sig（帶 BOM）讓 Tableau / Excel 在 Windows 上正確辨識中文
        table.to_csv(os.path.join(OUT_DIR, name), index=False, encoding="utf-8-sig")
        print(f"\n{name}：{len(table):,} 列")
        print(f"  欄位：{', '.join(table.columns)}")


if __name__ == "__main__":
    main()
