import os
import json
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib

app = FastAPI(title="HealPRO AI Diagnostics")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for models and configs
models = {}
configs = {}
scalers = {}

def run_training_if_needed():
    if (not os.path.exists("models/diabetes_model.pkl") or 
        not os.path.exists("models/heart_model.pkl") or 
        not os.path.exists("models/kidney_model.pkl") or 
        not os.path.exists("models/thyroid_model.pkl")):
        print("Model files missing. Running training script...")
        import train_models
        # Train only the Pima-based diabetes model (no alternate dataset)
        train_models.train_diabetes()
        train_models.train_heart()
        train_models.train_kidney()
        train_models.train_thyroid()

run_training_if_needed()

# Load models and configs
try:
    models['diabetes'] = joblib.load("models/diabetes_model.pkl")
    models['heart'] = joblib.load("models/heart_model.pkl")
    models['kidney'] = joblib.load("models/kidney_model.pkl")
    models['thyroid'] = joblib.load("models/thyroid_model.pkl")

    # Load scaler for diabetes if available (optional)
    try:
        scalers['diabetes'] = joblib.load("models/diabetes_scaler.pkl")
    except Exception:
        scalers['diabetes'] = None

    with open("models/diabetes_config.json") as f:
        configs['diabetes'] = json.load(f)
    with open("models/heart_config.json") as f:
        configs['heart'] = json.load(f)
    with open("models/kidney_config.json") as f:
        configs['kidney'] = json.load(f)
    with open("models/thyroid_config.json") as f:
        configs['thyroid'] = json.load(f)
    print("All models and configs loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")

# Load general symptom database
try:
    general_df = pd.read_csv("Datasets/dataset.csv")
    general_df['disease'] = general_df['disease'].str.strip()
    general_df['symptoms'] = general_df['symptoms'].apply(lambda x: [s.strip().lower() for s in str(x).split(',')])
    print("General symptoms dataset loaded successfully.")
except Exception as e:
    print(f"Error loading general dataset: {e}")
    general_df = pd.DataFrame()

# ----------------- Models & Endpoints Schema -----------------

class SymptomRequest(BaseModel):
    symptoms: list[str]

class DiabetesInput(BaseModel):
    pregnancies: float
    glucose: float
    bloodPressure: float
    skinThickness: float
    insulin: float
    bmi: float
    pedigree: float
    age: float

class HeartInput(BaseModel):
    age: float
    sex: float # 1 = male, 0 = female
    cp: float  # chest pain type: 0, 1, 2, 3
    trestbps: float # resting blood pressure
    chol: float # serum cholesterol
    fbs: float # fasting blood sugar > 120 (1 = true, 0 = false)
    restecg: float # resting electrocardiographic results (0, 1, 2)
    thalach: float # max heart rate achieved
    exang: float # exercise induced angina (1 = yes, 0 = no)
    oldpeak: float # ST depression
    slope: float # slope of peak exercise ST (0, 1, 2)
    ca: float # number of major vessels (0-4)
    thal: float # thal (3 = normal; 6 = fixed defect; 7 = reversable defect)

class KidneyInput(BaseModel):
    age: float
    bp: float
    sg: float # 1.005, 1.010, etc.
    al: float # 0, 1, 2, 3, 4, 5
    su: float # 0, 1, 2, 3, 4, 5
    rbc: str # normal, abnormal
    pc: str # normal, abnormal
    pcc: str # present, notpresent
    ba: str # present, notpresent
    bgr: float
    bu: float
    sc: float
    sod: float
    pot: float
    hemo: float
    pcv: float
    wc: float
    rc: float
    htn: str # yes, no
    dm: str # yes, no
    cad: str # yes, no
    appet: str # good, poor
    pe: str # yes, no
    ane: str # yes, no

class ThyroidInput(BaseModel):
    age: float
    sex: str # m, f
    on_thyroxine: str # t, f
    query_on_thyroxine: str # t, f
    on_antithyroid_meds: str # t, f
    sick: str # t, f
    pregnant: str # t, f
    thyroid_surgery: str # t, f
    I131_treatment: str # t, f
    query_hypothyroid: str # t, f
    query_hyperthyroid: str # t, f
    lithium: str # t, f
    goitre: str # t, f
    tumor: str # t, f
    hypopituitary: str # t, f
    psych: str # t, f
    TSH: float
    T3: float
    TT4: float
    T4U: float
    FTI: float

# ----------------- API Endpoints -----------------

@app.get("/api/symptoms")
def get_symptoms():
    if general_df.empty:
        return []
    all_symptoms = set()
    for sym_list in general_df['symptoms']:
        all_symptoms.update(sym_list)
    return sorted(list(all_symptoms))

@app.post("/api/diagnose/initiate")
def diagnose_initiate(req: SymptomRequest):
    if general_df.empty:
        raise HTTPException(status_code=500, detail="General symptom database is not loaded.")
        
    user_syms = [s.strip().lower() for s in req.symptoms if s.strip()]
    if not user_syms:
        return {"matching_diseases": [], "questions": []}
        
    # Find matching diseases
    matches = []
    for idx, row in general_df.iterrows():
        disease_syms = row['symptoms']
        intersection = set(user_syms).intersection(set(disease_syms))
        if intersection:
            score = len(intersection) / len(disease_syms) # percentage of disease's symptoms patient has
            matches.append({
                "disease": row['disease'],
                "score": score,
                "symptoms": disease_syms,
                "cures": row['cures'],
                "doctor": row['doctor'],
                "risk_level": row['risk level']
            })
            
    # Sort matches by score descending
    matches = sorted(matches, key=lambda x: x['score'], reverse=True)
    
    # Propose follow-up questions
    # Get all symptoms of the top matching candidate diseases that the user has not selected yet
    suggested_questions = []
    user_syms_set = set(user_syms)
    
    # Check top 5 matching candidates
    seen_syms = set()
    for match in matches[:5]:
        for sym in match['symptoms']:
            if sym not in user_syms_set and sym not in seen_syms:
                seen_syms.add(sym)
                
    # Rank suggested symptoms by frequency in the candidate pool
    sym_counts = {}
    for match in matches[:8]:
        for sym in match['symptoms']:
            if sym not in user_syms_set:
                sym_counts[sym] = sym_counts.get(sym, 0) + 1
                
    sorted_suggestions = sorted(sym_counts.items(), key=lambda x: x[1], reverse=True)
    suggested_questions = [s[0] for s in sorted_suggestions[:3]]
    
    return {
        "matching_diseases": matches[:5],
        "questions": suggested_questions
    }

@app.post("/api/diagnose/final")
def diagnose_final(req: SymptomRequest):
    if general_df.empty:
        raise HTTPException(status_code=500, detail="General symptom database is not loaded.")
        
    user_syms = [s.strip().lower() for s in req.symptoms if s.strip()]
    if not user_syms:
        raise HTTPException(status_code=400, detail="No symptoms provided.")
        
    # Calculate best match
    matches = []
    for idx, row in general_df.iterrows():
        disease_syms = row['symptoms']
        intersection = set(user_syms).intersection(set(disease_syms))
        if intersection:
            # Jaccard overlap or ratio
            score = len(intersection) / len(disease_syms)
            matches.append({
                "disease": row['disease'],
                "score": score,
                "matched_count": len(intersection),
                "total_count": len(disease_syms),
                "matched_symptoms": list(intersection),
                "cures": row['cures'],
                "doctor": row['doctor'],
                "risk_level": row['risk level']
            })
            
    if not matches:
        return {
            "disease": "Unknown Condition",
            "score": 0.0,
            "cures": "Please consult a healthcare professional.",
            "doctor": "General Physician",
            "risk_level": "Unknown"
        }
        
    # Sort matches by score descending, then matched count descending
    matches = sorted(matches, key=lambda x: (x['score'], x['matched_count']), reverse=True)
    best_match = matches[0]
    
    return best_match

@app.post("/api/predict/diabetes")
def predict_diabetes(inputs: DiabetesInput):
    clf = models.get('diabetes')
    config = configs.get('diabetes')
    if not clf or not config:
        raise HTTPException(status_code=500, detail="Diabetes model is not loaded.")
    # Prepare array in correct feature order for the Pima model
    features = config['features']
    input_dict = {
        'Pregnancies': inputs.pregnancies,
        'Glucose': inputs.glucose,
        'BloodPressure': inputs.bloodPressure,
        'SkinThickness': inputs.skinThickness,
        'Insulin': inputs.insulin,
        'BMI': inputs.bmi,
        'DiabetesPedigreeFunction': inputs.pedigree,
        'Age': inputs.age
    }

    # Impute missing/zero values where appropriate
    medians = config.get('medians', {})
    for col in ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI']:
        if input_dict.get(col, None) == 0 or input_dict.get(col, None) is None:
            input_dict[col] = medians.get(col, input_dict.get(col, 0))

    X = pd.DataFrame([[input_dict[col] for col in features]], columns=features)
    prob = clf.predict_proba(X)[0][1] if hasattr(clf, 'predict_proba') else float(clf.predict(X)[0])

    return {
        "risk_percentage": round(float(prob) * 100, 2),
        "class": int(clf.predict(X)[0])
    }

@app.post("/api/predict/heart")
def predict_heart(inputs: HeartInput):
    clf = models.get('heart')
    config = configs.get('heart')
    if not clf or not config:
        raise HTTPException(status_code=500, detail="Heart model is not loaded.")
        
    features = config['features']
    input_dict = {
        'age': inputs.age,
        'sex': inputs.sex,
        'cp': inputs.cp,
        'trestbps': inputs.trestbps,
        'chol': inputs.chol,
        'fbs': inputs.fbs,
        'restecg': inputs.restecg,
        'thalach': inputs.thalach,
        'exang': inputs.exang,
        'oldpeak': inputs.oldpeak,
        'slope': inputs.slope,
        'ca': inputs.ca,
        'thal': inputs.thal
    }
    
    X = pd.DataFrame([[input_dict[col] for col in features]], columns=features)
    prob = clf.predict_proba(X)[0][1]
    
    return {
        "risk_percentage": round(float(prob) * 100, 2),
        "class": int(clf.predict(X)[0])
    }

@app.post("/api/predict/kidney")
def predict_kidney(inputs: KidneyInput):
    clf = models.get('kidney')
    config = configs.get('kidney')
    if not clf or not config:
        raise HTTPException(status_code=500, detail="Kidney model is not loaded.")
        
    features = config['features']
    cat_mappings = config['cat_mappings']
    modes = config['modes']
    medians = config['medians']
    
    input_dict = {
        'age': inputs.age, 'bp': inputs.bp, 'sg': inputs.sg, 'al': inputs.al, 'su': inputs.su,
        'rbc': inputs.rbc, 'pc': inputs.pc, 'pcc': inputs.pcc, 'ba': inputs.ba,
        'bgr': inputs.bgr, 'bu': inputs.bu, 'sc': inputs.sc, 'sod': inputs.sod, 'pot': inputs.pot,
        'hemo': inputs.hemo, 'pcv': inputs.pcv, 'wc': inputs.wc, 'rc': inputs.rc,
        'htn': inputs.htn, 'dm': inputs.dm, 'cad': inputs.cad, 'appet': inputs.appet,
        'pe': inputs.pe, 'ane': inputs.ane
    }
    
    # Process inputs
    X = []
    for col in features:
        if col in config['numeric_features']:
            val = input_dict[col]
            if pd.isna(val) or val == 0 and col in ['sg', 'hemo', 'rc', 'pcv']: # handle zeros or NaNs in specific fields
                val = medians.get(col, 0)
            X.append(float(val))
        else:
            val = str(input_dict[col]).strip().lower()
            mapping = cat_mappings.get(col, {})
            # Find the closest mapped class, or default to the mode encoded class
            if val in mapping:
                encoded = mapping[val]
            else:
                mode_val = modes.get(col, '')
                encoded = mapping.get(mode_val, 0)
            X.append(encoded)
            
    X_df = pd.DataFrame([X], columns=features)
    prob = clf.predict_proba(X_df)[0][1]
    
    return {
        "risk_percentage": round(float(prob) * 100, 2),
        "class": int(clf.predict(X_df)[0])
    }

@app.post("/api/predict/thyroid")
def predict_thyroid(inputs: ThyroidInput):
    clf = models.get('thyroid')
    config = configs.get('thyroid')
    if not clf or not config:
        raise HTTPException(status_code=500, detail="Thyroid model is not loaded.")
        
    features = config['features']
    cat_mappings = config['cat_mappings']
    modes = config['modes']
    medians = config['medians']
    
    input_dict = {
        'age': inputs.age, 'sex': inputs.sex, 'on_thyroxine': inputs.on_thyroxine,
        'query_on_thyroxine': inputs.query_on_thyroxine, 'on_antithyroid_meds': inputs.on_antithyroid_meds,
        'sick': inputs.sick, 'pregnant': inputs.pregnant, 'thyroid_surgery': inputs.thyroid_surgery,
        'I131_treatment': inputs.I131_treatment, 'query_hypothyroid': inputs.query_hypothyroid,
        'query_hyperthyroid': inputs.query_hyperthyroid, 'lithium': inputs.lithium, 'goitre': inputs.goitre,
        'tumor': inputs.tumor, 'hypopituitary': inputs.hypopituitary, 'psych': inputs.psych,
        'TSH': inputs.TSH, 'T3': inputs.T3, 'TT4': inputs.TT4, 'T4U': inputs.T4U, 'FTI': inputs.FTI
    }
    
    X = []
    for col in features:
        if col in config['numeric_features']:
            val = input_dict[col]
            if pd.isna(val):
                val = medians.get(col, 0)
            X.append(float(val))
        else:
            val = str(input_dict[col]).strip().lower()
            mapping = cat_mappings.get(col, {})
            if val in mapping:
                encoded = mapping[val]
            else:
                mode_val = modes.get(col, '')
                encoded = mapping.get(mode_val, 0)
            X.append(encoded)
            
    X_df = pd.DataFrame([X], columns=features)
    prob = clf.predict_proba(X_df)[0][1]
    
    return {
        "risk_percentage": round(float(prob) * 100, 2),
        "class": int(clf.predict(X_df)[0])
    }

# Serve frontend app
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
