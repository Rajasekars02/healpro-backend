import os
import json
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.datasets import fetch_openml
from sklearn.model_selection import (
    train_test_split,
    GridSearchCV,
    StratifiedKFold,
    RepeatedStratifiedKFold,
    cross_val_score,
)
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score
import joblib

# Ensure models directory exists
os.makedirs("models", exist_ok=True)


def fetch_openml_cached(data_id, cache_path):
    if os.path.exists(cache_path):
        return pd.read_csv(cache_path)

    dataset = fetch_openml(data_id=data_id, as_frame=True)
    if getattr(dataset, "frame", None) is not None:
        df = dataset.frame.copy()
    else:
        df = pd.concat([dataset.data, dataset.target], axis=1)

    df.to_csv(cache_path, index=False)
    return df


def load_diabetes_dataset():
    local_path = "Datasets/diabetes.csv"
    external_path = "Datasets/external_diabetes.csv"
    try:
        # Use the standard Pima Indians Diabetes dataset from OpenML (ID 37).
        # This is the most accurate accessible binary diabetes classification dataset
        # for the current application format.
        df = fetch_openml_cached(37, external_path)
        df = df.rename(
            columns={
                "preg": "Pregnancies",
                "plas": "Glucose",
                "pres": "BloodPressure",
                "skin": "SkinThickness",
                "insu": "Insulin",
                "mass": "BMI",
                "pedi": "DiabetesPedigreeFunction",
                "age": "Age",
                "class": "Outcome",
            }
        )
        df["Outcome"] = df["Outcome"].map({"tested_positive": 1, "tested_negative": 0})
        df = df[
            [
                "Pregnancies",
                "Glucose",
                "BloodPressure",
                "SkinThickness",
                "Insulin",
                "BMI",
                "DiabetesPedigreeFunction",
                "Age",
                "Outcome",
            ]
        ]
        print("Loaded external diabetes dataset from OpenML (Pima Indians Diabetes dataset, ID 37).")
    except Exception as e:
        print(f"Could not load external diabetes dataset from OpenML: {e}. Falling back to local {local_path}")
        df = pd.read_csv(local_path)
    return df


def load_diabetic_mellitus_dataset():
    local_path = "Datasets/diabetic_mellitus.csv"
    external_path = "Datasets/external_diabetic_mellitus.csv"
    try:
        df = fetch_openml_cached(41430, external_path)
        df = df.rename(
            columns={
                "AGE": "Age",
                "GLU": "Glucose",
                "DBP": "BloodPressure",
                "BMI": "BMI",
                "TYPE": "Outcome",
            }
        )
        df["Outcome"] = df["Outcome"].astype(str).map({"1": 1, "0": 0})
        df = df[["Age", "Glucose", "BloodPressure", "BMI", "Outcome"]]
        print("Loaded alternate diabetes dataset from OpenML (DiabeticMellitus, ID 41430).")
    except Exception as e:
        print(f"Could not load alternate diabetes dataset from OpenML: {e}.")
        df = None
    return df


def load_heart_dataset():
    local_path = "Datasets/Heart_disease_cleveland_new.csv"
    external_path = "Datasets/external_heart.csv"
    try:
        df = fetch_openml_cached(53, external_path)
        df = df.rename(
            columns={
                "chest": "cp",
                "resting_blood_pressure": "trestbps",
                "serum_cholestoral": "chol",
                "fasting_blood_sugar": "fbs",
                "resting_electrocardiographic_results": "restecg",
                "maximum_heart_rate_achieved": "thalach",
                "exercise_induced_angina": "exang",
                "number_of_major_vessels": "ca",
                "class": "target",
            }
        )
        df["target"] = df["target"].map({"present": 1, "absent": 0})
        df = df[
            [
                "age",
                "sex",
                "cp",
                "trestbps",
                "chol",
                "fbs",
                "restecg",
                "thalach",
                "exang",
                "oldpeak",
                "slope",
                "ca",
                "thal",
                "target",
            ]
        ]
        print("Loaded external heart dataset from OpenML.")
    except Exception as e:
        print(f"Could not load external heart dataset from OpenML: {e}. Falling back to local {local_path}")
        df = pd.read_csv(local_path)
    return df


def tune_random_forest(X_train, y_train, param_grid):
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    grid_search = GridSearchCV(
        RandomForestClassifier(random_state=42),
        param_grid,
        scoring="accuracy",
        cv=cv,
        n_jobs=-1,
        verbose=0,
        refit=True,
    )
    grid_search.fit(X_train, y_train)
    return grid_search.best_estimator_, grid_search.best_params_, grid_search.best_score_


def build_diabetes_classifier(X_train, y_train, cv):
    """Train a tuned histogram gradient boosting classifier for diabetes prediction."""
    clf = HistGradientBoostingClassifier(random_state=42)
    param_grid = {
        "max_iter": [200, 300, 400],
        "learning_rate": [0.01, 0.05, 0.1],
        "max_leaf_nodes": [15, 31, 63],
    }
    
    grid_search = GridSearchCV(
        clf,
        param_grid,
        scoring="accuracy",
        cv=cv,
        n_jobs=-1,
        verbose=0,
        refit=True,
    )
    grid_search.fit(X_train, y_train)
    return grid_search.best_estimator_, grid_search.best_params_, grid_search.best_score_


def evaluate_final_model(estimator, X, y, X_test, y_test):
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=3, random_state=42)
    cv_scores = cross_val_score(estimator, X, y, cv=cv, scoring="accuracy", n_jobs=-1)
    test_accuracy = accuracy_score(y_test, estimator.predict(X_test))
    return cv_scores.mean(), cv_scores.std(), test_accuracy


def train_diabetes():
    print("Training Diabetes Model...")
    df = load_diabetes_dataset()
    
    # Impute zeros with median for columns where 0 is invalid
    impute_cols = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI']
    medians = {}
    for col in impute_cols:
        df[col] = df[col].replace(0, np.nan)
        median_val = float(df[col].median())
        medians[col] = median_val
        df[col] = df[col].fillna(median_val)
        
    # Standard columns
    feature_cols = ['Pregnancies', 'Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Age']
    for col in feature_cols:
        if col not in medians:
            medians[col] = float(df[col].median() if not pd.isna(df[col].median()) else 0)
            df[col] = df[col].fillna(medians[col])
            
    X = df[feature_cols]
    y = df["Outcome"]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Use a stronger tuned gradient boosting classifier for diabetes prediction
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    best_clf, best_params, cv_accuracy = build_diabetes_classifier(X_train, y_train, cv)
    cv_mean, cv_std, test_accuracy = evaluate_final_model(best_clf, X, y, X_test, y_test)
    final_clf = clone(best_clf).fit(X, y)

    joblib.dump(final_clf, "models/diabetes_model.pkl")
    # Remove scaler dump since we're not using scaling anymore
    with open("models/diabetes_config.json", "w") as f:
        json.dump({"features": feature_cols, "medians": medians}, f, indent=4)
    print(
        f"Diabetes model tuned and saved successfully. "
        f"Grid CV score: {cv_accuracy*100:.2f}%. "
        f"Repeated CV mean: {cv_mean*100:.2f}% ± {cv_std*100:.2f}%. "
        f"Test accuracy: {test_accuracy*100:.2f}%. Best params: {best_params}"
    )


def train_diabetes_alternate():
    print("Training Alternate Diabetes Model...")
    df = load_diabetic_mellitus_dataset()
    if df is None:
        print("Skipping alternate diabetes training because the dataset could not be loaded.")
        return

    feature_cols = ["Age", "Glucose", "BloodPressure", "BMI"]
    medians = {}
    for col in feature_cols:
        medians[col] = float(df[col].median() if not pd.isna(df[col].median()) else 0)
        df[col] = df[col].fillna(medians[col])

    X = df[feature_cols]
    y = df["Outcome"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    best_clf, best_params, cv_accuracy = build_diabetes_classifier(X_train, y_train, cv)
    cv_mean, cv_std, test_accuracy = evaluate_final_model(best_clf, X, y, X_test, y_test)
    final_clf = clone(best_clf).fit(X, y)

    joblib.dump(final_clf, "models/diabetes_model_alt.pkl")
    with open("models/diabetes_config_alt.json", "w") as f:
        json.dump({
            "features": feature_cols,
            "medians": medians,
            "glucose_conversion_mgdl_to_mmol": 1 / 18.0,
        }, f, indent=4)
    print(
        f"Alternate diabetes model tuned and saved successfully. "
        f"Grid CV score: {cv_accuracy*100:.2f}%. "
        f"Repeated CV mean: {cv_mean*100:.2f}% ± {cv_std*100:.2f}%. "
        f"Test accuracy: {test_accuracy*100:.2f}%. Best params: {best_params}"
    )


def train_heart():
    print("Training Heart Disease Model...")
    df = load_heart_dataset()
    
    feature_cols = ['age', 'sex', 'cp', 'trestbps', 'chol', 'fbs', 'restecg', 'thalach', 'exang', 'oldpeak', 'slope', 'ca', 'thal']
    medians = {}
    for col in feature_cols:
        medians[col] = float(df[col].median() if not pd.isna(df[col].median()) else 0)
        df[col] = df[col].fillna(medians[col])
        
    X = df[feature_cols]
    y = df["target"]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [None, 6, 10],
        "min_samples_split": [2, 4],
        "max_features": ["sqrt", "log2"]
    }
    best_clf, best_params, cv_accuracy = tune_random_forest(X_train, y_train, param_grid)
    cv_mean, cv_std, test_accuracy = evaluate_final_model(best_clf, X, y, X_test, y_test)
    final_clf = clone(best_clf).fit(X, y)

    joblib.dump(final_clf, "models/heart_model.pkl")
    with open("models/heart_config.json", "w") as f:
        json.dump({"features": feature_cols, "medians": medians}, f, indent=4)
    print(
        f"Heart disease model tuned and saved successfully. "
        f"Grid CV score: {cv_accuracy*100:.2f}%. "
        f"Repeated CV mean: {cv_mean*100:.2f}% ± {cv_std*100:.2f}%. "
        f"Test accuracy: {test_accuracy*100:.2f}%. Best params: {best_params}"
    )

def train_kidney():
    print("Training Kidney Disease Model...")
    df = pd.read_csv("Datasets/kidney_disease.csv")
    
    if 'id' in df.columns:
        df = df.drop('id', axis=1)
        
    df['classification'] = df['classification'].astype(str).str.strip().str.lower()
    df['classification'] = df['classification'].replace({'ckd\t': 'ckd', 'notckd': 'notckd'})
    df['classification'] = df['classification'].map({'ckd': 1, 'notckd': 0})
    
    # Drop rows without labels
    df = df.dropna(subset=['classification'])
    
    numeric_features = ['age', 'bp', 'sg', 'al', 'su', 'bgr', 'bu', 'sc', 'sod', 'pot', 'hemo', 'pcv', 'wc', 'rc']
    categorical_features = ['rbc', 'pc', 'pcc', 'ba', 'htn', 'dm', 'cad', 'appet', 'pe', 'ane']
    
    medians = {}
    modes = {}
    cat_mappings = {}
    
    # Preprocess numeric columns
    for col in numeric_features:
        if col in df.columns:
            # Clean string numbers if any (e.g. spaces or \t)
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(r'[^\d\.]', '', regex=True), errors='coerce')
            median_val = float(df[col].median() if not pd.isna(df[col].median()) else 0)
            medians[col] = median_val
            df[col] = df[col].fillna(median_val)
            
    # Preprocess categorical columns
    for col in categorical_features:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower().replace({'?': np.nan, 'nan': np.nan})
            mode_val = str(df[col].mode()[0] if not df[col].mode().empty else 'normal')
            modes[col] = mode_val
            df[col] = df[col].fillna(mode_val)
            
            # Map categories to numbers
            unique_vals = sorted(list(df[col].unique()))
            mapping = {val: idx for idx, val in enumerate(unique_vals)}
            cat_mappings[col] = mapping
            df[col] = df[col].map(mapping)
            
    feature_cols = numeric_features + categorical_features
    X = df[feature_cols]
    y = df["classification"]
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [None, 6, 10],
        "min_samples_split": [2, 4],
        "max_features": ["sqrt", "log2"]
    }
    best_clf, best_params, cv_accuracy = tune_random_forest(X_train, y_train, param_grid)
    cv_mean, cv_std, test_accuracy = evaluate_final_model(best_clf, X, y, X_test, y_test)
    final_clf = clone(best_clf).fit(X, y)

    joblib.dump(final_clf, "models/kidney_model.pkl")
    with open("models/kidney_config.json", "w") as f:
        json.dump({
            "features": feature_cols,
            "numeric_features": numeric_features,
            "categorical_features": categorical_features,
            "medians": medians,
            "modes": modes,
            "cat_mappings": cat_mappings
        }, f, indent=4)
    print(
        f"Kidney disease model tuned and saved successfully. "
        f"Grid CV score: {cv_accuracy*100:.2f}%. "
        f"Repeated CV mean: {cv_mean*100:.2f}% ± {cv_std*100:.2f}%. "
        f"Test accuracy: {test_accuracy*100:.2f}%. Best params: {best_params}"
    )

def train_thyroid():
    print("Training Thyroid Disease Model...")
    df = pd.read_csv("Datasets/thyroidDF.csv")
    
    df['target'] = df['target'].astype(str).str.strip()
    df['target_binary'] = df['target'].apply(lambda x: 0 if x == '-' else 1)
    
    numeric_features = ['age', 'TSH', 'T3', 'TT4', 'T4U', 'FTI']
    categorical_features = [
        'sex', 'on_thyroxine', 'query_on_thyroxine', 'on_antithyroid_meds',
        'sick', 'pregnant', 'thyroid_surgery', 'I131_treatment', 'query_hypothyroid',
        'query_hyperthyroid', 'lithium', 'goitre', 'tumor', 'hypopituitary', 'psych'
    ]
    
    medians = {}
    modes = {}
    cat_mappings = {}
    
    # Preprocess numeric features
    for col in numeric_features:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(r'[^\d\.]', '', regex=True), errors='coerce')
            median_val = float(df[col].median() if not pd.isna(df[col].median()) else 0)
            medians[col] = median_val
            df[col] = df[col].fillna(median_val)
            
    # Preprocess categorical features
    for col in categorical_features:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().str.lower().replace({'?': np.nan, 'nan': np.nan})
            # fallback modes
            fallback = 'f'
            if col == 'sex':
                fallback = 'f'
            mode_val = str(df[col].mode()[0] if not df[col].mode().empty else fallback)
            modes[col] = mode_val
            df[col] = df[col].fillna(mode_val)
            
            # Map categories to numbers
            unique_vals = sorted(list(df[col].unique()))
            mapping = {val: idx for idx, val in enumerate(unique_vals)}
            cat_mappings[col] = mapping
            df[col] = df[col].map(mapping)
            
    feature_cols = numeric_features + categorical_features
    X = df[feature_cols]
    y = df['target_binary']
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    param_grid = {
        "n_estimators": [100, 200],
        "max_depth": [None, 6, 10],
        "min_samples_split": [2, 4],
        "max_features": ["sqrt", "log2"]
    }
    best_clf, best_params, cv_accuracy = tune_random_forest(X_train, y_train, param_grid)
    cv_mean, cv_std, test_accuracy = evaluate_final_model(best_clf, X, y, X_test, y_test)
    final_clf = clone(best_clf).fit(X, y)

    joblib.dump(final_clf, "models/thyroid_model.pkl")
    with open("models/thyroid_config.json", "w") as f:
        json.dump({
            "features": feature_cols,
            "numeric_features": numeric_features,
            "categorical_features": categorical_features,
            "medians": medians,
            "modes": modes,
            "cat_mappings": cat_mappings
        }, f, indent=4)
    print(
        f"Thyroid disease model tuned and saved successfully. "
        f"Grid CV score: {cv_accuracy*100:.2f}%. "
        f"Repeated CV mean: {cv_mean*100:.2f}% ± {cv_std*100:.2f}%. "
        f"Test accuracy: {test_accuracy*100:.2f}%. Best params: {best_params}"
    )

if __name__ == "__main__":
    train_diabetes()
    train_diabetes_alternate()
    train_heart()
    train_kidney()
    train_thyroid()
    print("All models successfully trained.")
