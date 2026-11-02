"""訓練 LightGBM 流失模型與 KMeans 分群器，並存檔給 app 和 BI 使用。

1. 5 折交叉驗證：報告 AUC，並存下每位客戶的 out-of-fold 流失機率（oof_predictions.csv，給 BI 用）
2. 用全部資料訓練最終模型（給 Streamlit app 和新客戶評分用）
3. KMeans 分 4 群，依各群流失率和月費自動命名
"""
import json

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

from churn_features import (
    NON_FEATURES,
    OOF_PATH,
    SEG_COLS,
    category_levels,
    encode,
    engineer,
)

RS = 42
DATA_PATH = "train.csv"


def make_model() -> lgb.LGBMClassifier:
    return lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31,
                              colsample_bytree=0.9, random_state=RS, verbose=-1)


def cross_validate(X: pd.DataFrame, y: pd.Series):
    """5 折分層交叉驗證：回傳每折的 AUC，以及每位客戶的 out-of-fold 流失機率。"""
    oof = np.zeros(len(X))
    fold_auc = []
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=RS)
    for train_idx, test_idx in folds.split(X, y):
        fold_model = make_model().fit(X.iloc[train_idx], y.iloc[train_idx])
        oof[test_idx] = fold_model.predict_proba(X.iloc[test_idx])[:, 1]
        fold_auc.append(roc_auc_score(y.iloc[test_idx], oof[test_idx]))
    return np.array(fold_auc), oof


def label_segments(profile: pd.DataFrame) -> dict:
    """依各群流失率和平均月費取名，由上往下第一個成立的條件決定名字。"""
    med_charge = profile["charge"].median()
    labels = {}
    for seg, row in profile.iterrows():
        if row["churn"] >= 0.4:
            labels[int(seg)] = "高風險客"
        elif row["churn"] <= 0.05:
            labels[int(seg)] = "超穩定低風險客"
        elif row["charge"] >= med_charge:
            labels[int(seg)] = "高價值客"
        else:
            labels[int(seg)] = "一般客"
    if len(set(labels.values())) < len(labels):
        raise ValueError(f"有兩群拿到同一個名字，請調整命名規則：{labels}")
    return labels


def main():
    df = pd.read_csv(DATA_PATH)
    print("raw", df.shape)

    # ---- 特徵 ----
    data = engineer(df)
    y = (data["Churn"] == "Yes").astype(int)
    feat = data.drop(columns=NON_FEATURES)
    levels = category_levels(feat)
    X = encode(feat, levels)
    print("features", X.shape[1])

    # ---- 評估：5 折交叉驗證 ----
    fold_auc, oof = cross_validate(X, y)
    oof_auc, brier = roc_auc_score(y, oof), brier_score_loss(y, oof)
    print(f"5-fold AUC {fold_auc.mean():.4f} +/- {fold_auc.std():.4f} | OOF AUC {oof_auc:.4f} | Brier {brier:.4f}")
    pd.DataFrame({"id": data["id"], "churn_prob": oof.round(6)}).to_csv(OOF_PATH, index=False)

    # ---- 最終模型：評估完，用全部資料訓練 ----
    model = make_model().fit(X, y)

    # ---- 分群：標準化後 KMeans，再依各群輪廓取名 ----
    seg_scaler = StandardScaler().fit(data[SEG_COLS])
    km = KMeans(n_clusters=4, n_init=10, random_state=RS).fit(seg_scaler.transform(data[SEG_COLS]))
    profile = (data.assign(seg=km.labels_, churned=y)
                   .groupby("seg")
                   .agg(tenure=("tenure", "mean"),
                        charge=("MonthlyCharges", "mean"),
                        churn=("churned", "mean")))
    seg_label = label_segments(profile)
    print("segments", seg_label)

    # ---- 存檔 ----
    joblib.dump(model, "model_lgbm.joblib")
    joblib.dump(seg_scaler, "seg_scaler.joblib")
    joblib.dump(km, "kmeans.joblib")
    meta = {
        "input_cols": feat.columns.tolist(),   # 模型要讀的原始欄位（engineer 之後）
        "feature_order": X.columns.tolist(),   # 編碼後的欄位順序，預測時必須一樣
        "seg_cols": SEG_COLS,
        "seg_label": seg_label,                # 群編號 → 客群名稱
        "cv_auc": round(fold_auc.mean(), 4),
        "cv_std": round(fold_auc.std(), 4),
        "oof_auc": round(oof_auc, 4),
        "oof_brier": round(brier, 4),
        "n_rows": len(X),
    }
    with open("meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    # 類別欄的可選值：編碼時的固定類別清單，也是 Streamlit 下拉選單的選項
    with open("feature_choices.json", "w", encoding="utf-8") as f:
        json.dump(levels, f, ensure_ascii=False, indent=2)
    print(f"saved model / scaler / kmeans / meta / feature_choices / {OOF_PATH}")


if __name__ == "__main__":
    main()
