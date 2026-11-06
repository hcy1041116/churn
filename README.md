# 電信客戶流失預測與客群分析

## 專案概覽

| | |
|---|---|
| **目標** | 預測客戶流失風險，並找出挽留資源應優先投入的客群 |
| **資料** | [Kaggle Playground Series S6E3](https://www.kaggle.com/competitions/playground-series-s6e3) 電信客戶合成資料，共 594,194 筆，流失率 22.5% |
| **方法** | EDA 與統計檢定、LightGBM 流失預測、KMeans 客群分群，並以 Streamlit App 與 Tableau 儀表板呈現 |
| **成果** | 5 折交叉驗證 AUC **0.916 ± 0.001**；各客群預測與實際流失率差距皆小於 0.1 個百分點；**高風險客群占客戶數 28.5%，卻貢獻 64.3% 的流失月營收** |

![Tableau 總覽儀表板](tableau/overview.png)

---

## 主要發現

### 流失因子

| 因子 | 流失率最高 | 流失率最低 | 效果量 |
|---|---|---|---|
| 付款方式 | 電子支票 48.9% | 信用卡自動扣款 6.9% | Cramér's V 0.48 |
| 合約類型 | 月租 42.1% | 兩年約 1.0% | Cramér's V 0.47 |
| 使用月數 | 0–12 個月 49.4% | 49 個月以上 5.3% | rank-biserial r 0.59 |
| 網路服務 | 光纖 41.5% | 無網路服務 1.4% | Cramér's V 0.43 |

- 由於樣本數大，所有變數皆達顯著水準 p < 0.001，因此以效果量衡量各因子的影響程度。
- 以 gain 計算的 LightGBM 特徵重要度，前三名依序為付款方式 44%、合約類型 17%、使用月數 16%，與統計檢定結果一致。

### 客群分析

以使用月數、月費、累計費用與加值服務數，標準化後透過 KMeans 分為四群：

| 客群 | 客戶占比 | 平均使用月數 | 平均月費 | 實際流失率 | 預測流失率 | 流失月營收占比 |
|---|---|---|---|---|---|---|
| 高風險客 | 28.5% | 19.6 | $82.8 | 46.8% | 46.7% | **64.3%** |
| 一般客 | 24.0% | 10.9 | $43.7 | 26.1% | 26.1% | 20.4% |
| 高價值客 | 29.7% | 62.5 | $92.2 | 9.2% | 9.2% | 15.0% |
| 超穩定低風險客 | 17.8% | 55.2 | $24.9 | 1.15% | 1.14% | 0.4% |

### 挽留建議

- **高風險客**：貢獻 64% 的流失月營收，為首要挽留對象。可提供月租轉年約優惠，並推廣 OnlineSecurity、TechSupport 等加值服務。
- **一般客**：平均使用約 11 個月，多為新進客戶，應強化前 12 個月的客戶經營。
- **高價值客**：流失率低，但平均月費最高，單一客戶流失的損失最大，以維持服務品質為主。
- **超穩定低風險客**：流失率約 1%，無需主動挽留，資源可集中於前兩群。
- **成效驗證**：於高風險客中保留對照組，比較兩組流失率以評估挽留措施的實際效果。

---

## 專案架構

```
train.csv ─► train_and_save.py ─┬─► 模型檔 ─► app.py ─► Streamlit 即時預測
                                └─► oof_predictions.csv ─► export_for_tableau.py ─► Tableau 儀表板

churn_features.py：訓練、匯出與 App 共用的特徵工程與編碼模組
```

| 檔案 | 說明 |
|------|------|
| `churn_da_ds.ipynb` / `.html` | 分析筆記：EDA、統計檢定、資料洩漏檢查、模型比較、分群演算法比較 |
| `churn_features.py` | 共用模組：特徵工程、one-hot 編碼、模型載入與評分 |
| `train_and_save.py` | 交叉驗證、訓練最終 LightGBM 與 KMeans，輸出模型檔與 out-of-fold 預測 |
| `app.py` | Streamlit App：輸入客戶資料，回傳流失機率、所屬客群與挽留建議 |
| `export_for_tableau.py` | 輸出 Tableau 所需的客戶明細、特徵重要度與資料品質表 |
| `tests/` | 測試：單筆與批次預測一致性、未知類別處理、Tableau 匯出邏輯 |
| `model_lgbm.joblib` / `kmeans.joblib` / `seg_scaler.joblib` | 模型檔：LightGBM、KMeans 與標準化器 |
| `meta.json` / `feature_choices.json` | 模型設定：特徵順序、客群標籤、評估指標、類別欄位的可選值 |
| `Dockerfile` / `railway.json` | 部署設定 |

### Tableau 儀表板

單頁總覽儀表板，包含客戶數、流失人數、流失率、月營收與流失月營收等 KPI，合約類型、付款方式、使用月數、網路服務的流失率，以及各合約類型的流失與留存月營收。

---

## 本機執行

```bash
uv sync

# 訓練模型，需先將 train.csv 放在專案根目錄
uv run train_and_save.py

# 執行測試
uv run --with pytest python -m pytest -q

# 啟動 Streamlit App：http://localhost:8501
uv run streamlit run app.py

# 匯出 Tableau 資料至 tableau/
uv run export_for_tableau.py
```

---

## 部署至 Railway

1. 將 repo 推送至 GitHub。
2. 在 Railway 建立 New Project → Deploy from GitHub repo，選擇此 repo。
3. Railway 會依 `Dockerfile` 建置，`$PORT` 已於 Dockerfile 中設定。
4. 於 Settings → Networking 產生公開網址。

---

## 設計決策

- **評估指標**：流失率 22.5%，類別不平衡，因此以 AUC 與 PR-AUC 評估，而非 accuracy。全部預測為不流失即可達 77.5% accuracy，卻無法辨識任何流失客戶。
- **資料洩漏檢查**：單一特徵的 AUC 最高為 tenure 的 0.79，移除後整體 AUC 幾乎不變，顯示模型表現來自多項特徵的綜合訊號。
- **模型選擇**：GradientBoosting、HistGB、LightGBM 的 AUC 皆為 0.916，Logistic Regression 為 0.912，差距在交叉驗證標準差內。選用 LightGBM 是考量其在此資料規模下的訓練速度與記憶體用量。
- **評估與最終模型分離**：以 5 折交叉驗證評估表現，再以全部資料訓練最終模型。儀表板與客群分析使用 out-of-fold 預測，確保預測與實際的比較建立在樣本外結果上。
- **一致的特徵處理**：訓練、匯出與 App 共用 `churn_features.py`。one-hot 編碼採用訓練時的固定類別清單，確保單筆與批次預測一致，遇到未知類別則直接報錯，並以測試驗證此行為。
- **缺值處理**：TotalCharges 缺值以「使用月數 × 月費」補值，兩者的中位數比值為 1.00、相關係數 0.99；新客補值為 0，而非全體中位數。
- **重視排序而非絕對機率**：合成資料的個體預測機率普遍不高，因此著重模型的排序能力與群體層級的校準。
- **分群前標準化**：KMeans 以距離為基礎，未標準化時 TotalCharges 占總變異的 99.97%，分群結果將只反映 TotalCharges。
