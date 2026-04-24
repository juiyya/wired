import torch
import torch.nn as nn
import asyncio
import websockets
import json
import socket
import joblib
import numpy as np
import warnings
import os
import time

warnings.filterwarnings("ignore", category=UserWarning)

class SentinelBrain(nn.Module):
    def __init__(self):
        super(SentinelBrain, self).__init__()
        self.encoder = nn.Sequential(nn.Linear(4, 16), nn.ReLU(), nn.Linear(16, 8), nn.ReLU(), nn.Linear(8, 3))
        self.decoder = nn.Sequential(nn.Linear(3, 8), nn.ReLU(), nn.Linear(8, 16), nn.ReLU(), nn.Linear(16, 4))
    def forward(self, x):
        return self.decoder(self.encoder(x))

BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))

MODEL_PATH = os.path.join(PROJECT_ROOT, "models", "modelo_rede.pth")
SCALER_PATH = os.path.join(PROJECT_ROOT, "data", "scaler.pkl")

print("- [SENTINEL CORE] -")
print(f"raiz do projeto: {PROJECT_ROOT}")

# CARREGAR MODELO E SCALER
try:
    model = SentinelBrain()
    model.load_state_dict(torch.load(MODEL_PATH, weights_only=True))
    model.eval()
    scaler = joblib.load(SCALER_PATH)
    print("[OK] IA e scaler carregados com sucesso.")
except Exception as e:
    print(f"\n[ERRO] falha ao carregar arquivos: {e}")
    exit()

# VARIAVEIS GLOBAIS
THRESHOLD = 0.5  # calibração "ia paranoica" - (0.25,0.5, 0.8, 1.0)
connected_clients = set()
packet_queue = asyncio.Queue(maxsize=100) 
last_queued_time = {} 
blocklist = set()

# WEBSOCKET
async def ws_handler(websocket):
    connected_clients.add(websocket)
    print(f"[WS] novo cliente conectado. Total: {len(connected_clients)}")
    try:
        async for message in websocket:
            data = json.loads(message)
            if data.get("action") == "block":
                ip_bloqueado = data.get("ip")
                blocklist.add(ip_bloqueado)
                print(f"\n[FIREWALL ATIVO] IP {ip_bloqueado} isolado! cortando conexão na raiz.")
    except Exception:
        pass
    finally:
        connected_clients.remove(websocket)
        print(f"[WS] cliente desconectado. Total: {len(connected_clients)}")

# UDP
async def udp_listener():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", 9999))
    sock.setblocking(False)
    loop = asyncio.get_event_loop()
    
    print("\n[UDP] C++ na porta UDP 9999...")
    
    while True:
        data, addr = await loop.sock_recvfrom(sock, 1024)
        try:
            raw = json.loads(data.decode())
            dst_ip = raw['dst']
            src_ip = raw['src']
            
            # FIREWALL: DROP IMEDIATO
            # if IP na blocklist, o pacote é descartado ANTES da IA analisar. economia de CPU.
            if dst_ip in blocklist or src_ip in blocklist:
                continue 
            
            current_time = time.time()
            if dst_ip in last_queued_time and (current_time - last_queued_time[dst_ip]) < 0.1:
                continue 
            
            last_queued_time[dst_ip] = current_time
            
            if not packet_queue.full():
                await packet_queue.put(raw) 
        except Exception:
            pass

# AI WEEB
async def ai_processor():
    while True:
        raw = await packet_queue.get()
        try:
            features = np.array([raw['features']])
            features_scaled = scaler.transform(features)
            input_tensor = torch.FloatTensor(features_scaled)
            
            with torch.no_grad():
                output = model(input_tensor)
                loss = torch.mean((output - input_tensor)**2).item()
            
            is_anomaly = loss > THRESHOLD

            # LEITURA DE PROTOCOLOS E PORTAS (Deep Packet Inspection)
            attack_type = "Tráfego Anômalo"
            if is_anomaly:
                proto = int(raw['features'][0]) # Protocolo da Rede 
                dport = int(raw['features'][2]) # Porta de destino
                
                # 1: ICMP PING
                if proto == 1:
                    attack_type = "ICMP: Ping Flood / Smurf"
                
                # 6: TCP
                elif proto == 6:
                    if dport in [22, 2222]: attack_type = "TCP: SSH Brute Force"
                    elif dport in [80, 443, 8080]: attack_type = "TCP: Web Exploit / DoS"
                    elif dport in [21, 23]: attack_type = "TCP: FTP/Telnet Exploit"
                    elif dport in [3306, 1433, 5432]: attack_type = "TCP: Database Injection"
                    else: attack_type = f"TCP: Anomalia (Porta {dport})"
                
                # 17: UDP
                elif proto == 17:
                    if dport in [53]: attack_type = "UDP: DNS Amplification"
                    elif dport in [123]: attack_type = "UDP: NTP Amplification"
                    elif dport in [161]: attack_type = "UDP: SNMP Reflection"
                    else: attack_type = f"UDP: Flood (Porta {dport})"
                else: attack_type = f"Anomalia Genérica (Proto: {proto}, Porta: {dport})"

                # se a perda (loss) for muito alta (pacote distorcido ou gigantesco)
                if loss > 1.0: 
                    attack_type = f"Volumetric Flood [{attack_type}]"

            alert = json.dumps({
                "src": raw['src'], "dst": raw['dst'], "anomaly": is_anomaly, 
                "loss": round(loss, 4), "type": attack_type
            })

            if connected_clients:
                await asyncio.gather(*[c.send(alert) for c in connected_clients], return_exceptions=True)
        except Exception:
            pass
        
        await asyncio.sleep(0.005) 

# main
async def main():
    # Usar 0.0.0.0 força o Python a ouvir em todas as interfaces
    async with websockets.serve(ws_handler, "0.0.0.0", 8765):
        print("[SERVER] WebSocket plugado e aguardando o HTML...")
        await asyncio.gather(udp_listener(), ai_processor())

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[DESLIGANDO] sentinel encerrado.")