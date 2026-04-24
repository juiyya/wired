#include <iostream>
#include <pcap.h>
#include <winsock2.h>
#include "sqlite3.h" 
#include <string>

#pragma comment(lib, "ws2_32.lib")

// ESTRUTURA 
struct ip_header {
    u_char  ver_ihl;        
    u_char  tos;            
    u_short tlen;           
    u_short identification; 
    u_short flags_fo;       
    u_char  ttl;            
    u_char  proto;          
    u_short crc;            
    struct  in_addr saddr;  
    struct  in_addr daddr;  
};

// VARIAVEIS GLOBAIS
sqlite3* db;
SOCKET udp_sock;
sockaddr_in server_addr;

// PACOTES
void packet_handler(u_char *args, const struct pcap_pkthdr *header, const u_char *packet) {
    if (header->len < 34) return; // Tamanho mínimo para Ethernet + IP

    const struct ip_header* ip = (struct ip_header*)(packet + 14); // Pula 14 bytes do Ethernet
    int ip_len = (ip->ver_ihl & 0xf) * 4;
    
    // portas (assume TCP/UDP após o header IP)
    u_short sport = ntohs(*(u_short*)(packet + 14 + ip_len));
    u_short dport = ntohs(*(u_short*)(packet + 14 + ip_len + 2));

    // SQLITE
    std::string sql = "INSERT INTO trafego (protocolo, sport, dport, tamanho) VALUES (" +
                      std::to_string((int)ip->proto) + ", " +
                      std::to_string(sport) + ", " +
                      std::to_string(dport) + ", " +
                      std::to_string(header->len) + ");";

    sqlite3_exec(db, sql.c_str(), NULL, 0, NULL);

    // PYTHON (UDP)
    std::string msg = "{\"src\":\"" + std::string(inet_ntoa(ip->saddr)) + 
                      "\", \"dst\":\"" + std::string(inet_ntoa(ip->daddr)) + 
                      "\", \"features\": [" + std::to_string((int)ip->proto) + "," + 
                      std::to_string(sport) + "," + std::to_string(dport) + "," + 
                      std::to_string(header->len) + "]}";

    sendto(udp_sock, msg.c_str(), (int)msg.size(), 0, (sockaddr*)&server_addr, sizeof(server_addr));
    
    std::cout << "OK: " << inet_ntoa(ip->saddr) << " -> " << inet_ntoa(ip->daddr) << std::endl;
}

// MAIN
int main() {
    // WINSOCK
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2,2), &wsa) != 0) return 1;

    udp_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(9999);
    server_addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    // BANCO DE DADOS (caminho para a pasta data)
    if (sqlite3_open("../data/sentinel_data.db", &db)) {
        std::cerr << "erro ao abrir banco de dados!" << std::endl;
        return 1;
    }
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS trafego (id INTEGER PRIMARY KEY, protocolo INT, sport INT, dport INT, tamanho INT);", NULL, 0, NULL);

    // INTERFACES DE REDE
    pcap_if_t *alldevs, *device;
    char errbuf[PCAP_ERRBUF_SIZE];
    if (pcap_findalldevs(&alldevs, errbuf) == -1) return 1;

    int i = 0;
    for (device = alldevs; device != nullptr; device = device->next) {
        std::cout << ++i << ". " << (device->description ? device->description : device->name) << "\n";
    }

    int inum;
    std::cout << "\nSelecione a interface: ";
    std::cin >> inum;

    device = alldevs;
    for (int j = 0; j < inum - 1; j++) device = device->next;

    // INICIAR CAPTURA
    pcap_t *handle = pcap_open_live(device->name, 65536, 1, 10, errbuf);
    if (handle == nullptr) return 1;

    std::cout << "\n[OK] capturando e enviando para o servidor Python.\n";
    pcap_loop(handle, 0, packet_handler, nullptr);

    // LIMPEZA
    sqlite3_close(db);
    pcap_close(handle);
    pcap_freealldevs(alldevs);
    closesocket(udp_sock);
    WSACleanup();
    return 0;
}