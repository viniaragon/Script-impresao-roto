/**
 * Frontend JavaScript - Lógica da interface
 */

// Estado da aplicação
const state = {
    connected: false,
    watching: false,
    agents: [],
    selectedAgent: null,
    files: [],
    stats: { sent: 0, errors: 0, pending: 0 }
};

// Elementos DOM
const elements = {
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    folderPath: document.getElementById('folder-path'),
    btnBrowse: document.getElementById('btn-browse'),
    agentSelect: document.getElementById('agent-select'),
    printerSelect: document.getElementById('printer-select'),
    btnStart: document.getElementById('btn-start'),
    fileList: document.getElementById('file-list'),
    statSent: document.getElementById('stat-sent'),
    statErrors: document.getElementById('stat-errors'),
    statPending: document.getElementById('stat-pending')
};

// === Inicialização ===
async function init() {
    setupEventListeners();
    await loadConfig();
    await connectToServer();
}

// === Event Listeners ===
function setupEventListeners() {
    // Controles da janela
    document.getElementById('btn-minimize').addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });

    document.getElementById('btn-close').addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    // Seletor de pasta
    elements.btnBrowse.addEventListener('click', async () => {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
            elements.folderPath.value = folder;
            saveConfig({ watchFolder: folder });
            updateStartButton();
        }
    });

    // Seletor de agente
    elements.agentSelect.addEventListener('change', (e) => {
        const agentId = e.target.value;
        state.selectedAgent = state.agents.find(a => a.id === agentId);
        updatePrinterSelect();
        saveConfig({ targetAgentId: agentId });
        updateStartButton();
    });

    // Seletor de impressora
    elements.printerSelect.addEventListener('change', (e) => {
        saveConfig({ targetPrinterId: e.target.value });
        updateStartButton();
    });

    // Botão iniciar/parar
    elements.btnStart.addEventListener('click', toggleWatching);

    // Eventos do socket
    window.electronAPI.onSocketEvent(handleSocketEvent);

    // Eventos do watcher
    window.electronAPI.onWatcherStatus(handleWatcherStatus);
}

// === Configuração ===
async function loadConfig() {
    const config = await window.electronAPI.loadConfig();
    if (config.watchFolder) {
        elements.folderPath.value = config.watchFolder;
    }
    state.savedAgentId = config.targetAgentId;
    state.savedPrinterId = config.targetPrinterId;
}

async function saveConfig(updates) {
    await window.electronAPI.saveConfig(updates);
}

// === Conexão ===
async function connectToServer() {
    updateStatus('connecting', 'Conectando...');

    const result = await window.electronAPI.connectServer();

    if (result.success) {
        state.connected = true;
        updateStatus('connected', 'Conectado ao servidor');
        await loadAgents();
    } else {
        updateStatus('error', `Erro: ${result.error}`);
    }
}

async function loadAgents() {
    state.agents = await window.electronAPI.getAgents();
    updateAgentSelect();
}

// === UI Updates ===
function updateStatus(type, text) {
    elements.statusIndicator.className = 'status-indicator ' + type;
    elements.statusText.textContent = text;
}

function updateAgentSelect() {
    elements.agentSelect.innerHTML = '';

    if (state.agents.length === 0) {
        elements.agentSelect.innerHTML = '<option value="">Nenhum agente disponível</option>';
        elements.agentSelect.disabled = true;
        return;
    }

    elements.agentSelect.innerHTML = '<option value="">Selecione um agente...</option>';

    state.agents.forEach(agent => {
        const option = document.createElement('option');
        option.value = agent.id;
        option.textContent = `${agent.name} (${agent.printers?.length || 0} impressoras)`;
        elements.agentSelect.appendChild(option);
    });

    elements.agentSelect.disabled = false;

    // Restaura seleção salva
    if (state.savedAgentId) {
        elements.agentSelect.value = state.savedAgentId;
        state.selectedAgent = state.agents.find(a => a.id === state.savedAgentId);
        updatePrinterSelect();
    }
}

function updatePrinterSelect() {
    elements.printerSelect.innerHTML = '';

    if (!state.selectedAgent || !state.selectedAgent.printers?.length) {
        elements.printerSelect.innerHTML = '<option value="">Nenhuma impressora</option>';
        elements.printerSelect.disabled = true;
        return;
    }

    elements.printerSelect.innerHTML = '<option value="">Selecione uma impressora...</option>';

    state.selectedAgent.printers.forEach(printer => {
        const option = document.createElement('option');
        option.value = printer.id;
        option.textContent = printer.name;
        elements.printerSelect.appendChild(option);
    });

    elements.printerSelect.disabled = false;

    // Restaura seleção salva
    if (state.savedPrinterId) {
        elements.printerSelect.value = state.savedPrinterId;
    }
}

function updateStartButton() {
    const canStart = elements.folderPath.value &&
        elements.agentSelect.value &&
        elements.printerSelect.value;

    elements.btnStart.disabled = !canStart;
}

function updateFileList() {
    if (state.files.length === 0) {
        elements.fileList.innerHTML = '<div class="file-list-empty">Nenhum arquivo enviado ainda</div>';
        return;
    }

    elements.fileList.innerHTML = state.files.slice(0, 20).map(file => `
        <div class="file-item ${file.status}">
            <span class="file-item-time">${file.time}</span>
            <span class="file-item-icon">${getStatusIcon(file.status)}</span>
            <span class="file-item-name" title="${file.name}">${file.name}</span>
        </div>
    `).join('');
}

function updateStats() {
    elements.statSent.textContent = state.stats.sent;
    elements.statErrors.textContent = state.stats.errors;
    elements.statPending.textContent = state.stats.pending;
}

function getStatusIcon(status) {
    const icons = {
        success: '✅',
        error: '❌',
        pending: '⏳',
        uploading: '📤'
    };
    return icons[status] || '📄';
}

function getCurrentTime() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// === Watcher ===
async function toggleWatching() {
    if (state.watching) {
        await stopWatching();
    } else {
        await startWatching();
    }
}

async function startWatching() {
    const options = {
        folder: elements.folderPath.value,
        agentId: elements.agentSelect.value,
        printerId: elements.printerSelect.value
    };

    console.log('🚀 Iniciando watcher com:', options);

    const result = await window.electronAPI.startWatcher(options);

    if (result.success) {
        state.watching = true;
        elements.btnStart.innerHTML = '<span class="btn-icon">⏹️</span><span class="btn-text">Parar Monitoramento</span>';
        elements.btnStart.classList.add('btn-stop');
        elements.btnStart.classList.remove('btn-primary');

        // Desabilita controles
        elements.btnBrowse.disabled = true;
        elements.agentSelect.disabled = true;
        elements.printerSelect.disabled = true;
    }
}

async function stopWatching() {
    await window.electronAPI.stopWatcher();

    state.watching = false;
    elements.btnStart.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Iniciar Monitoramento</span>';
    elements.btnStart.classList.remove('btn-stop');
    elements.btnStart.classList.add('btn-primary');

    // Reabilita controles
    elements.btnBrowse.disabled = false;
    elements.agentSelect.disabled = false;
    elements.printerSelect.disabled = false;
}

// === Event Handlers ===
function handleSocketEvent({ event, data }) {
    console.log('Socket event:', event, data);

    switch (event) {
        case 'connected':
            state.connected = true;
            updateStatus('connected', 'Conectado ao servidor');
            loadAgents();
            break;

        case 'disconnected':
            state.connected = false;
            updateStatus('error', 'Desconectado');
            break;

        case 'agent-connected':
            loadAgents();
            break;

        case 'agent-disconnected':
            loadAgents();
            break;

        case 'job-status':
            handleJobStatus(data);
            break;
    }
}

function handleWatcherStatus(status) {
    console.log('Watcher status:', status);

    // Verifica se o arquivo já está na lista
    const existingFile = state.files.find(f => f.name === status.fileName);

    switch (status.type) {
        case 'processing':
            // Só adiciona se não existir
            if (!existingFile && status.fileName) {
                state.stats.pending++;
                state.files.unshift({
                    name: status.fileName,
                    status: 'pending',
                    time: getCurrentTime()
                });
            }
            break;

        case 'uploading':
            // Apenas atualiza status visual, não adiciona novo
            if (existingFile) {
                existingFile.status = 'pending';
            }
            break;

        case 'sent':
            state.stats.pending = Math.max(0, state.stats.pending - 1);
            state.stats.sent++;
            updateFileStatus(status.fileName, 'success');
            break;

        case 'error':
            state.stats.pending = Math.max(0, state.stats.pending - 1);
            state.stats.errors++;
            updateFileStatus(status.fileName, 'error');
            break;
    }

    updateFileList();
    updateStats();
}

function handleJobStatus(data) {
    if (data.status === 'completed') {
        // Arquivo impresso com sucesso
    } else if (data.status === 'error') {
        state.stats.errors++;
        updateStats();
    }
}

function updateFileStatus(fileName, status) {
    const file = state.files.find(f => f.name === fileName);
    if (file) {
        file.status = status;
    }
}

// === Init ===
init();
