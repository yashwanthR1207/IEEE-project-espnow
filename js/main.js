// Connect to the Node.js Server via WebSocket
const socket = io();

const state = {
    network: { relayA: 'online', relayB: 'online', activeRoute: 'A' },
    emergency: { active: false, type: null },
    stats: { sent: 0 }
};

const svgContainer = document.getElementById('topology-svg');
const packetContainer = document.getElementById('packet-container');
const eventLog = document.getElementById('event-log');

// Socket Events
socket.on('connect', () => {
    console.log('Connected to Server');
});

socket.on('log', (data) => {
    addLog(data.message, data.type);
});

// Real-time telemetry from ESP32 Base Node
socket.on('telemetry', (data) => {
    // Example data: { node: "HZ02", temp: 35.2, hum: 60, event: "NONE" }
    if(data.node === "HZ02") {
        if(data.temp) document.getElementById('val-temp').textContent = `${data.temp} °C`;
        if(data.hum) document.getElementById('val-hum').textContent = `${data.hum} %`;
        
        if(data.event && data.event !== "NONE" && !state.emergency.active) {
            simulateEmergency(data.event);
        } else if (data.event === "NONE" && state.emergency.active) {
            resetNetwork();
        }
    }
});

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

function addLog(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    let color = 'text-slate-400';
    if(type === 'CRITICAL') color = 'text-red-500 font-bold';
    if(type === 'SUCCESS') color = 'text-emerald-500 font-bold';
    if(type === 'WARNING') color = 'text-amber-500 font-bold';
    if(type === 'CYAN') color = 'text-cyan-500 font-bold';

    const logEntry = document.createElement('div');
    logEntry.className = 'flex gap-3 animate-[fadeIn_0.3s_ease-out]';
    logEntry.innerHTML = `
        <span class="text-slate-500 flex-shrink-0">[${time}]</span>
        <span class="${color}">${msg}</span>
    `;
    eventLog.prepend(logEntry);
    if(eventLog.children.length > 50) eventLog.removeChild(eventLog.lastChild);
}

function spawnPacket(route, isEmergency = false) {
    const ns = "http://www.w3.org/2000/svg";
    const packet = document.createElementNS(ns, "circle");
    packet.setAttribute("r", isEmergency ? "2.5" : "2");
    
    if (isEmergency) {
        packet.setAttribute("fill", "#0f172a");
    } else {
        packet.setAttribute("fill", "#64748b");
    }

    const animateMotion = document.createElementNS(ns, "animateMotion");
    animateMotion.setAttribute("dur", isEmergency ? "0.8s" : "1.5s");
    animateMotion.setAttribute("fill", "freeze");
    
    const mpath = document.createElementNS(ns, "mpath");
    mpath.setAttribute("href", `#path-${route}`);
    
    animateMotion.appendChild(mpath);
    packet.appendChild(animateMotion);
    packetContainer.appendChild(packet);

    setTimeout(() => { if (packet.parentNode) packet.parentNode.removeChild(packet); }, isEmergency ? 900 : 1600);
    state.stats.sent++;
}

// Background ping for simulation
setInterval(() => {
    if(!state.emergency.active) {
        const useA = state.network.relayA === 'online' && state.network.activeRoute === 'A';
        const useB = state.network.relayB === 'online' && state.network.activeRoute === 'B';
        const useBoth = state.network.relayA === 'online' && state.network.relayB === 'online' && state.network.activeRoute === 'A'; 
        
        if (useBoth) {
            spawnPacket('hz-ra'); spawnPacket('hz-rb');
            setTimeout(() => { spawnPacket('ra-base'); spawnPacket('rb-base'); }, 1500);
        } else if (useA) {
            spawnPacket('hz-ra'); setTimeout(() => spawnPacket('ra-base'), 1500);
        } else if (useB) {
            spawnPacket('hz-rb'); setTimeout(() => spawnPacket('rb-base'), 1500);
        }
    }
}, 3500);

let emInterval = null;
function startEmergencyPackets() {
    if(emInterval) clearInterval(emInterval);
    emInterval = setInterval(() => {
        if(state.emergency.active) {
            const useA = state.network.relayA === 'online' && state.network.activeRoute === 'A';
            const useB = state.network.relayB === 'online' && state.network.activeRoute === 'B';
            const useBoth = state.network.relayA === 'online' && state.network.relayB === 'online' && state.network.activeRoute === 'A';
            
            if (useBoth) {
                spawnPacket('hz-ra', true); spawnPacket('hz-rb', true);
                setTimeout(() => { spawnPacket('ra-base', true); spawnPacket('rb-base', true); }, 800);
            } else if (useA) {
                spawnPacket('hz-ra', true); setTimeout(() => spawnPacket('ra-base', true), 800);
            } else if (useB) {
                spawnPacket('hz-rb', true); setTimeout(() => spawnPacket('rb-base', true), 800);
            }
        }
    }, 1200);
}
function stopEmergencyPackets() { if(emInterval) clearInterval(emInterval); }

window.simulateEmergency = function(type) {
    if(state.emergency.active) resetSensors();
    state.emergency.active = true; state.emergency.type = type;
    
    // Optional: send test command back to server/ESP32
    socket.emit('control_command', `SIMULATE_${type}`);

    const panel = document.getElementById('emergency-panel');
    panel.classList.add('panel-emergency');
    
    document.getElementById('em-badge').textContent = 'CRITICAL';
    document.getElementById('em-badge').className = 'px-3 py-1 text-[10px] font-bold bg-red-50 text-red-500 rounded-full shadow-sm animate-pulse';
    
    document.getElementById('em-content-normal').classList.add('hidden');
    document.getElementById('em-content-alert').classList.remove('hidden');
    document.getElementById('em-content-alert').classList.add('flex');
    
    document.getElementById('em-event-text').textContent = type + ' DETECTED';
    const routeText = state.network.activeRoute === 'A' ? (state.network.relayB === 'online' ? 'MULTIPLE PATHS (A+B)' : 'HZ → RA → BASE') : 'HZ → RB → BASE';
    document.getElementById('em-route-text').textContent = routeText;

    if(type === 'FIRE') { updateSensor('flame', 'DANGER', 'FIRE DETECTED', true); updateSensor('temp', '58.4 °C', 'CRITICAL', true); }
    if(type === 'FLOOD') { updateSensor('water', 'DANGER', 'FLOOD DETECTED', true); }
    if(type === 'GAS') { updateSensor('gas', 'DANGER', 'LEAK DETECTED', true); }

    addLog(`${type} DETECTED — NODE 02`, 'CRITICAL');
    addLog(`P0 EMERGENCY PACKET GENERATED`, 'WARNING');
    setTimeout(() => {
        addLog(`BASE RECEIVED EMERGENCY`, 'CRITICAL');
        addLog(`ALERT DELIVERED SUCCESSFULLY`, 'SUCCESS');
    }, 1000);
    startEmergencyPackets();
}

function updateSensor(id, val, stat, isAlert) {
    const valEl = document.getElementById(`val-${id}`);
    const statEl = document.getElementById(`stat-${id}`);
    
    if(valEl) {
        valEl.textContent = val;
        valEl.className = `font-mono text-xl font-bold mb-2 ${isAlert ? 'text-red-500' : 'text-emerald-500'}`;
        if(id==='temp') valEl.className = `font-mono text-3xl font-bold mb-2 ${isAlert ? 'text-red-500' : 'text-slate-800'}`;
    }
    if(statEl) {
        statEl.textContent = stat;
        if(isAlert) {
            statEl.className = 'text-xs text-red-500 font-bold uppercase animate-pulse';
        }
    }
}

function resetSensors() {
    document.getElementById('val-temp').textContent = '31.2 °C';
    document.getElementById('val-temp').className = 'font-mono text-3xl font-bold mb-2 text-slate-800';
    document.getElementById('stat-temp').textContent = 'NORMAL';
    document.getElementById('stat-temp').className = 'text-xs font-bold text-emerald-500';
    
    updateSensor('water', 'SAFE', 'No Flood Detected', false);
    updateSensor('gas', 'SAFE', 'NORMAL', false);
    updateSensor('flame', 'SAFE', 'No Fire Detected', false);
}

window.toggleRelay = function(relayLetter) {
    if (relayLetter === 'A') {
        if (state.network.relayA === 'online') {
            state.network.relayA = 'offline';
            document.getElementById('node-relay-a').classList.remove('online');
            document.getElementById('node-relay-a').classList.add('offline');
            document.getElementById('status-text-ra').textContent = 'OFFLINE';
            document.getElementById('status-text-ra').className = 'text-[10px] text-red-500 font-bold mt-1';
            
            document.getElementById('path-hz-ra').setAttribute('stroke', '#ef4444');
            document.getElementById('path-ra-base').setAttribute('stroke', '#ef4444');
            document.getElementById('path-hz-rb').setAttribute('stroke', '#06b6d4');
            document.getElementById('path-hz-rb').setAttribute('stroke-width', '1.5');
            document.getElementById('path-rb-base').setAttribute('stroke', '#06b6d4');
            document.getElementById('path-rb-base').setAttribute('stroke-width', '1.5');

            document.getElementById('ni-nodes').textContent = '3 / 4';
            document.getElementById('active-nodes-count').textContent = '3/4 Nodes';
            document.getElementById('ni-paths').textContent = '1';
            document.getElementById('ni-primary').textContent = 'Relay B';
            document.getElementById('ni-backup').textContent = 'OFFLINE';
            document.getElementById('ni-backup').className = 'text-sm font-bold text-red-500';
            document.getElementById('ni-status').textContent = 'RECOVERED';
            document.getElementById('ni-status').className = 'text-sm font-bold text-amber-500';
            document.getElementById('btn-toggle-a').textContent = 'Enable Relay A (Restore)';
            state.network.activeRoute = 'B';
            addLog('RELAY A FAILURE DETECTED', 'CRITICAL');
            
            setTimeout(() => {
                addLog('TRAFFIC ROUTED THROUGH RELAY B', 'CYAN');
                const notif = document.getElementById('recovery-notification');
                document.getElementById('recovery-text').textContent = 'ROUTE RECOVERED';
                notif.classList.remove('opacity-0');
                setTimeout(() => notif.classList.add('opacity-0'), 3000);
                if(state.emergency.active) document.getElementById('em-route-text').textContent = 'HZ → RB → BASE';
            }, 500);
        } else {
            state.network.relayA = 'online';
            document.getElementById('node-relay-a').classList.remove('offline');
            document.getElementById('node-relay-a').classList.add('online');
            document.getElementById('status-text-ra').textContent = 'ONLINE';
            document.getElementById('status-text-ra').className = 'text-[10px] text-emerald-500 font-bold mt-1';
            
            document.getElementById('path-hz-ra').setAttribute('stroke', '#94a3b8');
            document.getElementById('path-ra-base').setAttribute('stroke', '#94a3b8');
            document.getElementById('path-hz-rb').setAttribute('stroke', '#94a3b8');
            document.getElementById('path-hz-rb').setAttribute('stroke-width', '0.5');
            document.getElementById('path-rb-base').setAttribute('stroke', '#94a3b8');
            document.getElementById('path-rb-base').setAttribute('stroke-width', '0.5');

            document.getElementById('ni-nodes').textContent = '4 / 4';
            document.getElementById('active-nodes-count').textContent = '4/4 Nodes';
            document.getElementById('ni-paths').textContent = '2';
            document.getElementById('ni-primary').textContent = 'Relay A';
            document.getElementById('ni-backup').textContent = 'Relay B';
            document.getElementById('ni-backup').className = 'text-sm font-bold text-slate-400';
            document.getElementById('ni-status').textContent = 'HEALTHY';
            document.getElementById('ni-status').className = 'text-sm font-bold text-emerald-500';
            document.getElementById('btn-toggle-a').textContent = 'Disable Relay A';
            state.network.activeRoute = 'A';
            
            addLog('RELAY A RECONNECTED', 'SUCCESS');
            const notif = document.getElementById('recovery-notification');
            document.getElementById('recovery-text').textContent = 'NODE RECOVERED';
            notif.classList.remove('opacity-0');
            setTimeout(() => notif.classList.add('opacity-0'), 3000);
            if(state.emergency.active) document.getElementById('em-route-text').textContent = 'MULTIPLE PATHS (A+B)';
        }
    }
}

window.resetNetwork = function() {
    state.emergency.active = false;
    state.emergency.type = null;
    stopEmergencyPackets();
    resetSensors();
    
    // Tell the server we reset
    socket.emit('control_command', 'RESET_NETWORK');
    
    const panel = document.getElementById('emergency-panel');
    panel.classList.remove('panel-emergency');
    
    document.getElementById('em-badge').textContent = 'NORMAL';
    document.getElementById('em-badge').className = 'px-3 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-500 rounded-full shadow-sm';
    
    document.getElementById('em-content-alert').classList.add('hidden');
    document.getElementById('em-content-alert').classList.remove('flex');
    document.getElementById('em-content-normal').classList.remove('hidden');
    
    if(state.network.relayA === 'offline') toggleRelay('A');
    addLog('SYSTEM RESET - NORMAL OPERATIONS', 'SUCCESS');
}

document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
});
