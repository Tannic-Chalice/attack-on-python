import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data
from torch_geometric.utils import to_networkx
import networkx as nx
from sklearn.metrics import precision_score, recall_score, roc_auc_score, f1_score, accuracy_score, confusion_matrix
import pandas as pd
import numpy as np
import json
import os
import pickle

# Imports for explanation
try:
    from torch_geometric.explain import GNNExplainer
except ImportError:
    pass 

from .data_generator import NODES_FILE, TRANSACTIONS_FILE, DATA_DIR

PREDICTIONS_FILE = os.path.join(DATA_DIR, "predictions.json")
MODEL_FILE = os.path.join(DATA_DIR, "trained_model.pt")
DATA_FILE = os.path.join(DATA_DIR, "graph_data.pt")

def clear_saved_models():
    """Remove old model files to force clean retrain"""
    for file in [MODEL_FILE, DATA_FILE, PREDICTIONS_FILE]:
        if os.path.exists(file):
            try:
                os.remove(file)
                print(f"Removed: {file}")
            except Exception as e:
                print(f"Could not remove {file}: {e}")

class GraphSAGEModel(torch.nn.Module):
    def __init__(self, in_channels, hidden_channels, out_channels):
        super(GraphSAGEModel, self).__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.5, training=self.training)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)

def load_data():
    if not os.path.exists(NODES_FILE): return None
    nodes_df = pd.read_csv(NODES_FILE)
    transactions_df = pd.read_csv(TRANSACTIONS_FILE)

    x = torch.tensor(nodes_df[[c for c in nodes_df.columns if 'feature_' in c]].values, dtype=torch.float)
    y = torch.tensor(nodes_df['is_fraud'].values, dtype=torch.long)
    edge_index = torch.tensor(transactions_df[['sender_id', 'receiver_id']].values.T, dtype=torch.long)

    data = Data(x=x, y=y, edge_index=edge_index)
    
    # Train/Test Split
    perm = torch.randperm(data.num_nodes)
    data.train_mask = torch.zeros(data.num_nodes, dtype=torch.bool)
    data.train_mask[perm[:int(0.8*data.num_nodes)]] = True
    data.test_mask = torch.zeros(data.num_nodes, dtype=torch.bool)
    data.test_mask[perm[int(0.8*data.num_nodes):]] = True
    
    return data

def save_model_and_data(model, data):
    """
    Save model and data with proper settings for PyTorch 2.6+
    Uses pickle protocol to allow PyTorch Geometric objects
    """
    # Save model state dict (this is safe)
    torch.save(model.state_dict(), MODEL_FILE)
    
    # Save data object with pickle protocol enabled
    # Move data to CPU before saving to avoid device issues
    data_cpu = data.cpu()
    torch.save(data_cpu, DATA_FILE, pickle_protocol=4)

def load_model_and_data():
    """
    Loads the model and data.
    CRITICAL FIX: weights_only=False is required for PyTorch 2.6+ when loading PyG Data objects
    """
    if not os.path.exists(MODEL_FILE) or not os.path.exists(DATA_FILE):
        return None, None
    
    try:
        # FIX 1: Allow loading the Graph Data object (PyTorch Geometric Data class)
        # This is safe because we generated this file ourselves
        # We need to use weights_only=False AND map_location to avoid device issues
        data = torch.load(
            DATA_FILE, 
            map_location='cpu',
            weights_only=False
        )
        
        # Create model architecture
        model = GraphSAGEModel(
            in_channels=data.num_node_features, 
            hidden_channels=32, 
            out_channels=2
        )
        
        # FIX 2: Load model weights with map_location
        state_dict = torch.load(
            MODEL_FILE, 
            map_location='cpu',
            weights_only=False  # Changed: state_dict also needs weights_only=False in some PyTorch versions
        )
        model.load_state_dict(state_dict)
        model.eval()
        
        return model, data
        
    except Exception as e:
        print(f"Error loading model/data: {e}")
        import traceback
        traceback.print_exc()
        return None, None

def train_and_evaluate():
    # Clear any old model files first
    clear_saved_models()
    
    data = load_data()
    if not data: raise FileNotFoundError("No data found")
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = GraphSAGEModel(data.num_node_features, 32, 2).to(device)
    data = data.to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    model.train()
    for _ in range(100):
        optimizer.zero_grad()
        out = model(data.x, data.edge_index)
        loss = F.nll_loss(out[data.train_mask], data.y[data.train_mask])
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        out = model(data.x, data.edge_index)
        pred = out.argmax(dim=1)
        
        # Metrics
        y_true = data.y[data.test_mask].cpu().numpy()
        y_pred = pred[data.test_mask].cpu().numpy()
        
        cm = confusion_matrix(y_true, y_pred)
        tn, fp, fn, tp = cm.ravel() if cm.shape == (2,2) else (0,0,0,0)
        
        # Save Predictions
        all_preds = pred.cpu().numpy()
        fraud_idx = np.where(all_preds == 1)[0]
        
        # Detect Rings
        G = to_networkx(data, to_undirected=True)
        subgraph = G.subgraph(fraud_idx)
        rings = list(nx.connected_components(subgraph))
        nodes_in_rings = set().union(*rings) if rings else set()
        
        # Convert numpy types to Python native types for JSON serialization
        with open(PREDICTIONS_FILE, 'w') as f:
            json.dump({
                'predictions': [int(x) for x in all_preds.tolist()],  # Convert to Python int
                'nodes_in_rings': [int(x) for x in nodes_in_rings]    # Convert to Python int
            }, f)
        
        save_model_and_data(model, data)
        
        # Ensure all metrics are Python native types for JSON serialization
        return {
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "auc": float(roc_auc_score(y_true, out[data.test_mask].exp()[:,1].cpu().numpy())) if len(np.unique(y_true))>1 else 0.0,
            "fraud_ring_count": int(len(rings)),
            "confusion_matrix": {
                "tp": int(tp), 
                "fp": int(fp), 
                "tn": int(tn), 
                "fn": int(fn)
            }
        }

def explain_node_prediction(node_id: int):
    """
    Simplified explainer for demo - returns feature importance and neighbor info
    """
    model, data = load_model_and_data()
    if not model: 
        raise Exception("Model not trained")
    
    # Validate node_id
    if node_id < 0 or node_id >= data.num_nodes:
        raise ValueError(f"Node ID {node_id} out of range (0-{data.num_nodes-1})")
    
    # Get neighbors
    neighbors = data.edge_index[1][data.edge_index[0] == node_id].tolist()
    
    # Get top features (simple magnitude check)
    features = data.x[node_id].tolist()
    top_feat_indices = np.argsort(np.abs(features))[-3:][::-1]
    
    return {
        "node_id": node_id,
        "top_features": [
            {
                "feature_name": f"feature_{i}", 
                "importance": abs(features[i])
            } for i in top_feat_indices
        ],
        "top_neighbors": [
            {
                "neighbor_id": int(n), 
                "importance": 0.8  # Mock importance score
            } for n in neighbors[:5]
        ]
    }