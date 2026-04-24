import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

let ws;
const nodesData = {}; 
const recordedThreats = new Set();

const activePackets = []; 
const normalPacketGeom = new THREE.SphereGeometry(0.03, 8, 8);
const normalPacketMat = new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1 });
const threatPacketGeom = new THREE.SphereGeometry(0.08, 8, 8);
const threatPacketMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3 });

function mitigarAmeaca(ip) {
    const targetData = nodesData[ip];
    if (!targetData || targetData.isMitigated) return;
    
    targetData.isMitigated = true;
    targetData.sphere.userData.isMitigated = true;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "block", ip: ip }));
    }
    
    const logItemId = `log-item-${ip.replace(/\./g, '-')}`;
    const logItem = document.getElementById(logItemId);
    if (logItem) {
        logItem.className = 'threat-item mitigated';
        const now = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        logItem.innerHTML = `
            <span class="threat-ip">${ip}</span><br>
            <span class="threat-status">[DEFESA ATIVA]</span><br>
            <span class="threat-time">[${now}] - IP bloqueado pelo firewall</span>
        `;
    }

    if (selectedSphere && selectedSphere.userData.ip === ip) {
        const geo = selectedSphere.userData.geo || "[Rota Desconhecida]";
        document.getElementById('btn-block').style.display = 'none';
        
        document.getElementById('tooltip-ip').innerHTML = `
            IP: ${ip}<br>
            <span style="color:#aaddcc; font-size: 11px;">${geo}</span><br>
            <span style="color:#888; font-size: 12px; display: inline-block; margin-top: 6px; font-weight: bold;">[ IP bloqueado pelo firewall ]</span>
        `;
        document.getElementById('tooltip').style.border = '1px solid #555';
    }
}

async function fetchGeoLocation(ip, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (ip.match(/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.|0\.|22[4-9]\.|23[0-9]\.|255\.)/)) {
        el.innerText = ' - [LAN] Rede Local';
        if(nodesData[ip]) nodesData[ip].sphere.userData.geo = "[LAN] Rede Local";
        return;
    }

    try {
        const response = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`);
        const data = await response.json();
        if (data.country_code) {
            const geoString = `[${data.country_code}] ${data.country}`;
            el.innerText = ` - ${geoString}`;
            if(nodesData[ip]) nodesData[ip].sphere.userData.geo = geoString; 
        }
    } catch (e) {
        el.innerText = ' - [EXTERNO] Rota Oculta';
    }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.4, 0.9);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0x00ff88, 2, 100);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

const coreGeometry = new THREE.IcosahedronGeometry(1.2, 1);
const coreMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff88, wireframe: true });
const coreNode = new THREE.Mesh(coreGeometry, coreMaterial);
coreNode.userData = { ip: "CORE" }; 
scene.add(coreNode);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(); 
const tooltip = document.getElementById('tooltip');
const tooltipIpText = document.getElementById('tooltip-ip');
const btnBlock = document.getElementById('btn-block');
const interactableObjects = [coreNode]; 
let selectedSphere = null; 

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('mousedown', (e) => {
    if (e.target.id === 'btn-block' || e.target.classList.contains('btn-log-block') || e.target.id === 'btn-export') return;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects);
    if (intersects.length > 0) {
        selectedSphere = intersects[0].object;
        const ip = selectedSphere.userData.ip;
        
        if (selectedSphere.userData.isMitigated) {
            tooltipIpText.innerHTML = `
                IP: ${ip}<br>
                <span style="color:#aaddcc; font-size: 11px;">${selectedSphere.userData.geo || ''}</span><br>
                <span style="color:#888; font-size: 12px; display: inline-block; margin-top: 6px; font-weight: bold;">[ IP bloqueado pelo firewall ]</span>
            `;
            btnBlock.style.display = 'none';
            tooltip.style.border = '1px solid #555';
        } else if (selectedSphere.userData.isAnomaly) {
            tooltipIpText.innerHTML = `
                IP: ${ip}<br>
                <span style="color:#0f0;font-size:11px;">${selectedSphere.userData.geo || ''}</span><br>
                <span style="color:#ffaa00; font-size: 12px; display: inline-block; margin-top: 6px;">> ${selectedSphere.userData.attackType || 'Ataque'}</span>
            `;
            btnBlock.style.display = 'block';
            tooltip.style.border = '1px solid #00ff88';
        } else {
            tooltipIpText.innerHTML = `IP: ${ip}<br><span style="color:#0f0;font-size:11px;">${selectedSphere.userData.geo || ''}</span>`;
            btnBlock.style.display = 'none';
            tooltip.style.border = '1px solid #00ff88';
        }
        
        tooltip.style.display = 'block';
    } else {
        selectedSphere = null;
        tooltip.style.display = 'none';
    }
});

btnBlock.addEventListener('click', () => {
    if (selectedSphere) mitigarAmeaca(selectedSphere.userData.ip);
});

document.getElementById('btn-export').addEventListener('click', () => {
    let csvContent = "Data/Hora,IP Atacante,Origem Geografica,Tipo de Ataque,Nivel de Risco (Loss),Status de Defesa\n";
    recordedThreats.forEach(ip => {
        const data = nodesData[ip];
        if(data && data.isAnomaly) {
            const time = data.sphere.userData.timestamp || "N/A";
            const geo = data.sphere.userData.geo || "Desconhecida";
            const type = data.sphere.userData.attackType || "Anomalia Genérica";
            const loss = data.sphere.userData.loss || "N/A";
            const status = data.isMitigated ? "MITIGADO (BLOQUEADO)" : "ALERTA ATIVO";
            csvContent += `${time},${ip},${geo},${type},${loss},${status}\n`;
        }
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sentinel_report.csv`);
    link.click();
});

function connect() {
    // Detecção automática do Hostname para evitar hardcoded IPs
    const serverHostname = window.location.hostname || "127.0.0.1";
    ws = new WebSocket(`ws://${serverHostname}:8765`);
    
    ws.onopen = () => { document.getElementById('status').innerText = "CORE: CONECTADO"; };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (nodesData[data.dst]?.isMitigated) return;
        document.getElementById('last-packet').innerText = `PACOTE: ${data.src} -> ${data.dst}`;

        if (!nodesData[data.dst]) {
            const sphereGeom = new THREE.SphereGeometry(0.2, 16, 16);
            const sphereMat = new THREE.MeshPhongMaterial({ color: 0x0088ff, emissive: 0x0044ff, emissiveIntensity: 0.1 });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.userData = { ip: data.dst, isAnomaly: false, isMitigated: false, geo: "" }; 
            interactableObjects.push(sphere); 
            
            const angle = Math.random() * Math.PI * 2;
            const r = 6 + Math.random() * 4;
            sphere.position.set(Math.cos(angle) * r, Math.sin(angle) * r, (Math.random() - 0.5) * 5);
            scene.add(sphere);

            const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), sphere.position]);
            const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0 });
            const line = new THREE.Line(lineGeom, lineMat);
            scene.add(line);
            nodesData[data.dst] = { sphere: sphere, line: line, pulse: 0, isAnomaly: false, isMitigated: false };
        }

        const targetData = nodesData[data.dst];
        targetData.pulse = 1.0; 

        if (!targetData.isMitigated) {
            const pMesh = new THREE.Mesh(
                data.anomaly ? threatPacketGeom : normalPacketGeom, 
                data.anomaly ? threatPacketMat : normalPacketMat
            );
            pMesh.position.copy(targetData.sphere.position);
            pMesh.layers.set(1); 
            scene.add(pMesh);

            activePackets.push({
                mesh: pMesh,
                start: targetData.sphere.position.clone(),
                end: new THREE.Vector3(0, 0, 0),
                progress: 0,
                speed: data.anomaly ? 0.04 : 0.015 
            });
        }

        if (data.anomaly) {
            targetData.isAnomaly = true;
            targetData.sphere.userData.isAnomaly = true;
            targetData.sphere.userData.attackType = data.type; 
            targetData.sphere.material.color.set(0xff0000);
            targetData.sphere.material.emissive.set(0xff0000);
            targetData.sphere.material.emissiveIntensity = 2;
            targetData.line.material.color.set(0xff0000);
            
            if (!recordedThreats.has(data.dst)) {
                recordedThreats.add(data.dst);
                const item = document.createElement('div');
                item.className = 'threat-item';
                item.id = `log-item-${data.dst.replace(/\./g, '-')}`;
                const geoId = `geo-${data.dst.replace(/\./g, '-')}`;
                const now = new Date().toLocaleTimeString('pt-BR', { hour12: false });
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <span class="threat-ip">${data.dst}</span>
                        <button class="btn-log-block">BLOQUEAR</button>
                    </div>
                    <span id="${geoId}" class="threat-geo"> - [Verificando...]</span><br>
                    <span style="color: #ffaa00; font-size: 0.8rem; font-weight: bold;">[${data.type || 'Anomalia LAN'}]</span>
                    <span class="threat-time">[${now}] - Loss: ${data.loss.toFixed(4)}</span>
                `;
                document.getElementById('threat-list').prepend(item);
                fetchGeoLocation(data.dst, geoId);
                item.querySelector('.btn-log-block').onclick = () => mitigarAmeaca(data.dst);
            }
            document.getElementById('anomaly-count').innerText = Object.values(nodesData).filter(n => n.isAnomaly).length;
        }
    };
    ws.onclose = () => setTimeout(connect, 2000);
}
connect();

function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    coreNode.rotation.y += 0.005;

    for (const ip in nodesData) {
        const data = nodesData[ip];
        if (data.pulse > 0) {
            data.pulse -= 0.015;
            if (!data.isAnomaly) data.line.material.opacity = data.pulse;
        }
        if (data.isAnomaly && !data.isMitigated) data.line.material.opacity = 0.7;
        if (data.isMitigated) {
            data.line.material.opacity = 0;
            data.sphere.material.color.set(0x333333);
            data.sphere.material.emissiveIntensity = 0;
        }
    }

    for (let i = activePackets.length - 1; i >= 0; i--) {
        const p = activePackets[i];
        p.progress += p.speed;
        
        if (p.progress >= 1) {
            scene.remove(p.mesh);
            activePackets.splice(i, 1);
        } else {
            p.mesh.position.lerpVectors(p.start, p.end, p.progress);
        }
    }

    if (selectedSphere) {
        const vector = new THREE.Vector3();
        selectedSphere.updateMatrixWorld();
        vector.setFromMatrixPosition(selectedSphere.matrixWorld);
        vector.project(camera);

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y) * 0.5 + 0.5) * window.innerHeight;

        tooltip.style.left = `${x + 20}px`;
        tooltip.style.top = `${y - 20}px`;
    }

    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});