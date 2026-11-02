"""從 tableau/ 的檔案算出圖解指南（index.html）要顯示的數字，寫成 data.js。

指南上的成品預覽、示意畫面和「做完會看到」的數字都從這裡來，算法跟 Tableau 裡的彙總一樣
（流失率 = 流失率欄的平均、人數 = 客戶數欄的總計）。重新產生 CSV 之後再跑一次：
    uv run tableau/guide/make_data.py
"""
import json
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)  # tableau/
# 示範連動：在儀表板上點「各使用月數流失率」的這一組之後，整頁會變成的數字
DEMO_GROUP = "0-12 個月"


def read(name: str) -> pd.DataFrame:
    return pd.read_csv(os.path.join(SRC, f"{name}.csv"), encoding="utf-8-sig")


def rates(d: pd.DataFrame, col: str) -> list:
    g = d.groupby(col)
    return [{"l": k, "v": float(v["流失率"].mean()), "n": int(v["客戶數"].sum())} for k, v in g]


def matrix(d: pd.DataFrame, row: str, col: str) -> dict:
    t = d.pivot_table(index=row, columns=col, values="流失率", aggfunc="mean")
    return {"rl": t.index.tolist(), "cl": t.columns.tolist(), "M": t.values.tolist()}


def summarize(d: pd.DataFrame, full: bool = True) -> dict:
    out = {
        "kpi": {"客戶數": int(d["客戶數"].sum()), "流失人數": int(d["流失人數"].sum()), "流失率": float(d["流失率"].mean()),
                "月營收": float(d["月營收"].sum()), "流失月營收": float(d["流失月營收"].sum())},
        "contract": rates(d, "合約類型"), "payment": rates(d, "付款方式"), "tenure": rates(d, "使用月數分組"),
        "internet": rates(d, "網路服務"),
        "rev": [{"l": k, "churn": float(v["流失月營收"].sum()), "stay": float(v["月營收"].sum() - v["流失月營收"].sum())}
                for k, v in d.groupby("合約類型")],
    }
    if not full:
        return out
    hist = d.groupby(["區間排序", "月費區間"])
    act = d[d["狀態"] == "留存"]
    out.update({
        "addons": rates(d, "加值服務數"),
        "heatI": matrix(d, "合約類型", "網路服務"),
        "heatT": matrix(d, "合約類型", "使用月數分組"),
        "hist": [{"l": k[1], "k": int(k[0]), "churn": int(v["流失人數"].sum()), "stay": int(v["客戶數"].sum() - v["流失人數"].sum())} for k, v in hist],
        "seg": [{"l": k, "n": int(v["客戶數"].sum()), "rate": float(v["流失率"].mean()), "pred": float(v["預測流失機率"].mean()),
                 "tenure": float(v["平均使用月數"].mean()), "charge": float(v["平均月費"].mean())} for k, v in d.groupby("客群")],
        "riskKpi": {"客戶數": int(act["客戶數"].sum()), "高風險人數": int(act["高風險人數"].sum()),
                    "月營收": float(act["月營收"].sum()), "預期流失月營收": float(act["預期流失月營收"].sum())},
        "tiers": [{"l": k, "o": int(v["等級排序"].min()), "n": int(v["客戶數"].sum()), "rev": float(v["月營收"].sum())} for k, v in act.groupby("風險等級")],
        "list": act[act["挽留名單"] == "是"].sort_values("預測流失機率", ascending=False)[
            ["客戶編號", "客群", "合約類型", "網路服務", "付款方式", "預測流失機率"]].values.tolist(),
        "deciles": [{"l": k, "v": float(v["流失率"].mean()), "p": float(v["預測流失機率"].mean())} for k, v in d.groupby("風險十分位")],
    })
    return out


def fields(df: pd.DataFrame) -> list:
    # Tableau 讀到數字欄會當「度量」（綠色 #），文字欄當「維度」（藍色 Abc）
    return [[c, "m" if pd.api.types.is_numeric_dtype(df[c]) else "d"] for c in df.columns]


def main():
    dash = read("churn_dashboard")
    imp, dq = read("feature_importance"), read("data_quality")
    out = {
        "fields": {"churn_dashboard": fields(dash), "feature_importance": fields(imp), "data_quality": fields(dq)},
        "preview": json.loads(dash.head(3).to_json(orient="values", force_ascii=False)),
        "all": summarize(dash),
        "demo": {"group": DEMO_GROUP, **summarize(dash[dash["使用月數分組"] == DEMO_GROUP], full=False)},
        "importance": imp.values.tolist(),
        "dq": json.loads(dq.to_json(orient="values", force_ascii=False)),
    }
    path = os.path.join(HERE, "data.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("// 由 make_data.py 產生，不要手改\nwindow.GUIDE_DATA = ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"寫入 {path}（{os.path.getsize(path) / 1024:.1f} KB）")


if __name__ == "__main__":
    main()
