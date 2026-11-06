"""客戶流失專案共用的特徵工程、編碼與評分。

訓練（train_and_save.py）、批次評分（export_for_tableau.py）
和即時預測（app.py）都從這裡 import，確保每個地方處理資料的方式完全一樣。
"""
import json

import joblib
import numpy as np
import pandas as pd

ADDON_COLS = ["OnlineSecurity", "OnlineBackup", "DeviceProtection",
              "TechSupport", "StreamingTV", "StreamingMovies"]
SEG_COLS = ["tenure", "MonthlyCharges", "TotalCharges", "num_addons"]
NON_FEATURES = ["id", "Churn"]
OOF_PATH = "oof_predictions.csv"


def count_addons(d: pd.DataFrame) -> pd.Series:
    """每位客戶訂了幾個加值服務：6 個加值服務欄裡是 Yes 的個數。"""
    return (d[ADDON_COLS] == "Yes").sum(axis=1)


def engineer(d: pd.DataFrame) -> pd.DataFrame:
    """衍生特徵：平均每月花費、加值服務數。回傳新表，不改動傳進來的 d。"""
    d = d.copy()
    d["TotalCharges"] = pd.to_numeric(d["TotalCharges"], errors="coerce")
    # 累計金額 ≈ 在網月數 × 月費；缺值多半是剛加入的客戶（tenure = 0），照這個關係補會是 0
    d["TotalCharges"] = d["TotalCharges"].fillna(d["tenure"] * d["MonthlyCharges"])
    d["avg_monthly_spend"] = d["TotalCharges"] / d["tenure"].clip(lower=1)
    d["num_addons"] = count_addons(d)
    return d


def category_levels(feat: pd.DataFrame) -> dict:
    """訓練時記下每個類別欄有哪些值。排序後的第一個值就是 one-hot 的參照組。"""
    cat_cols = feat.select_dtypes(exclude="number").columns
    return {c: sorted(feat[c].dropna().unique().tolist()) for c in cat_cols}


def encode(feat: pd.DataFrame, levels: dict) -> pd.DataFrame:
    """類別欄做 one-hot（drop_first：每欄第一個值當參照組），回傳全是數字的表。

    類別清單固定用訓練時的 levels，所以一位客戶或一整批，編出來的欄位都一模一樣。
    遇到缺值或訓練時沒看過的值就報錯，不會默默被當成參照組。
    """
    feat = feat.copy()
    for col, values in levels.items():
        bad = set(feat[col].unique()) - set(values)
        if bad:
            raise ValueError(f"{col} 出現訓練時沒有的值：{sorted(map(str, bad))}")
        feat[col] = pd.Categorical(feat[col], categories=values)
    return pd.get_dummies(feat, columns=list(levels), drop_first=True).astype(float)


def source_column(feature: str, levels: dict) -> str:
    """編碼後的欄名對應回原本的欄：one-hot 欄（例如 Contract_Two year）→ Contract，數值欄維持原名。"""
    for col in levels:
        if feature.startswith(f"{col}_"):
            return col
    return feature


def load_artifacts(folder: str = ".") -> dict:
    """讀回 train_and_save.py 存的模型、分群器和設定。"""
    with open(f"{folder}/meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    with open(f"{folder}/feature_choices.json", encoding="utf-8") as f:
        levels = json.load(f)
    return {
        "model": joblib.load(f"{folder}/model_lgbm.joblib"),
        "seg_scaler": joblib.load(f"{folder}/seg_scaler.joblib"),
        "kmeans": joblib.load(f"{folder}/kmeans.joblib"),
        "meta": meta,
        "levels": levels,
        # JSON 的鍵一定是字串，轉回整數才查得到 kmeans 給的群編號
        "seg_label": {int(k): v for k, v in meta["seg_label"].items()},
    }


def model_input(data: pd.DataFrame, art: dict) -> pd.DataFrame:
    """engineer 之後的資料 → 模型要的特徵表。只挑訓練時用的欄，多出來的欄（例如已算好的機率）不會被送進模型。"""
    feat = data[art["meta"]["input_cols"]]
    return encode(feat, art["levels"])[art["meta"]["feature_order"]]


def predict_churn(data: pd.DataFrame, art: dict) -> np.ndarray:
    """用最終模型算每位客戶的流失機率。"""
    return art["model"].predict_proba(model_input(data, art))[:, 1]


def predict_segment(data: pd.DataFrame, art: dict) -> pd.Series:
    """用訓練時的標準化參數和群中心分群，回傳客群名稱（index 跟 data 一樣）。"""
    seg = art["kmeans"].predict(art["seg_scaler"].transform(data[SEG_COLS]))
    return pd.Series(seg, index=data.index).map(art["seg_label"])


def churn_prob_for_bi(data: pd.DataFrame, art: dict, oof_path: str = OOF_PATH) -> pd.Series:
    """BI 用的流失機率。

    訓練資料裡的客戶用交叉驗證的 out-of-fold 機率（來自沒看過他的模型）；
    不在訓練資料裡的新客戶，才用最終模型評分。
    """
    try:
        oof = pd.read_csv(oof_path)
    except FileNotFoundError:
        raise SystemExit(f"找不到 {oof_path}，請先執行 train_and_save.py") from None
    prob = data[["id"]].merge(oof, on="id", how="left", validate="many_to_one")["churn_prob"]
    prob.index = data.index
    new = prob.isna()
    if new.any():
        prob[new] = predict_churn(data[new], art)
    return prob
