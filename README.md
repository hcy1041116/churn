# Customer Churn — 預測 App + BI Dashboard

電信客戶流失（churn）的**端到端 DS/DE 專案**：從資料分析、建模，到即時預測 App 與 BI 儀表板部署。
資料來源：[Kaggle Playground Series S6E3](https://www.kaggle.com/competitions/playground-series-s6e3)（合成資料，約 59.4 萬列）。

> **模型選擇說明**：多個 boosting 模型 AUC 幾乎相同（LightGBM / XGBoost / HistGB 皆約 0.916，差距在 5-fold CV 標準差 ±0.002 內）。
> 選用 **LightGBM**，理由是在此資料規模下訓練更快、記憶體更省，並非效能顯著較優。

---

## 架構

```
┌─────────────────┐     ┌──────────────────────┐
│  Streamlit App  │     │   Superset (BI)      │
│  即時流失預測    │     │   流失趨勢 / 客群報表  │
│  (模型互動 demo) │     │                      │
└────────┬────────┘     └──────────┬───────────┘
         │ 載入                     │ 連線查詢
         ▼                          ▼
  model_lgbm.joblib          ┌─────────────┐
  kmeans.joblib              │  Postgres   │
  seg_scaler.joblib          │ churn_      │
                             │ analytics   │
                             └──────▲──────┘
                                    │ 寫入
                          load_to_postgres.py
```

兩條線分別對應：
- **Streamlit** → 把 ML 模型包成可互動產品
- **Superset + Postgres** → 資料建模 + BI + 自架服務

---

## 檔案說明

| 檔案 | 用途 |
|------|------|
| `churn_da_ds.ipynb` / `.html` | DA + DS 全流程分析筆記：EDA、洩漏檢查、多模型比較、分群演算法比較（模型選型過程紀錄）。 |
| `train_and_save.py` | 訓練 LightGBM + KMeans，輸出模型／scaler／中繼資料 |
| `app.py` | Streamlit 即時預測介面 |
| `load_to_postgres.py` | 資料 + 預測 + 客群標籤寫入 Postgres，供 Superset 讀取 |
| `model_lgbm.joblib` | 訓練好的 LightGBM 模型 |
| `kmeans.joblib` / `seg_scaler.joblib` | KMeans 分群器與其標準化器 |
| `meta.json` | 特徵順序、客群標籤、AUC 等中繼資料 |
| `feature_choices.json` | 各類別欄的可選值（供表單下拉選單） |
| `Dockerfile` / `railway.json` / `pyproject.toml` / `uv.lock` | 部署設定 |

模型指標：**holdout AUC 0.916｜5-fold 0.914 ± 0.002**。
分群驗證：各客群「預測平均機率」與「實際流失率」幾乎一致（高風險客 0.467 vs 0.468，超穩定客 0.011 vs 0.011）→ 模型在群層級校準良好。

---

## 本機執行

```bash
uv sync

# （可選）重新訓練模型 —— 需要 train.csv 在同目錄
uv run train_and_save.py

# 啟動預測 App
uv run streamlit run app.py
```

打開 http://localhost:8501 ，輸入客戶特徵即可看到流失機率、所屬客群與挽留建議。

---

## 部署到 Railway

### A. Streamlit App（單一 service）

1. 把本資料夾推上 GitHub。
2. Railway → New Project → Deploy from GitHub repo，選此 repo。
3. Railway 會自動讀 `Dockerfile` 建置。`$PORT` 已在 Dockerfile 處理，無需額外設定。
4. 部署完成後在 Settings → Networking 產生公開網址。

### B. Postgres + 資料載入

1. Railway 專案內 → New → Database → **PostgreSQL**。
2. 複製 Postgres 的 `DATABASE_URL`（連線字串）。
3. 本機或 Railway job 執行載入（需 `train.csv`）：
   ```bash
   export DATABASE_URL="postgresql://...(從 Railway 複製)"
   python load_to_postgres.py
   ```
   完成後 Postgres 會有一張 `churn_analytics` 表。

### C. Superset（BI）

> ⚠️ Superset 較吃資源（建議連 Postgres 存 metadata；記憶體需求高於 Streamlit）。
> Railway 免費額度同時跑 Streamlit + Postgres + Superset 可能不足，必要時分批啟用或升級方案。

建議用官方 Docker 映像部署：

1. Railway → New → Empty Service，來源設為 Superset 官方映像 `apache/superset`。
2. 設定環境變數：
   - `SUPERSET_SECRET_KEY`：自訂一組隨機長字串。
   - `SQLALCHEMY_DATABASE_URI`：指向上面 Postgres（Superset 自身 metadata，可用同一個 Postgres 另建 db 或共用）。
3. 首次啟動需初始化（在 service shell 執行）：
   ```bash
   superset db upgrade
   superset fab create-admin        # 建管理員帳號
   superset init
   ```
4. 登入 Superset → Settings → Database Connections → 新增，連到步驟 B 的 Postgres。
5. Datasets → 加入 `churn_analytics` 表。
6. Charts 建以下圖表，組成 Dashboard：
   - **各客群流失率**（Bar：`segment_label` × avg `churn_flag`）
   - **合約類型流失分布**（Bar：`Contract` × avg `churn_flag`）
   - **付款方式流失分布**（Bar：`PaymentMethod` × avg `churn_flag`）
   - **tenure 分箱留存**（Histogram / Line：`tenure` × churn rate）
   - **預測機率 vs 實際**（Table：`segment_label` × avg `churn_prob` × avg `churn_flag`，展示校準）

---

## 設計決策

- **不平衡指標**：22.5% 流失，用 AUC / PR-AUC 而非 accuracy（全猜不流失也有 77.5% accuracy 但抓 0 個流失客）。
- **無資料洩漏**：單欄 AUC 最高僅 0.79（tenure），拔掉後整體 AUC 幾乎不變 → 靠多訊號疊加，非單欄作弊。
- **模型選擇**：LightGBM 非因效能顯著較優，而是同等 AUC 下訓練快、省記憶體。
- **個體機率不高≠模型無用**：合成資料個體機率不會飆高，重點是**相對排序**（AUC 評估的正是排序能力）與群層級校準。
- **分群前標準化**：KMeans 靠距離，不標準化會被數值大的欄（TotalCharges）主宰。

---

*資料為 Kaggle 合成資料，僅供技能展示；預測數字不代表真實客戶行為。*
