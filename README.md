# Wired

Digital Twin de rede em tempo real com detecção de anomalias via Autoencoder e sistema de defesa ativa (IPS).

### Pré-requisitos
* C/C++ (GCC/MinGW)
* Python 3.10+ 

### Como configurar:
1. (Opcional) Crie e ative um ambiente virtual na raiz do projeto:
   ```bash
   python -m venv venv
   venv\Scripts\activate

2. Instale as dependências da IA e do servidor:
    ```bash
    pip install torch websockets numpy scikit-learn joblib


### Passo 1: Captura e Treinamento do Modelo
Como a rede neural aprende o padrão de comportamento de uma rede específica, é necessário gerar um dataset local para evitar falsos positivos.
1. Compile o sniffer C++ e execute-o em um ambiente de rede seguro para gerar o seu dataset local.
2. Com os dados capturados, execute o script de treinamento da rede neural:
   ```bash
   python src/python/brain.py
3. O script irá gerar o escalonador (data/scaler.pkl) e os pesos do modelo treinado (models/modelo_rede.pth).

### Passo 2: Iniciando o Sistema Sentinel
A interface gráfica não pode ser aberta com duplo clique no explorador de arquivos devido a políticas de CORS com módulos ES6.
1. Terminal 1 (Backend/IA): Inicie o servidor de detecção Python (atuará como ponte WebSocket e Firewall):
    ```bash
    python src/python/detector_server.py
2. Terminal 2 (Frontend): Inicie um servidor web local para servir a interface gráfica:
    ```bash
    python -m http.server 8000
3. Abra o navegador e acesse http://127.0.0.1:8000.
4. Execute sniffer.exe como administrador para começar a injetar o tráfego no painel.

### Simulando um Ataque DDoS:
Para testar a capacidade do Sentinel, você pode rodar o simulador de ataque a partir de um segundo computador conectado na mesma Rede Local (LAN), apontando para a porta UDP 9999 da máquina principal.

(Nota de Calibração: Localize a variável global THRESHOLD no detector_server.py. Você pode aumentar esse valor caso o tráfego local normal ainda esteja gerando alertas de anomalia).

## Arquitetura
* **C++:** Sniffer de pacotes de baixo nível.
* **(Python/PyTorch):** Backend que recebe o tráfego via UDP, realiza inferência no Autoencoder, aplica Deep Packet Inspection (DPI) e gerencia a Blocklist.
* **Three.js:** Frontend web 3D via WebSocket, utilizando UnrealBloom para renderização e GeoJS para OSINT geográfico.

## Funcionalidades
* Monitoramento 3D com sistema dinâmico de partículas.
* Classificação em tempo real (Volumetric Flood, SSH Brute Force, Ping Flood, etc.).
* Rastreamento geográfico de ameaças.
* **Defesa Ativa:** Bloqueio de IPs com feedback instantâneo para o Firewall Python.
* Geração de relatórios forenses (Exportação CSV).

## Segurança e Privacidade de Dados
Este repositório **não inclui o banco de dados de tráfego nem os modelos pré-treinados**. Para utilizar o sistema, é estritamente necessário capturar seu próprio tráfego de rede para criar um baseline do que é "normal" no seu ambiente e, em seguida, treinar a Inteligência Artificial.


