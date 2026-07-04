"""
Customer Churn — 即時預測 Streamlit App
輸入單一客戶特徵 → LightGBM 回傳流失機率 + KMeans 客群 + 挽留建議。

本機執行：streamlit run app.py
"""
import json
import joblib
import numpy as np
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Customer Churn 預測", page_icon="📉", layout="wide")

# ---------------------------------------------------------------
# 載入模型與中繼資料（快取，避免每次互動重載）
# ---------------------------------------------------------------
@st.cache_resource
def load_artifacts():
    model = joblib.load("model_lgbm.joblib")
    seg_scaler = joblib.load("seg_scaler.joblib")
    kmeans = joblib.load("kmeans.joblib")
    with open("meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    with open("feature_choices.json", encoding="utf-8") as f:
        choices = json.load(f)
    return model, seg_scaler, kmeans, meta, choices


model, seg_scaler, kmeans, meta, CHOICES = load_artifacts()
FEATURE_ORDER = meta["feature_order"]
ADDON_COLS = meta["addon_cols"]
SEG_COLS = meta["seg_cols"]
SEG_LABEL = {int(k): v for k, v in meta["seg_label"].items()}


# ---------------------------------------------------------------
# 把使用者的原始輸入 → 模型要的特徵向量（與訓練時 one-hot 完全對齊）
# ---------------------------------------------------------------
def build_feature_row(raw: dict) -> pd.DataFrame:
    # 1) 衍生特徵（與 train_and_save.py 一致）
    tenure = max(raw["tenure"], 0)
    total = raw["TotalCharges"]
    avg_monthly_spend = total / max(tenure, 1)
    num_addons = sum(1 for c in ADDON_COLS if raw[c] == "Yes")

    # 2) 組一列原始 DataFrame，再用 get_dummies，最後 reindex 對齊訓練欄位
    row = {
        "SeniorCitizen": raw["SeniorCitizen"],
        "tenure": tenure,
        "MonthlyCharges": raw["MonthlyCharges"],
        "TotalCharges": total,
        "avg_monthly_spend": avg_monthly_spend,
        "num_addons": num_addons,
    }
    # 類別欄照原值放入
    for c in CHOICES:
        row[c] = raw[c]

    df = pd.DataFrame([row])
    cat_cols = list(CHOICES.keys())
    df = pd.get_dummies(df, columns=cat_cols, drop_first=True)
    # reindex：訓練時有、這裡沒有的欄補 0；多的丟掉；順序對齊
    df = df.reindex(columns=FEATURE_ORDER, fill_value=0).astype(float)
    return df, num_addons


def predict_segment(raw: dict, num_addons: int) -> str:
    seg_row = pd.DataFrame([{
        "tenure": raw["tenure"],
        "MonthlyCharges": raw["MonthlyCharges"],
        "TotalCharges": raw["TotalCharges"],
        "num_addons": num_addons,
    }])[SEG_COLS]
    seg = int(kmeans.predict(seg_scaler.transform(seg_row))[0])
    return SEG_LABEL.get(seg, f"群{seg}")


def retention_advice(prob: float, segment: str, raw: dict) -> list:
    tips = []
    if prob >= 0.6:
        tips.append("🔴 高流失風險 → 優先介入：專員致電 + 綁約優惠。")
    elif prob >= 0.3:
        tips.append("🟠 中度風險 → 主動關懷、推加值服務提高黏著。")
    else:
        tips.append("🟢 低風險 → 維持現狀，可嘗試升級銷售。")

    if raw["Contract"] == "Month-to-month":
        tips.append("合約為月租型（高風險特徵）→ 提供年約折扣鼓勵長約。")
    if raw["PaymentMethod"] == "Electronic check":
        tips.append("付款方式為電子支票（高流失族群）→ 引導改自動扣款。")
    if raw["TechSupport"] == "No" or raw["OnlineSecurity"] == "No":
        tips.append("未訂購 TechSupport / OnlineSecurity → 推黏著型加值服務。")
    if raw["tenure"] <= 12:
        tips.append("在網未滿一年 → 新客留存關鍵期，加強前期體驗。")
    return tips


# ---------------------------------------------------------------
# 版面
# ---------------------------------------------------------------
st.title("📉 電信客戶流失預測")
st.caption(
    f"LightGBM｜holdout AUC {meta['holdout_auc']}｜5-fold {meta['cv_auc']} ± {meta['cv_std']}"
    "　·　資料：Kaggle Playground S6E3（合成資料）"
)

left, right = st.columns([1, 1])

with left:
    st.subheader("客戶資料輸入")
    c1, c2 = st.columns(2)
    with c1:
        tenure = st.slider("在網月數 tenure", 0, 72, 12)
        MonthlyCharges = st.slider("月費 MonthlyCharges", 0.0, 130.0, 70.0)
        TotalCharges = st.number_input("累計費用 TotalCharges", 0.0, 10000.0,
                                       float(tenure * MonthlyCharges))
        SeniorCitizen = 1 if st.selectbox("敬老客戶 SeniorCitizen", ["否", "是"]) == "是" else 0
        gender = st.selectbox("性別 gender", CHOICES["gender"])
        Partner = st.selectbox("有伴侶 Partner", CHOICES["Partner"])
        Dependents = st.selectbox("有扶養 Dependents", CHOICES["Dependents"])
        Contract = st.selectbox("合約 Contract", CHOICES["Contract"])
    with c2:
        PhoneService = st.selectbox("市話 PhoneService", CHOICES["PhoneService"])
        MultipleLines = st.selectbox("多線 MultipleLines", CHOICES["MultipleLines"])
        InternetService = st.selectbox("網路服務 InternetService", CHOICES["InternetService"])
        OnlineSecurity = st.selectbox("線上安全 OnlineSecurity", CHOICES["OnlineSecurity"])
        OnlineBackup = st.selectbox("線上備份 OnlineBackup", CHOICES["OnlineBackup"])
        DeviceProtection = st.selectbox("裝置保護 DeviceProtection", CHOICES["DeviceProtection"])
        TechSupport = st.selectbox("技術支援 TechSupport", CHOICES["TechSupport"])
        StreamingTV = st.selectbox("串流電視 StreamingTV", CHOICES["StreamingTV"])
        StreamingMovies = st.selectbox("串流電影 StreamingMovies", CHOICES["StreamingMovies"])
        PaperlessBilling = st.selectbox("無紙帳單 PaperlessBilling", CHOICES["PaperlessBilling"])
        PaymentMethod = st.selectbox("付款方式 PaymentMethod", CHOICES["PaymentMethod"])

raw = dict(
    SeniorCitizen=SeniorCitizen, tenure=tenure, MonthlyCharges=MonthlyCharges,
    TotalCharges=TotalCharges, gender=gender, Partner=Partner, Dependents=Dependents,
    PhoneService=PhoneService, MultipleLines=MultipleLines, InternetService=InternetService,
    OnlineSecurity=OnlineSecurity, OnlineBackup=OnlineBackup, DeviceProtection=DeviceProtection,
    TechSupport=TechSupport, StreamingTV=StreamingTV, StreamingMovies=StreamingMovies,
    Contract=Contract, PaperlessBilling=PaperlessBilling, PaymentMethod=PaymentMethod,
)

with right:
    st.subheader("預測結果")
    X_row, num_addons = build_feature_row(raw)
    prob = float(model.predict_proba(X_row)[0, 1])
    segment = predict_segment(raw, num_addons)

    st.metric("流失機率", f"{prob:.1%}")
    st.progress(min(prob, 1.0))
    st.write(f"**所屬客群**：{segment}　·　**加值服務數**：{num_addons}")

    # 相對排序說明：合成資料的個體機率不會飆很高，重點是相對高低而非絕對值
    base_rate = 0.225
    ratio = prob / base_rate
    st.caption(
        f"整體平均流失率約 {base_rate:.1%}，此客戶為平均的 **{ratio:.1f} 倍**。"
        "模型價值在於**相對排序**（優先挽留高分客戶），而非單點絕對機率——"
        "這也是評估用 AUC（排序能力）的原因。"
    )

    st.markdown("**挽留建議**")
    for tip in retention_advice(prob, segment, raw):
        st.write("- " + tip)

st.divider()
st.caption(
    "說明：本 app 載入預先訓練的 LightGBM 模型做即時推論；分群由 KMeans（標準化後）決定。"
    "模型選擇 LightGBM 而非 XGBoost，因同等 AUC 下（差距在 CV 標準差內）訓練更快、記憶體更省，適合此資料規模。"
)
