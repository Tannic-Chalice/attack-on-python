import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta
import random

# Configuration
NUM_FEATURES = 16

# Create a directory for data if it doesn't exist
DATA_DIR = "./data"
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

NODES_FILE = os.path.join(DATA_DIR, "nodes.csv")
TRANSACTIONS_FILE = os.path.join(DATA_DIR, "transactions.csv")

def generate_synthetic_data():
    """
    Generates and saves a synthetic dataset of nodes and transactions with temporal information.
    """
    
    # Randomized config
    NUM_NODES = random.randint(800, 1500)
    NUM_TRANSACTIONS = random.randint(4000, 7000)
    FRAUD_NODE_PERCENTAGE = random.uniform(0.04, 0.10)

    # 1. Generate Nodes
    num_fraud_nodes = int(NUM_NODES * FRAUD_NODE_PERCENTAGE)
    num_normal_nodes = NUM_NODES - num_fraud_nodes
    
    node_ids = np.arange(NUM_NODES)
    is_fraud = np.zeros(NUM_NODES, dtype=int)
    fraud_node_indices = np.random.choice(node_ids, num_fraud_nodes, replace=False)
    is_fraud[fraud_node_indices] = 1
    
    # Generate random features
    features = np.random.rand(NUM_NODES, NUM_FEATURES)
    
    # Inject a signal for fraud nodes
    if num_fraud_nodes > 0:
        features[fraud_node_indices, 0:3] += np.random.uniform(0.5, 1.0, (num_fraud_nodes, 3))
    
    nodes_df = pd.DataFrame(features, columns=[f'feature_{i}' for i in range(NUM_FEATURES)])
    nodes_df['node_id'] = node_ids
    nodes_df['is_fraud'] = is_fraud
    
    # 2. Generate Transactions (Edges) with TEMPORAL DATA
    senders = []
    receivers = []
    amounts = []
    timestamps = []
    is_fraud_transaction = []
    transaction_types = []  # New: type of transaction
    
    normal_node_indices = np.where(is_fraud == 0)[0]
    
    # Set time range (100 days)
    start_time = datetime.now() - timedelta(days=100)
    
    # Create fraud rings (dense subgraphs) - THEY FORM GRADUALLY
    num_fraud_rings = 5
    if num_fraud_nodes < num_fraud_rings * 2:
        num_fraud_rings = 1
        ring_size = num_fraud_nodes
    else:
        ring_size = num_fraud_nodes // num_fraud_rings
        
    num_ring_transactions = int(NUM_TRANSACTIONS * 0.2)
    
    # Fraud rings emerge between day 30-90 (temporal pattern!)
    for i in range(num_fraud_rings):
        ring_nodes = fraud_node_indices[i*ring_size : (i+1)*ring_size]
        if len(ring_nodes) < 2:
            continue
        
        # This ring "activates" at a specific time
        ring_activation_day = random.randint(30, 70)
        ring_duration = random.randint(10, 25)
        
        for _ in range(num_ring_transactions // num_fraud_rings):
            sender, receiver = np.random.choice(ring_nodes, 2, replace=False)
            # Fraud transactions happen AFTER activation
            days_offset = random.randint(ring_activation_day, ring_activation_day + ring_duration)
            timestamp = start_time + timedelta(
                days=days_offset,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            senders.append(sender)
            receivers.append(receiver)
            amounts.append(np.random.uniform(500, 2000))
            timestamps.append(timestamp)
            is_fraud_transaction.append(1)
            transaction_types.append('ring_internal')

    # Create 'laundering' transactions (fraud -> normal) - LATE STAGE
    num_laundering_transactions = int(NUM_TRANSACTIONS * 0.1)
    if num_fraud_nodes > 0 and len(normal_node_indices) > 0:
        for _ in range(num_laundering_transactions):
            # Laundering happens in days 60-100 (after rings are established)
            days_offset = random.randint(60, 100)
            timestamp = start_time + timedelta(
                days=days_offset,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            senders.append(np.random.choice(fraud_node_indices))
            receivers.append(np.random.choice(normal_node_indices))
            amounts.append(np.random.uniform(100, 1000))
            timestamps.append(timestamp)
            is_fraud_transaction.append(1)
            transaction_types.append('laundering')

    # Create normal transactions - DISTRIBUTED THROUGHOUT
    num_normal_transactions = NUM_TRANSACTIONS - len(senders)
    if len(normal_node_indices) > 1:
        for _ in range(num_normal_transactions):
            sender, receiver = np.random.choice(normal_node_indices, 2, replace=False)
            # Normal transactions happen uniformly across all 100 days
            days_offset = random.randint(0, 100)
            timestamp = start_time + timedelta(
                days=days_offset,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            senders.append(sender)
            receivers.append(receiver)
            amounts.append(np.random.uniform(10, 200))
            timestamps.append(timestamp)
            is_fraud_transaction.append(0)
            transaction_types.append('normal')
        
    transactions_df = pd.DataFrame({
        'sender_id': senders,
        'receiver_id': receivers,
        'amount': amounts,
        'timestamp': timestamps,
        'is_fraud_transaction': is_fraud_transaction,
        'transaction_type': transaction_types
    })
    
    # Sort by timestamp for temporal analysis
    transactions_df = transactions_df.sort_values('timestamp').reset_index(drop=True)
    
    # Add time_step (0-100 for easy slider usage)
    min_time = transactions_df['timestamp'].min()
    max_time = transactions_df['timestamp'].max()
    transactions_df['time_step'] = ((transactions_df['timestamp'] - min_time) / 
                                     (max_time - min_time) * 100).astype(int)
    
    # Save to CSV
    nodes_df.to_csv(NODES_FILE, index=False)
    transactions_df.to_csv(TRANSACTIONS_FILE, index=False)
    
    return {
        "nodes": NUM_NODES,
        "transactions": len(transactions_df),
        "fraudulent_nodes": num_fraud_nodes,
        "time_range_days": 100,
        "fraud_rings": num_fraud_rings
    }

if __name__ == "__main__":
    stats = generate_synthetic_data()
    print(f"Data generated: {stats}")