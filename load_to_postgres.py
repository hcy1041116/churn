"""
把 churn 資料 + 模型預測 + 客群標籤寫進 Postgres，供 Superset 建 dashboard。

用法（本機或 Railway 皆可）：
    export DATABASE_URL="postgresql://user:pass@host:port/dbname"
    python load_to_postgres.py

Railway：在 Superset service 或另建的 job 裡設好 DATABASE_URL（指向 Railway Postgres plugin）後執行。
會建立一張表 churn_analytics，欄位含原始特徵、流失機率、客群標籤。
Superset 直接連這張表即可拉圖。
"""
import os
import json
import joblib
import numpy as np
import pandas as pd
from sqlalchemy import create_engine

DATA_PATH = os.environ.get("CHURN_CSV", "train.csv")
DB_URL = os.environ.get("DATABASE_URL")
TABLE = "churn_analytics"


def engineer(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["TotalCharges"] = pd.to_numeric(d["TotalCharges"], errors="coerce")
    d["TotalCharges"] = d["TotalCharges"].fillna(d["TotalCharges"].median())
    d["avg_monthly_spend"] = d["TotalCharges"] / d["tenure"].clip(lower=1)
    addon = ["OnlineSecurity", "OnlineBackup", "DeviceProtection",
             "TechSupport", "StreamingTV", "StreamingMovies"]
    d["num_addons"] = (d[addon] == "Yes").sum(axis=1)
    return d


def main():
    if not DB_URL:
        raise SystemExit("請先設定環境變數 DATABASE_URL")

    model = joblib.load("model_lgbm.joblib")
    seg_scaler = joblib.load("seg_scaler.joblib")
    kmeans = joblib.load("kmeans.joblib")
    meta = json.load(open("meta.json", encoding="utf-8"))
    FEATURE_ORDER = meta["feature_order"]
    SEG_COLS = meta["seg_cols"]
    SEG_LABEL = {int(k): v for k, v in meta["seg_label"].items()}

    print(f"讀取 {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    data = engineer(df)

    # 預測流失機率
    feat = data.drop(columns=["id", "Churn"], errors="ignore")
    num_cols = feat.select_dtypes(include="number").columns.tolist()
    cat_cols = [c for c in feat.columns if c not in num_cols]
    X = pd.get_dummies(feat, columns=cat_cols, drop_first=True).astype(float)
    X = X.reindex(columns=FEATURE_ORDER, fill_value=0)
    data["churn_prob"] = model.predict_proba(X)[:, 1]

    # 客群標籤
    seg = kmeans.predict(seg_scaler.transform(data[SEG_COLS]))
    data["segment_label"] = pd.Series(seg).map(SEG_LABEL).values

    # 只保留 BI 需要的欄位（避免 one-hot 後的稀疏欄）
    keep = ["id", "gender", "SeniorCitizen", "Partner", "Dependents", "tenure",
            "PhoneService", "InternetService", "Contract", "PaperlessBilling",
            "PaymentMethod", "MonthlyCharges", "TotalCharges", "avg_monthly_spend",
            "num_addons", "Churn", "churn_prob", "segment_label"]
    out = data[[c for c in keep if c in data.columns]].copy()
    out["churn_flag"] = (out["Churn"] == "Yes").astype(int)

    print(f"寫入 Postgres 表 {TABLE}（{len(out):,} 列）...")
    engine = create_engine(DB_URL)
    out.to_sql(TABLE, engine, if_exists="replace", index=False, chunksize=10000)
    print("完成。Superset 連此表即可建 dashboard。")


if __name__ == "__main__":
    main()
