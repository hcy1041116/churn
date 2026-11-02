"""
把 churn 資料 + 流失機率 + 客群標籤寫進 Postgres，供 Superset 建 dashboard。

用法（本機或 Railway 皆可；需要先執行 train_and_save.py 產生模型檔和 oof_predictions.csv）：
    export DATABASE_URL="postgresql://user:pass@host:port/dbname"
    python load_to_postgres.py

Railway：在 Superset service 或另建的 job 裡設好 DATABASE_URL（指向 Railway Postgres plugin）後執行。
會建立一張表 churn_analytics，欄位含原始特徵、流失機率、客群標籤。
Superset 直接連這張表即可拉圖。
"""
import os

import pandas as pd
from sqlalchemy import create_engine

from churn_features import churn_prob_for_bi, engineer, load_artifacts, predict_segment

DATA_PATH = os.environ.get("CHURN_CSV", "train.csv")
DB_URL = os.environ.get("DATABASE_URL")
TABLE = "churn_analytics"

# 只保留 BI 需要的欄位（原始類別欄，不放 one-hot 之後的 0／1 欄）
KEEP = ["id", "gender", "SeniorCitizen", "Partner", "Dependents", "tenure",
        "PhoneService", "InternetService", "Contract", "PaperlessBilling",
        "PaymentMethod", "MonthlyCharges", "TotalCharges", "avg_monthly_spend",
        "num_addons", "Churn", "churn_prob", "segment_label"]


def main():
    if not DB_URL:
        raise SystemExit("請先設定環境變數 DATABASE_URL")

    art = load_artifacts()

    print(f"讀取 {DATA_PATH} ...")
    df = pd.read_csv(DATA_PATH)
    data = engineer(df)

    data["churn_prob"] = churn_prob_for_bi(data, art)
    data["segment_label"] = predict_segment(data, art)

    out = data[[c for c in KEEP if c in data.columns]].copy()
    if "Churn" in out.columns:  # 新進客戶的資料還不知道有沒有流失
        out["churn_flag"] = (out["Churn"] == "Yes").astype(int)

    print(f"寫入 Postgres 表 {TABLE}（{len(out):,} 列）...")
    engine = create_engine(DB_URL)
    out.to_sql(TABLE, engine, if_exists="replace", index=False, chunksize=10000)
    print("完成。Superset 連此表即可建 dashboard。")


if __name__ == "__main__":
    main()
