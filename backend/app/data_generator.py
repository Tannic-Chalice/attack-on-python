import pandas as pd
import numpy as np
import os
import random
import uuid
from datetime import datetime, timedelta

# ---------------- CONFIG ---------------- #

DATA_DIR = "./data"
os.makedirs(DATA_DIR, exist_ok=True)

NODES_FILE = os.path.join(DATA_DIR, "nodes.csv")
TRANSACTIONS_FILE = os.path.join(DATA_DIR, "transactions.csv")

NUM_FEATURES = 8
TIME_WINDOW_DAYS = 100

# ---------------------------------------- #

def generate_blockchain_aml_data():

    # ---------- GLOBAL SCALE ---------- #
    NUM_WALLETS = random.randint(900, 1400)
    NUM_TRANSACTIONS_TARGET = random.randint(5000, 8000)
    FRAUD_WALLET_RATIO = random.uniform(0.05, 0.10)

    start_time = datetime.now() - timedelta(days=TIME_WINDOW_DAYS)

    # ---------- WALLET CREATION ---------- #
    wallet_ids = [f"0x{uuid.uuid4().hex[:40]}" for _ in range(NUM_WALLETS)]

    is_illicit = np.zeros(NUM_WALLETS, dtype=int)
    num_illicit = int(NUM_WALLETS * FRAUD_WALLET_RATIO)
    illicit_indices = np.random.choice(range(NUM_WALLETS), num_illicit, replace=False)
    is_illicit[illicit_indices] = 1

    first_seen = []
    last_seen = []

    for i in range(NUM_WALLETS):
        birth = start_time + timedelta(days=random.randint(0, 60))
        if is_illicit[i]:
            death = birth + timedelta(days=random.randint(5, 25))
        else:
            death = birth + timedelta(days=random.randint(30, 100))
        first_seen.append(birth)
        last_seen.append(death)

    nodes_df = pd.DataFrame({
        "wallet_id": wallet_ids,
        "is_illicit_seed": is_illicit,
        "first_seen": first_seen,
        "last_seen": last_seen
    })

    # ---------- TRANSACTION STORAGE ---------- #
    tx_rows = []
    block_number = 1000000

    def add_tx(src, dst, amount, time):
        nonlocal block_number
        tx_rows.append({
            "tx_hash": str(uuid.uuid4()),
            "from_address": src,
            "to_address": dst,
            "amount": round(amount, 6),
            "timestamp": time,
            "block_number": block_number,
            "gas_fee": round(amount * random.uniform(0.001, 0.003), 6)
        })
        block_number += 1

    # ---------- SMURFING (FAN-OUT) ---------- #
    illicit_wallets = nodes_df[nodes_df.is_illicit_seed == 1].wallet_id.tolist()
    normal_wallets = nodes_df[nodes_df.is_illicit_seed == 0].wallet_id.tolist()

    num_sources = max(1, len(illicit_wallets) // 8)
    smurf_sources = random.sample(illicit_wallets, num_sources)

    laundering_endpoints = []

    for source in smurf_sources:

        smurf_count = random.randint(6, 15)
        smurfs = random.sample(normal_wallets, smurf_count)

        total_value = random.uniform(4000, 15000)
        base_amount = total_value / smurf_count

        t0 = start_time + timedelta(days=random.randint(20, 50))

        for smurf in smurfs:
            amt = base_amount * random.uniform(0.95, 1.05)
            add_tx(source, smurf, amt, t0 + timedelta(minutes=random.randint(1, 120)))
            laundering_endpoints.append((smurf, amt, t0))

    # ---------- LAYERING (MULTI-HOP PEELING) ---------- #
    layered_outputs = []

    for wallet, amount, t in laundering_endpoints:
        hops = random.choice([2, 3, 4])
        current_wallet = wallet
        current_amount = amount
        current_time = t

        for _ in range(hops):
            next_wallet = random.choice(normal_wallets)
            current_amount *= random.uniform(0.95, 0.99)
            current_time += timedelta(hours=random.randint(1, 12))
            add_tx(current_wallet, next_wallet, current_amount, current_time)
            current_wallet = next_wallet

        layered_outputs.append((current_wallet, current_amount, current_time))

    # ---------- AGGREGATION (FAN-IN) ---------- #
    aggregators = random.sample(normal_wallets, max(2, len(layered_outputs) // 10))

    for agg in aggregators:
        inbound = random.sample(layered_outputs, random.randint(4, 10))
        for src, amt, t in inbound:
            add_tx(src, agg, amt * random.uniform(0.97, 1.0),
                   t + timedelta(hours=random.randint(2, 24)))

    # ---------- NORMAL TRAFFIC ---------- #
    while len(tx_rows) < NUM_TRANSACTIONS_TARGET:
        src, dst = random.sample(normal_wallets, 2)
        t = start_time + timedelta(days=random.randint(0, TIME_WINDOW_DAYS))
        amt = random.uniform(5, 300)
        add_tx(src, dst, amt, t)

    tx_df = pd.DataFrame(tx_rows)
    tx_df = tx_df.sort_values("timestamp").reset_index(drop=True)

    # ---------- SAVE ---------- #
    nodes_df.to_csv(NODES_FILE, index=False)
    tx_df.to_csv(TRANSACTIONS_FILE, index=False)

    return {
        "wallets": NUM_WALLETS,
        "transactions": len(tx_df),
        "illicit_seeds": num_illicit,
        "smurf_sources": len(smurf_sources),
        "aggregators": len(aggregators)
    }


if __name__ == "__main__":
    stats = generate_blockchain_aml_data()
    print("Blockchain AML dataset generated:")
    print(stats)
