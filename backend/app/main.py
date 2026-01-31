from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timedelta
import jwt
from typing import Optional, List
import uvicorn
import pandas as pd
import json
from . import data_generator
from . import gnn_model
from .gnn_model import PREDICTIONS_FILE
import os
import asyncio
import numpy as np
import google.generativeai as genai
from pydantic import BaseModel
import random

from typing import Literal

app = FastAPI(
    title="Fraud Ring Detection API",
    description="Uses a GNN to detect sophisticated fraud rings.",
)

# ============ AUTHENTICATION SETUP ============
SECRET_KEY = "your-secret-key-change-in-production-fraud-guard-ai-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
CASES_FILE = os.path.join(data_generator.DATA_DIR, "cases.json")

security = HTTPBearer()

# Models for authentication
class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    message: str
    token: str
    user: dict

# Admin credentials
ADMIN_EMAIL = "admin@gmail.com"
ADMIN_PASSWORD = "adminpassword"

def verify_password(plain_password: str, stored_password: str) -> bool:
    return plain_password == stored_password

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email != ADMIN_EMAIL:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized"
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

# Authentication endpoints
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    if request.email != ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    if not verify_password(request.password, ADMIN_PASSWORD):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(data={"sub": request.email, "role": "admin"})
    
    return LoginResponse(
        message="Login successful",
        token=access_token,
        user={
            "email": ADMIN_EMAIL,
            "role": "admin",
            "full_name": "System Administrator"
        }
    )

@app.post("/api/auth/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return {"message": "Logout successful"}

@app.get("/api/auth/verify")
async def verify(payload: dict = Depends(verify_token)):
    return {
        "valid": True,
        "user": {
            "email": payload.get("sub"),
            "role": "admin"
        }
    }

# ============ CORS CONFIGURATION ============
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini API
GEMINI_API_KEY = "AIzaSyBI5Hoi_wdjgMKZ4G3YI80Ms016FRSjY64"
genai.configure(api_key=GEMINI_API_KEY)

# ============ WEBSOCKET MANAGER ============
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# ============ YOUR EXISTING ENDPOINTS ============

@app.post("/generate_dataset")
async def api_generate_dataset():
    try:
        stats = data_generator.generate_blockchain_aml_data()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/train_gnn")
async def api_train_gnn():
    if not os.path.exists(data_generator.NODES_FILE) or not os.path.exists(data_generator.TRANSACTIONS_FILE):
        raise HTTPException(
            status_code=400, 
            detail="Dataset not found. Please generate the dataset first via POST /generate_dataset"
        )
        
    try:
        metrics = gnn_model.train_and_evaluate()
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during training: {str(e)}")

@app.get("/get_dataset")
async def api_get_dataset():
    if not os.path.exists(data_generator.NODES_FILE) or not os.path.exists(data_generator.TRANSACTIONS_FILE):
        raise HTTPException(
            status_code=400, 
            detail="Dataset not found. Please generate it first."
        )
    
    try:
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        transactions_df = pd.read_csv(data_generator.TRANSACTIONS_FILE)
        
        nodes_df = nodes_df.round(4)
        transactions_df['amount'] = transactions_df['amount'].round(2)
        
        return {
            "nodes": nodes_df.to_dict('records'),
            "transactions": transactions_df.to_dict('records')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get_graph_data")
async def api_get_graph_data():
    files_exist = (
        os.path.exists(data_generator.NODES_FILE) and
        os.path.exists(data_generator.TRANSACTIONS_FILE) and
        os.path.exists(PREDICTIONS_FILE)
    )
    if not files_exist:
        raise HTTPException(
            status_code=400, 
            detail="Required data not found. Please generate dataset and train model first."
        )

    try:
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        transactions_df = pd.read_csv(data_generator.TRANSACTIONS_FILE)
        
        with open(PREDICTIONS_FILE, 'r') as f:
            predictions_data = json.load(f)
        
        preds = predictions_data['predictions']
        ring_nodes = set(predictions_data['nodes_in_rings'])
        
        graph_nodes = []
        for _, row in nodes_df.iterrows():
            node_id = int(row['node_id'])
            features = {k: v for k, v in row.items() if k not in ['node_id', 'is_fraud']}
            
            graph_nodes.append({
                "id": node_id,
                "is_fraud_actual": int(row['is_fraud']),
                "is_fraud_predicted": preds[node_id],
                "is_in_ring": node_id in ring_nodes,
                "features": features
            })
            
        graph_links = []
        for _, row in transactions_df.iterrows():
            graph_links.append({
                "source": int(row['sender_id']),
                "target": int(row['receiver_id']),
                "amount": round(row['amount'], 2),
                "is_fraud": int(row['is_fraud_transaction']),
                "time_step": int(row.get('time_step', 0)),
                "timestamp": str(row.get('timestamp', '')),
                "transaction_type": row.get('transaction_type', 'normal')
            })
            
        return {
            "nodes": graph_nodes,
            "links": graph_links
        }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing graph data: {str(e)}")

@app.post("/explain_node/{node_id}")
async def api_explain_node(node_id: int):
    try:
        explanation = gnn_model.explain_node_prediction(node_id)
        return explanation
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error explaining node: {str(e)}")

@app.post("/generate_investigation_report/{node_id}")
async def api_generate_investigation_report(node_id: int):
    try:
        explanation = gnn_model.explain_node_prediction(node_id)
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        transactions_df = pd.read_csv(data_generator.TRANSACTIONS_FILE)
        
        node_data = nodes_df[nodes_df['node_id'] == node_id].iloc[0].to_dict()
        
        related_txns = transactions_df[
            (transactions_df['sender_id'] == node_id) | 
            (transactions_df['receiver_id'] == node_id)
        ]
        
        prompt = f"""You are a financial fraud investigator. Generate a professional Suspicious Activity Report (SAR) for the following case:

**SUBJECT NODE ID:** {node_id}

**CLASSIFICATION:** Fraudulent Account (High Risk)

**TECHNICAL ANALYSIS:**
- Top Risk Features: {', '.join([f"{f['feature_name']} (importance: {f['importance']:.2%})" for f in explanation['top_features']])}
- Suspicious Connected Accounts: {', '.join([f"Node {n['neighbor_id']} (connection strength: {n['importance']:.2%})" for n in explanation['top_neighbors']])}

**TRANSACTION SUMMARY:**
- Total Transactions: {len(related_txns)}
- Total Transaction Volume: ${related_txns['amount'].sum():.2f}
- Average Transaction Size: ${related_txns['amount'].mean():.2f}
- Fraudulent Transaction Count: {related_txns['is_fraud_transaction'].sum()}

**BEHAVIORAL INDICATORS:**
- Feature 0 (Account Age Risk): {node_data.get('feature_0', 0):.4f}
- Feature 1 (Velocity Risk): {node_data.get('feature_1', 0):.4f}
- Feature 2 (Network Risk): {node_data.get('feature_2', 0):.4f}

Generate a professional SAR report with the following sections:
1. **Executive Summary** (2-3 sentences)
2. **Risk Assessment** (What patterns indicate fraud?)
3. **Network Analysis** (How is this account connected to other suspicious accounts?)
4. **Recommended Actions** (What should investigators do next?)

Keep it concise, actionable, and professional. Use financial crime terminology."""

        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        
        return {
            "node_id": node_id,
            "report": response.text,
            "technical_data": explanation,
            "transaction_stats": {
                "total_transactions": int(len(related_txns)),
                "total_volume": float(related_txns['amount'].sum()),
                "avg_transaction": float(related_txns['amount'].mean()),
                "fraud_count": int(related_txns['is_fraud_transaction'].sum())
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@app.websocket("/ws/realtime-monitor")
async def websocket_realtime_monitor(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        model, data = gnn_model.load_model_and_data()
        if model is None or data is None:
            await websocket.send_json({
                "type": "error",
                "message": "Model not trained. Please train the model first."
            })
            return
        
        transactions_df = pd.read_csv(data_generator.TRANSACTIONS_FILE)
        transactions_df = transactions_df.sort_values('time_step').reset_index(drop=True)
        
        import torch
        with torch.no_grad():
            out = model(data.x, data.edge_index)
            probabilities = out.exp().cpu().numpy()
        
        FRAUD_THRESHOLD = 0.75
        
        for idx, txn in transactions_df.iterrows():
            await asyncio.sleep(0.05)
            
            sender = int(txn['sender_id'])
            receiver = int(txn['receiver_id'])
            
            sender_prob = float(probabilities[sender][1])
            receiver_prob = float(probabilities[receiver][1])
            
            is_alert = (sender_prob > FRAUD_THRESHOLD or receiver_prob > FRAUD_THRESHOLD)
            
            alert_data = {
                "type": "transaction",
                "transaction_id": int(idx),
                "timestamp": str(txn['timestamp']),
                "sender_id": sender,
                "receiver_id": receiver,
                "amount": float(txn['amount']),
                "is_alert": is_alert,
                "sender_risk_score": sender_prob,
                "receiver_risk_score": receiver_prob,
                "fraud_actual": int(txn['is_fraud_transaction']),
                "transaction_type": txn.get('transaction_type', 'normal'),
                "threshold": FRAUD_THRESHOLD
            }
            
            await websocket.send_json(alert_data)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })

@app.get("/model_diagnostics")
async def get_model_diagnostics():
    try:
        model, data = gnn_model.load_model_and_data()
        if not model or not data:
            raise HTTPException(status_code=400, detail="Model not trained")
        
        import torch
        with torch.no_grad():
            out = model(data.x, data.edge_index)
            predictions = out.argmax(dim=1).cpu().numpy()
            probabilities = out.exp().cpu().numpy()
        
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        actual_fraud = nodes_df['is_fraud'].values
        
        fraud_predictions = np.sum(predictions == 1)
        safe_predictions = np.sum(predictions == 0)
        actual_fraud_count = np.sum(actual_fraud == 1)
        
        fraud_probs = probabilities[:, 1]
        
        thresholds = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9]
        threshold_analysis = {}
        
        for thresh in thresholds:
            high_conf_fraud = np.sum(fraud_probs > thresh)
            threshold_analysis[str(thresh)] = {
                "alerts_triggered": int(high_conf_fraud),
                "percentage_of_total": float(high_conf_fraud / len(predictions) * 100)
            }
        
        return {
            "total_nodes": int(len(predictions)),
            "actual_fraud_nodes": int(actual_fraud_count),
            "predicted_fraud_nodes_default": int(fraud_predictions),
            "predicted_safe_nodes_default": int(safe_predictions),
            "fraud_rate_actual": float(actual_fraud_count / len(predictions) * 100),
            "fraud_rate_predicted": float(fraud_predictions / len(predictions) * 100),
            "avg_fraud_probability": float(np.mean(fraud_probs)),
            "max_fraud_probability": float(np.max(fraud_probs)),
            "min_fraud_probability": float(np.min(fraud_probs)),
            "threshold_analysis": threshold_analysis,
            "recommendation": "Consider using threshold 0.75 or higher to reduce false positives"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
class CaseCreate(BaseModel):
    node_id: int
    severity: str
    notes: str

class CaseUpdate(BaseModel):
    status: Literal["open", "investigating", "confirmed_fraud", "false_positive"]
    analyst_notes: str

# --- ADD THESE HELPER FUNCTIONS ---
def load_cases():
    if not os.path.exists(CASES_FILE):
        return {}
    with open(CASES_FILE, 'r') as f:
        return json.load(f)

def save_cases(cases_data):
    with open(CASES_FILE, 'w') as f:
        json.dump(cases_data, f, indent=2)

# --- ADD THESE NEW ENDPOINTS ---

@app.get("/cases")
async def get_all_cases():
    return load_cases()

@app.post("/cases/create")
async def create_case(case: CaseCreate):
    cases = load_cases()
    case_id = str(case.node_id)
    
    if case_id in cases:
        raise HTTPException(status_code=400, detail="Case already exists for this node")
    
    # Get current node details for context
    nodes_df = pd.read_csv(data_generator.NODES_FILE)
    node_info = nodes_df[nodes_df['node_id'] == case.node_id].iloc[0].to_dict()
    
    cases[case_id] = {
        "case_id": case_id,
        "node_id": case.node_id,
        "status": "open",
        "severity": case.severity,
        "created_at": str(datetime.now()),
        "initial_notes": case.notes,
        "analyst_updates": [],
        "risk_score": node_info.get('feature_1', 0) # Example placeholder
    }
    
    save_cases(cases)
    return {"message": "Case opened", "case_id": case_id}

@app.put("/cases/{case_id}/update")
async def update_case_status(case_id: str, update: CaseUpdate):
    cases = load_cases()
    if case_id not in cases:
        raise HTTPException(status_code=404, detail="Case not found")
    
    previous_status = cases[case_id]['status']
    cases[case_id]['status'] = update.status
    
    # Log the update
    cases[case_id]['analyst_updates'].append({
        "timestamp": str(datetime.now()),
        "from_status": previous_status,
        "to_status": update.status,
        "note": update.analyst_notes
    })
    
    # === ACTIVE LEARNING HOOK ===
    # If analyst marks as "False Positive" or "Confirmed Fraud", 
    # we update the ground truth in nodes.csv to improve future training.
    if update.status in ["confirmed_fraud", "false_positive"]:
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        
        # 0 = Legitimate, 1 = Fraud
        new_label = 1 if update.status == "confirmed_fraud" else 0
        
        # Update the CSV
        row_idx = nodes_df.index[nodes_df['node_id'] == int(cases[case_id]['node_id'])].tolist()
        if row_idx:
            nodes_df.at[row_idx[0], 'is_fraud'] = new_label
            nodes_df.to_csv(data_generator.NODES_FILE, index=False)
            print(f"Active Learning: Node {case_id} label updated to {new_label}")

    save_cases(cases)
    return {"message": "Case updated", "new_status": update.status}
@app.delete("/cases/{case_id}")
async def delete_case(case_id: str):
    cases = load_cases()
    if case_id in cases:
        del cases[case_id]
        save_cases(cases)
        return {"message": "Case deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Case not found")

# --- Add to main.py ---
@app.get("/api/verify_identity/{node_id}")
async def verify_identity(node_id: int):
    # Simulate API latency
    await asyncio.sleep(0.8) 
    
    # 1. GET THE GROUND TRUTH FROM YOUR DATASET
    # We look up the node in the CSV to see if it's actually fraud
    try:
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        node_row = nodes_df[nodes_df['node_id'] == node_id]
        
        if not node_row.empty:
            is_actual_fraud = int(node_row.iloc[0]['is_fraud']) == 1
        else:
            is_actual_fraud = False
    except Exception as e:
        print(f"Error reading nodes file: {e}")
        is_actual_fraud = (node_id % 7 == 0) # Fallback

    # 2. GENERATE LOGIC BASED ON TRUTH
    if is_actual_fraud:
        # If it's fraud, generate a LOW Trust Score (Suspicious)
        identity_score = random.randint(12, 45)
        recommendation = "CRITICAL: FREEZE ACCOUNT"
        signals = [
            {"source": "National ID Registry", "status": "Mismatched", "icon": "🆔"},
            {"source": "Global Sanctions List", "status": "Potential Match", "icon": "🌍"},
            {"source": "Device Fingerprint", "status": "Proxy/VPN Detected", "icon": "💻"},
            {"source": "Social Footprint", "status": "No Trace", "icon": "📱"}
        ]
    else:
        # If it's safe, generate a HIGH Trust Score (Verified)
        identity_score = random.randint(88, 99)
        recommendation = "CONTINUE MONITORING"
        signals = [
            {"source": "National ID Registry", "status": "Verified", "icon": "🆔"},
            {"source": "Global Sanctions List", "status": "Clear", "icon": "🌍"},
            {"source": "Device Fingerprint", "status": "Residential IP", "icon": "💻"},
            {"source": "Social Footprint", "status": "Consistent", "icon": "📱"}
        ]
    
    return {
        "node_id": node_id,
        "identity_score": identity_score,
        "signals": signals,
        "recommendation": recommendation
    }

# --- REPLACEMENT FOR /api/copilot in main.py ---

class ChatRequest(BaseModel):
    query: str

@app.post("/api/copilot")
async def copilot_chat(request: ChatRequest):
    try:
        # 1. SETUP: Load Data Frames
        if not os.path.exists(data_generator.NODES_FILE):
             return {"type": "text", "text": "Error: Dataset not generated yet."}
             
        nodes_df = pd.read_csv(data_generator.NODES_FILE)
        transactions_df = pd.read_csv(data_generator.TRANSACTIONS_FILE)
        
        # Load Predictions if available
        predictions = {}
        if os.path.exists(PREDICTIONS_FILE):
            with open(PREDICTIONS_FILE, 'r') as f:
                predictions = json.load(f).get('predictions', [])

        # 2. INTENT DETECTION: Check if user is asking about a specific Node ID
        import re
        # Look for patterns like "Node 456", "User 456", "id 456"
        match = re.search(r'(?:node|user|id|account)\s*#?(\d+)', request.query.lower())
        
        target_node_id = None
        node_context = ""
        
        if match:
            target_node_id = int(match.group(1))
            
            # 3. DATA RETRIEVAL (The RAG Part)
            # Get the specific row for this node
            node_row = nodes_df[nodes_df['node_id'] == target_node_id]
            
            if not node_row.empty:
                row_data = node_row.iloc[0]
                
                # Get neighbor info
                outgoing = transactions_df[transactions_df['sender_id'] == target_node_id]
                incoming = transactions_df[transactions_df['receiver_id'] == target_node_id]
                
                # Get Prediction info
                is_fraud_pred = "Unknown"
                if predictions and target_node_id < len(predictions):
                    is_fraud_pred = "FRAUD" if predictions[target_node_id] == 1 else "SAFE"
                
                # Mock up "Real World" data (IP, Location) since it's not in the CSV
                # We use a hash so it's consistent every time you ask
                random.seed(target_node_id)
                fake_ips = [f"192.168.1.{random.randint(10,99)}", f"10.0.5.{random.randint(10,99)}"]
                fake_cities = ["Lagos, NG", "Moscow, RU", "New York, USA", "London, UK", "Bangalore, IN"]
                node_location = random.choice(fake_cities)
                node_ip = random.choice(fake_ips)
                
                # Construct the Context for Gemini
                node_context = f"""
                SPECIFIC DATA FOR NODE {target_node_id}:
                - Model Prediction: {is_fraud_pred}
                - Actual Label: {'FRAUD' if row_data['is_fraud'] == 1 else 'Legitimate'}
                - IP Address: {node_ip}
                - Geo-Location: {node_location}
                - Account Features:
                  * Feature_0 (Account Age Risk): {row_data['feature_0']:.4f}
                  * Feature_1 (Transaction Velocity): {row_data['feature_1']:.4f}
                  * Feature_2 (Network Density): {row_data['feature_2']:.4f}
                - Transaction Activity:
                  * Sent: {len(outgoing)} transfers (Total: ${outgoing['amount'].sum():.2f})
                  * Received: {len(incoming)} transfers
                """
            else:
                node_context = f"User asked about Node {target_node_id}, but it does not exist in the CSV."

        # 4. GENERAL CONTEXT (If no specific node asked)
        general_stats = f"""
        DATASET SUMMARY:
        - Total Nodes: {len(nodes_df)}
        - Total Fraud Cases: {nodes_df['is_fraud'].sum()}
        - GNN Model Status: Active
        """

        # 5. CONSTRUCT FINAL PROMPT
        system_instruction = f"""
        You are FraudGPT, an advanced AI forensic analyst.
        
        {general_stats}
        
        {node_context}
        
        USER QUERY: "{request.query}"
        
        INSTRUCTIONS:
        1. If the user asks about a specific node (Node {target_node_id}), use the "SPECIFIC DATA" above to answer.
        2. Explain *WHY* it is fraud based on the features (e.g., "High Feature_1 indicates abnormal velocity...").
        3. Mention the IP and Location provided in the data.
        4. If the model prediction matches the actual label, mention that the GNN was correct.
        5. Be professional and concise.
        """
        
        # 6. GENERATE CONTENT
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(system_instruction)
        
        return {
            "type": "text",
            "text": response.text
        }

    except Exception as e:
        print(f"Copilot Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("This file is not meant to be run directly.")
    print("Run from the 'backend' directory using: uvicorn app.main:app --reload --port 8000")