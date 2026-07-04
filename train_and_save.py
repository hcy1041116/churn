"""訓練 LightGBM churn 模型並存檔（模型 + 特徵順序 + 分群器）。
供 Streamlit app 載入做即時預測。"""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd, joblib, json
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import roc_auc_score
import lightgbm as lgb

RS = 42
df = pd.read_csv('train.csv')
print('raw', df.shape)

# ---- 特徵工程（與 notebook 一致）----
def engineer(d):
    d = d.copy()
    d['TotalCharges'] = pd.to_numeric(d['TotalCharges'], errors='coerce')
    d['TotalCharges'] = d['TotalCharges'].fillna(d['TotalCharges'].median())
    d['avg_monthly_spend'] = d['TotalCharges'] / d['tenure'].clip(lower=1)
    addon = ['OnlineSecurity','OnlineBackup','DeviceProtection','TechSupport','StreamingTV','StreamingMovies']
    d['num_addons'] = (d[addon] == 'Yes').sum(axis=1)
    return d

data = engineer(df)
y = (data['Churn'] == 'Yes').astype(int)
feat = data.drop(columns=['id','Churn'])
num_cols = feat.select_dtypes(include='number').columns.tolist()
cat_cols = [c for c in feat.columns if c not in num_cols]
X = pd.get_dummies(feat, columns=cat_cols, drop_first=True).astype(float)
FEATURE_ORDER = X.columns.tolist()
print('features', len(FEATURE_ORDER))

# ---- 訓練 + CV ----
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=RS, stratify=y)
model = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=31,
                           subsample=0.9, colsample_bytree=0.9, random_state=RS, verbose=-1)
model.fit(Xtr, ytr)
auc = roc_auc_score(yte, model.predict_proba(Xte)[:,1])
cv = cross_val_score(model, X.sample(80000, random_state=RS), y.loc[X.sample(80000, random_state=RS).index],
                     cv=StratifiedKFold(5, shuffle=True, random_state=RS), scoring='roc_auc')
print(f'holdout AUC {auc:.4f} | 5-fold {cv.mean():.4f} +/- {cv.std():.4f}')

# ---- 分群器（KMeans on 標準化行為特徵）----
seg_cols = ['tenure','MonthlyCharges','TotalCharges','num_addons']
seg_scaler = StandardScaler().fit(data[seg_cols])
km = KMeans(n_clusters=4, n_init=10, random_state=RS).fit(seg_scaler.transform(data[seg_cols]))
# 每群貼標籤
data['seg'] = km.labels_
prof = data.groupby('seg').agg(tenure=('tenure','mean'), charge=('MonthlyCharges','mean'),
                               churn=('Churn', lambda s:(s=='Yes').mean()))
med_charge = prof['charge'].median()
seg_label = {}
for s, r in prof.iterrows():
    if r['churn'] >= 0.4: seg_label[int(s)] = '高風險客'
    elif r['churn'] <= 0.05: seg_label[int(s)] = '超穩定低風險客'
    elif r['charge'] >= med_charge: seg_label[int(s)] = '高價值客'
    else: seg_label[int(s)] = '一般客'
print('segments', seg_label)

# ---- 存檔 ----
joblib.dump(model, 'model_lgbm.joblib')
joblib.dump(seg_scaler, 'seg_scaler.joblib')
joblib.dump(km, 'kmeans.joblib')
meta = dict(feature_order=FEATURE_ORDER, seg_cols=seg_cols, seg_label=seg_label,
            num_cols=num_cols, cat_cols=cat_cols,
            holdout_auc=round(auc,4), cv_auc=round(cv.mean(),4), cv_std=round(cv.std(),4),
            addon_cols=['OnlineSecurity','OnlineBackup','DeviceProtection','TechSupport','StreamingTV','StreamingMovies'])
with open('meta.json','w') as f: json.dump(meta, f, ensure_ascii=False, indent=2)

# 存原始類別欄的可選值（給 Streamlit 下拉選單用）
choices = {c: sorted(feat[c].dropna().unique().tolist()) for c in cat_cols}
with open('feature_choices.json','w') as f: json.dump(choices, f, ensure_ascii=False, indent=2)
print('saved to project root')
