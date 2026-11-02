"""共用模組與 app 的回歸測試。重點：一位客戶和一整批，算出來必須完全一樣。

執行（在專案根目錄）：uv run --with pytest python -m pytest -q
需要先有 train_and_save.py 產生的模型檔。
"""
import numpy as np
import pandas as pd
import pytest

from churn_features import engineer, load_artifacts, model_input, predict_churn

ART = load_artifacts()

# 月租、光纖、電子支票、剛加入 3 個月：典型的高風險客戶
HIGH_RISK = {
    "tenure": 3, "MonthlyCharges": 95.0, "TotalCharges": 285.0, "SeniorCitizen": 0, "gender": "Female",
    "Partner": "No", "Dependents": "No", "PhoneService": "Yes", "MultipleLines": "No",
    "InternetService": "Fiber optic", "OnlineSecurity": "No", "OnlineBackup": "No", "DeviceProtection": "No",
    "TechSupport": "No", "StreamingTV": "No", "StreamingMovies": "No", "Contract": "Month-to-month",
    "PaperlessBilling": "Yes", "PaymentMethod": "Electronic check",
}


def random_customers(n: int, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    tenure = rng.integers(0, 73, n)
    monthly = rng.uniform(18, 120, n).round(2)
    cols = {c: rng.choice(values, n) for c, values in ART["levels"].items()}
    cols.update(SeniorCitizen=rng.integers(0, 2, n), tenure=tenure,
                MonthlyCharges=monthly, TotalCharges=(tenure * monthly).round(2))
    return pd.DataFrame(cols)


def test_one_customer_encodes_like_batch():
    batch = engineer(random_customers(300))
    X_batch = model_input(batch, ART)
    assert X_batch.columns.tolist() == ART["meta"]["feature_order"]
    for i in range(0, 300, 7):
        X_one = model_input(batch.iloc[[i]], ART)
        pd.testing.assert_frame_equal(X_one, X_batch.iloc[[i]])


def test_category_inputs_change_single_prediction():
    """舊版 app 單筆預測時類別欄全部失效，換合約或付款方式機率都不變。"""
    base = engineer(pd.DataFrame([HIGH_RISK]))
    p_base = predict_churn(base, ART)[0]
    assert predict_churn(base.assign(Contract="Two year"), ART)[0] < p_base - 0.2
    assert predict_churn(base.assign(PaymentMethod="Credit card (automatic)"), ART)[0] < p_base - 0.05


def test_extra_columns_are_ignored():
    """評分後資料多了別的欄（例如 churn_prob、客群名稱），也不能被當成特徵。"""
    data = engineer(random_customers(5))
    extra = data.assign(churn_prob=0.5, segment_label="高風險客")
    pd.testing.assert_frame_equal(model_input(extra, ART), model_input(data, ART))


@pytest.mark.parametrize("bad", ["Three year", None])
def test_unknown_or_missing_category_raises(bad):
    data = engineer(random_customers(3))
    data.loc[0, "Contract"] = bad
    with pytest.raises(ValueError, match="Contract"):
        model_input(data, ART)


def test_engineer_fills_new_customer_and_keeps_input():
    raw = random_customers(2)
    raw.loc[0, ["tenure", "TotalCharges"]] = [0, np.nan]
    data = engineer(raw)
    assert data.loc[0, "TotalCharges"] == 0
    assert data.loc[0, "avg_monthly_spend"] == 0
    assert np.isnan(raw.loc[0, "TotalCharges"]) and "num_addons" not in raw


def test_app_contract_changes_prediction():
    """端到端：在 Streamlit app 裡把合約從月租改成兩年約，顯示的機率要下降。"""
    from streamlit.testing.v1 import AppTest

    at = AppTest.from_file("../app.py", default_timeout=60).run()
    assert not at.exception
    before = float(at.metric[0].value.rstrip("%"))
    next(s for s in at.selectbox if s.label.startswith("合約")).select("Two year").run()
    after = float(at.metric[0].value.rstrip("%"))
    assert after < before - 5
