"""
Customer Churn — 即時預測 Streamlit App
輸入單一客戶特徵 → LightGBM 回傳流失機率 + KMeans 客群 + 挽留建議。

本機執行：streamlit run app.py
"""
import pandas as pd
import streamlit as st

from churn_features import engineer, load_artifacts, predict_churn, predict_segment

st.set_page_config(page_title="Customer Churn 預測", page_icon="📉", layout="wide")

# ---------------------------------------------------------------
# 載入模型與中繼資料（快取，避免每次互動重載）
# ---------------------------------------------------------------
@st.cache_resource
def get_artifacts():
    return load_artifacts()


art = get_artifacts()
meta = art["meta"]
CHOICES = art["levels"]


# ---------------------------------------------------------------
# 一位客戶的原始輸入 → 流失機率與客群（跟訓練、批次評分走同一套處理）
# ---------------------------------------------------------------
def score(raw: dict):
    data = engineer(pd.DataFrame([raw]))
    prob = float(predict_churn(data, art)[0])
    segment = predict_segment(data, art).iloc[0]
    return prob, segment, int(data["num_addons"].iloc[0])


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
    f"LightGBM｜5 折交叉驗證 AUC {meta['cv_auc']} ± {meta['cv_std']}"
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

raw = {
    "SeniorCitizen": SeniorCitizen, "tenure": tenure, "MonthlyCharges": MonthlyCharges,
    "TotalCharges": TotalCharges, "gender": gender, "Partner": Partner, "Dependents": Dependents,
    "PhoneService": PhoneService, "MultipleLines": MultipleLines, "InternetService": InternetService,
    "OnlineSecurity": OnlineSecurity, "OnlineBackup": OnlineBackup, "DeviceProtection": DeviceProtection,
    "TechSupport": TechSupport, "StreamingTV": StreamingTV, "StreamingMovies": StreamingMovies,
    "Contract": Contract, "PaperlessBilling": PaperlessBilling, "PaymentMethod": PaymentMethod,
}

with right:
    st.subheader("預測結果")
    prob, segment, num_addons = score(raw)

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
    "模型選擇：notebook 比較中 GradientBoosting、HistGB、LightGBM 的 AUC 都約 0.916（差距在 CV 標準差內），選 LightGBM 是因為訓練更快、記憶體更省，適合此資料規模。"
)
