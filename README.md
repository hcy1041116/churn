# Customer Churn — 預測 App + BI Dashboard

電信客戶流失（churn）的**端到端 DS/DE 專案**：從資料分析、建模，到即時預測 App 與 BI 儀表板部署。
資料來源：[Kaggle Playground Series S6E3](https://www.kaggle.com/competitions/playground-series-s6e3)（合成資料，約 59.4 萬列）。

> **模型選擇說明**：notebook 比較的 boosting 模型 AUC 幾乎相同（GradientBoosting 0.916、HistGB 0.916、LightGBM 0.916；Logistic Regression 0.912），差距在交叉驗證的標準差內。
> 選用 **LightGBM**，理由是在此資料規模下訓練更快、記憶體更省，並非效能顯著較優。

---

## 架構

```
                      churn_features.py（共用的特徵工程與編碼，所有程式都 import 它）

train.csv ─► train_and_save.py ─┬─► model_lgbm.joblib / seg_scaler.joblib / kmeans.joblib
                                │   meta.json / feature_choices.json ──────────► app.py（Streamlit 即時預測）
                                └─► oof_predictions.csv（交叉驗證的流失機率）
                                          │
                 ┌────────────────────────┴───────────────────────┐
                 ▼                                                ▼
       export_for_tableau.py                              load_to_postgres.py
       tableau/churn_dashboard.csv ─► Tableau Public       Postgres churn_analytics ─► Superset
       tableau/churn_mart.csv ─► Power BI（ChurnBI/）
```

- **Streamlit**：把模型包成可互動的產品，一次預測一位客戶。
- **BI（Tableau / Power BI / Superset）**：讀同一份流失機率與客群標籤，做流失趨勢和客群報表。

---

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `churn_da_ds.ipynb` / `.html` | DA + DS 全流程分析筆記：EDA、洩漏檢查、多模型比較、分群演算法比較（模型選型過程紀錄） |
| `churn_features.py` | 共用模組：特徵工程、one-hot 編碼（固定類別清單）、載入模型、評分。所有程式都用它，確保處理方式一致 |
| `train_and_save.py` | 5 折交叉驗證、用全部資料訓練最終 LightGBM、KMeans 分群，輸出模型檔與 `oof_predictions.csv` |
| `app.py` | Streamlit 即時預測介面 |
| `export_for_tableau.py` | 輸出到 `tableau/`：Power BI 讀的明細 `churn_mart.csv`、Tableau dashboard 用的明細 `churn_dashboard.csv`（所有互動圖表共用，才能連動）、特徵重要度、資料檢核表 |
| `load_to_postgres.py` | 把明細、流失機率、客群標籤寫進 Postgres 的 `churn_analytics` 表，供 Superset 使用 |
| `tests/` | 回歸測試：一位客戶和一整批的編碼、預測必須一致；app 改合約後機率要跟著變 |
| `tableau/TABLEAU_GUIDE.md` | Tableau dashboard 的檔案說明與設計決定；逐步操作在圖解指南（`tableau/guide/`） |
| `tableau/guide/` | Tableau 圖解指南的原始檔（`index.html` + `app.js`；`data.js` 由 `make_data.py` 產生） |
| `ChurnBI/` | Power BI 專案（.pbip），資料來源是 `tableau/churn_mart.csv` |
| `model_lgbm.joblib` | 最終 LightGBM 模型（用全部資料訓練） |
| `kmeans.joblib` / `seg_scaler.joblib` | KMeans 分群器與其標準化器 |
| `meta.json` | 特徵順序、客群標籤、交叉驗證指標 |
| `feature_choices.json` | 各類別欄的可選值：編碼時的固定類別清單，也是 app 下拉選單的選項 |
| `oof_predictions.csv` | 每位客戶的 out-of-fold 流失機率（不進 git，用 `train_and_save.py` 重新產生） |
| `Dockerfile` / `railway.json` / `pyproject.toml` / `uv.lock` | 部署設定 |

模型指標：**5 折交叉驗證 AUC 0.916 ± 0.001**（全部 59.4 萬列），Brier score 0.095。
分群驗證：各客群「平均預測機率」與「實際流失率」幾乎一致（高風險客 46.7% vs 46.8%，超穩定低風險客 1.14% vs 1.15%），而且用的是樣本外的 out-of-fold 機率 → 模型在群層級校準良好。

---

## 本機執行

```bash
uv sync

# 訓練模型（需要 train.csv 在同目錄）：產生模型檔與 oof_predictions.csv
uv run train_and_save.py

# 測試
uv run --with pytest python -m pytest -q

# 啟動預測 App
uv run streamlit run app.py
```

打開 http://localhost:8501 ，輸入客戶特徵即可看到流失機率、所屬客群與挽留建議。

---

## 部署

### A. Streamlit App（Railway）

1. 把本資料夾推上 GitHub。
2. Railway → New Project → Deploy from GitHub repo，選此 repo。
3. Railway 會自動讀 `Dockerfile` 建置。`$PORT` 已在 Dockerfile 處理，無需額外設定。
4. 部署完成後在 Settings → Networking 產生公開網址。

### B. Tableau Public

1. 本機依序執行 `uv run train_and_save.py`、`uv run export_for_tableau.py`（需要 `train.csv`），在 `tableau/` 產生 dashboard 用的明細、特徵重要度和資料檢核表。
2. 依圖解指南（說明見 [`tableau/TABLEAU_GUIDE.md`](tableau/TABLEAU_GUIDE.md)）做 19 張工作表，組成「總覽 / 流失因子 / 客群 / 風險名單 / 模型驗證 / 資料檢核」6 個連動的儀表板，發布到 Tableau Public。

### C. Power BI

1. 同 B 的第 1 步，產生 `tableau/churn_mart.csv`。
2. 用 Power BI Desktop 開 `ChurnBI/ChurnBI.pbip`，把參數 `CsvPath` 改成 `churn_mart.csv` 的完整路徑，重新整理。
   Power Query 會把中文欄名（是否流失、預測流失機率、客群、使用月數分組）改成報表用的 `churn_flag`、`churn_prob`、`segment_label`、`tenure_group`。

### D. Postgres + Superset

1. 先執行 `uv run train_and_save.py`。
2. 設定 `DATABASE_URL="postgresql://user:pass@host:port/dbname"`，執行 `uv run load_to_postgres.py`，會建立（覆蓋）表 `churn_analytics`。
3. Superset 連這張表建 dashboard。

---

## 設計決策

- **不平衡指標**：22.5% 流失，用 AUC / PR-AUC 而非 accuracy（全猜不流失也有 77.5% accuracy 但抓 0 個流失客）。
- **無資料洩漏**：單欄 AUC 最高僅 0.79（tenure），拔掉後整體 AUC 幾乎不變 → 靠多訊號疊加，非單欄作弊。
- **模型選擇**：LightGBM 非因效能顯著較優，而是同等 AUC 下訓練快、省記憶體。
- **評估與最終模型分開**：用 5 折交叉驗證報告分數，再用全部資料訓練最終模型。BI 上的流失機率用交叉驗證的 out-of-fold 機率，每位客戶的機率都來自沒看過他的模型，所以「預測 vs 實際」的校準表是樣本外的。
- **訓練和預測只有一套處理**：特徵工程與編碼集中在 `churn_features.py`。one-hot 用訓練時的固定類別清單，一位客戶或一整批編出來的欄位完全相同；遇到沒看過的類別直接報錯。`tests/` 鎖住這個行為。
- **缺值規則**：TotalCharges 缺值時用「在網月數 × 月費」補（資料中兩者的中位數比值為 1.00、相關係數 0.99）；剛加入的客戶補出來是 0，而不是全體中位數。
- **個體機率不高≠模型無用**：合成資料個體機率不會飆高，重點是**相對排序**（AUC 評估的正是排序能力）與群層級校準。
- **分群前標準化**：KMeans 靠距離，不標準化時 TotalCharges 佔總變異 99.97%，分群會退化成只切 TotalCharges。

---

*資料為 Kaggle 合成資料，僅供技能展示；預測數字不代表真實客戶行為。*
