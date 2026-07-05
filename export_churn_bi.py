"""
把 train.csv 轉成給 Power BI 用的乾淨分析資料集 churn_bi.csv。
含 LightGBM 流失機率預測（churn_prob）與 KMeans 客群標籤（segment_label）。
"""
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb

RS = 42
DATA_PATH = "train.csv"
OUT_PATH = "churn_bi.csv"

df = pd.read_csv(DATA_PATH)
print(f"讀取 {DATA_PATH}：{df.shape[0]:,} 列 × {df.shape[1]} 欄")

# ---- 1. 資料清理與缺失檢查 ----
df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")

print("\n=== 缺失值檢查（各欄缺失數量）===")
nulls = df.isnull().sum()
nulls = nulls[nulls > 0]
if nulls.empty:
    print("無缺失值，不需插補。")
else:
    print(nulls)
    print(
        "偵測到缺失值：本腳本不預設補值。請先判斷缺失機制"
        "（MCAR / MAR / MNAR）再決定插補策略；下游計算會保留 NaN，"
        "不會靠平均數/中位數靜默填補。"
    )

dup_count = df.duplicated().sum()
print(f"\n重複列數量：{dup_count}")

# ---- 2. 衍生特徵 ----
df["avg_monthly_spend"] = df["TotalCharges"] / df["tenure"].clip(lower=1)

addon_cols = ["OnlineSecurity", "OnlineBackup", "DeviceProtection",
              "TechSupport", "StreamingTV", "StreamingMovies"]
df["num_addons"] = (df[addon_cols] == "Yes").sum(axis=1)

df["tenure_group"] = pd.cut(
    df["tenure"], bins=[-1, 12, 24, 48, 72],
    labels=["0-12", "13-24", "25-48", "49-72"],
)

df["churn_flag"] = (df["Churn"] == "Yes").astype(int)

# ---- 3. 流失預測（LightGBM，one-hot 只用於訓練，不輸出稀疏欄）----
feat = df.drop(columns=["id", "Churn", "churn_flag"])
num_cols = feat.select_dtypes(include="number").columns.tolist()
cat_cols = [c for c in feat.columns if c not in num_cols]
X = pd.get_dummies(feat, columns=cat_cols, drop_first=True).astype(float)
y = df["churn_flag"]

Xtr, Xte, ytr, yte = train_test_split(
    X, y, test_size=0.2, random_state=RS, stratify=y
)
model = lgb.LGBMClassifier(
    n_estimators=400, learning_rate=0.05, num_leaves=31,
    subsample=0.9, colsample_bytree=0.9, random_state=RS, verbose=-1,
)
model.fit(Xtr, ytr)
auc = roc_auc_score(yte, model.predict_proba(Xte)[:, 1])
print(f"\n模型 holdout AUC：{auc:.4f}")

df["churn_prob"] = model.predict_proba(X)[:, 1]

# ---- 4. 客群分群（KMeans，標準化後對 4 個行為特徵分群）----
seg_cols = ["tenure", "MonthlyCharges", "TotalCharges", "num_addons"]
seg_mask = df[seg_cols].notna().all(axis=1)
if (~seg_mask).sum() > 0:
    print(f"\n分群略過 {(~seg_mask).sum()} 列缺失資料（不插補、不硬分群）。")

scaler = StandardScaler().fit(df.loc[seg_mask, seg_cols])
km = KMeans(n_clusters=4, n_init=10, random_state=RS)
labels = km.fit_predict(scaler.transform(df.loc[seg_mask, seg_cols]))

df["segment"] = pd.Series(pd.NA, index=df.index, dtype="Int64")
df.loc[seg_mask, "segment"] = labels

profile = df.loc[seg_mask].groupby("segment").agg(
    churn_rate=("churn_flag", "mean"),
    avg_charge=("MonthlyCharges", "mean"),
)
med_charge = profile["avg_charge"].median()
seg_label_map = {}
for seg, row in profile.iterrows():
    if row["churn_rate"] >= 0.4:
        seg_label_map[seg] = "高風險客"
    elif row["churn_rate"] <= 0.05:
        seg_label_map[seg] = "超穩定低風險客"
    elif row["avg_charge"] >= med_charge:
        seg_label_map[seg] = "高價值客"
    else:
        seg_label_map[seg] = "一般客"

df["segment_label"] = df["segment"].map(seg_label_map)

# ---- 5. 輸出欄位（保留原始類別欄，不輸出 one-hot 稀疏欄）----
keep_cols = [
    "id", "gender", "SeniorCitizen", "Partner", "Dependents",
    "tenure", "tenure_group", "PhoneService", "MultipleLines", "InternetService",
    "OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport",
    "StreamingTV", "StreamingMovies", "Contract", "PaperlessBilling",
    "PaymentMethod", "MonthlyCharges", "TotalCharges", "avg_monthly_spend",
    "num_addons", "churn_flag", "churn_prob", "segment_label",
]
out = df[keep_cols].copy()
out.to_csv(OUT_PATH, index=False, encoding="utf-8-sig")
print(f"\n已輸出 {OUT_PATH}：{out.shape[0]:,} 列 × {out.shape[1]} 欄")

# ---- 6. 驗證：各客群數量／平均 churn_prob／平均 churn_flag ----
print("\n=== 各客群驗證（數量／平均 churn_prob／平均 churn_flag）===")
summary = out.groupby("segment_label", dropna=False).agg(
    n=("segment_label", "size"),
    avg_churn_prob=("churn_prob", "mean"),
    avg_churn_flag=("churn_flag", "mean"),
).round(4)
print(summary)
