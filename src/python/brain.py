import sqlite3
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.preprocessing import StandardScaler
import joblib
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))

DB_PATH = os.path.join(PROJECT_ROOT, "data", "sentinel_data.db")
MODEL_SAVE_PATH = os.path.join(PROJECT_ROOT, "models", "modelo_rede.pth")
SCALER_SAVE_PATH = os.path.join(PROJECT_ROOT, "data", "scaler.pkl")

os.makedirs(os.path.dirname(MODEL_SAVE_PATH), exist_ok=True)
os.makedirs(os.path.dirname(SCALER_SAVE_PATH), exist_ok=True)

print(f"- [SENTINEL TRAINING] -")
print(f"buscando banco em: {DB_PATH}")

# DADOS
try:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query("SELECT protocolo, sport, dport, tamanho FROM trafego", conn)
    conn.close()
    print(f"[OK] {len(df)} registros carregados.")
except Exception as e:
    print(f"[ERRO] falha ao ler banco: {e}")
    print("certifique-se de que o sniffer.exe já gerou o banco em data/sentinel_data.db")
    exit()

if len(df) < 100:
    print("dados insuficientes para um treinamento preciso.")
    exit()

# NORMALIZAÇAO 
scaler = StandardScaler()
data_scaled = scaler.fit_transform(df.values) # Ajuste: usar .values para evitar avisos do Sklearn
joblib.dump(scaler, SCALER_SAVE_PATH) 

data_tensor = torch.FloatTensor(data_scaled)

# AUTOENCODER 
class SentinelBrain(nn.Module):
    def __init__(self):
        super(SentinelBrain, self).__init__()
        # encoder: 4 -> 16 -> 8 -> 3
        self.encoder = nn.Sequential(
            nn.Linear(4, 16),
            nn.ReLU(),
            nn.Linear(16, 8),
            nn.ReLU(),
            nn.Linear(8, 3)
        )
        # decoder: 3 -> 8 -> 16 -> 4
        self.decoder = nn.Sequential(
            nn.Linear(3, 8),
            nn.ReLU(),
            nn.Linear(8, 16),
            nn.ReLU(),
            nn.Linear(16, 4)
        )

    def forward(self, x):
        return self.decoder(self.encoder(x))

model = SentinelBrain()
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

# TREINAMENTO 
epochs = 500
print(f"iniciando treinamento (Epochs: {epochs})...")

for epoch in range(epochs):
    optimizer.zero_grad()
    output = model(data_tensor)
    loss = criterion(output, data_tensor)
    loss.backward()
    optimizer.step()
    
    if (epoch + 1) % 50 == 0:
        print(f'Época [{epoch+1}/{epochs}], Loss: {loss.item():.6f}')

# RESULTADOS 
torch.save(model.state_dict(), MODEL_SAVE_PATH)

print("\n" + "="*30)
print("[SUCESSO] Treinamento concluído!")
print(f"modelo salvo: {MODEL_SAVE_PATH}")
print(f"scaler salvo: {SCALER_SAVE_PATH}")
print("="*30)