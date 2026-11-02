"""export_for_tableau.py 的回歸測試：dashboard 明細的十分位、風險分級、挽留名單，以及特徵重要度。

執行（在專案根目錄）：uv run --with pytest python -m pytest -q
"""
import numpy as np
import pandas as pd
import pytest
from test_churn_features import ART, random_customers

import export_for_tableau as ex
from churn_features import ADDON_COLS, count_addons, engineer, source_column


@pytest.fixture(scope="module")
def mart():
    """模擬 build_mart 的輸出：隨機客戶 + 隨機的流失結果與預測機率。"""
    n = 3000
    rng = np.random.default_rng(1)
    m = random_customers(n, seed=1)
    m.insert(0, "id", np.arange(n))
    m["是否流失"] = rng.integers(0, 2, n)
    m["預測流失機率"] = rng.uniform(0, 1, n)
    m["客群"] = "一般客"
    m["使用月數分組"] = pd.cut(m["tenure"], ex.TENURE_BINS, labels=ex.TENURE_LABELS)
    return m


@pytest.fixture(scope="module")
def dash(mart):
    return ex.build_dashboard(mart)


def test_deciles_have_equal_size_and_falling_probability(dash):
    groups = dash.groupby("風險十分位")
    sizes = groups.size()
    assert len(sizes) == 10 and sizes.max() - sizes.min() <= 1
    assert groups["預測流失機率"].mean().is_monotonic_decreasing  # 第01組機率最高


def test_risk_tiers_follow_cut_points(dash):
    p = dash["預測流失機率"]
    assert (dash.loc[p >= 0.5, "風險等級"] == "高風險（≥50%）").all()
    assert (dash.loc[(p >= 0.2) & (p < 0.5), "風險等級"] == "中風險（20–50%）").all()
    assert (dash.loc[p < 0.2, "風險等級"] == "低風險（<20%）").all()
    assert (dash["高風險人數"] == (dash["風險等級"] == "高風險（≥50%）")).all()
    assert dash.groupby("風險等級")["等級排序"].first().to_dict() == {"高風險（≥50%）": 1, "中風險（20–50%）": 2, "低風險（<20%）": 3}


def test_retention_list_is_top_retained_customers_per_contract(dash):
    on_list = dash[dash["挽留名單"] == "是"]
    assert (on_list["狀態"] == "留存").all()
    assert (on_list.groupby("合約類型").size() == ex.TOP_PER_CONTRACT).all()
    retained = dash[dash["狀態"] == "留存"]
    for contract, g in retained.groupby("合約類型"):
        cutoff = on_list.loc[on_list["合約類型"] == contract, "預測流失機率"].min()
        assert (g.loc[g["挽留名單"] == "否", "預測流失機率"] <= cutoff).all()


def test_addon_count_matches_engineer(mart, dash):
    assert (count_addons(mart) == engineer(mart.assign(Churn="No"))["num_addons"]).all()
    assert (dash["加值服務數"] == (mart[ADDON_COLS] == "Yes").sum(axis=1).astype(str) + " 項").all()


@pytest.mark.parametrize("feature, expected", [
    ("Contract_Two year", "Contract"),
    ("MultipleLines_No phone service", "MultipleLines"),
    ("avg_monthly_spend", "avg_monthly_spend"),
    ("tenure", "tenure"),
])
def test_source_column(feature, expected):
    assert source_column(feature, ART["levels"]) == expected


def test_feature_importance_covers_every_input_column():
    imp = ex.feature_importance(ART)
    assert len(imp) == len(ART["meta"]["input_cols"])
    assert imp["特徵"].notna().all()
    assert imp["重要度"].sum() == pytest.approx(1.0)
