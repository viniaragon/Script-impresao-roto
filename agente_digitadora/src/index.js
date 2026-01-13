/**
 * EchoLink Digitadora Agent - Monitor de Pasta para Impressão
 * 
 * Responsável por:
 * - Monitorar pasta selecionada pelo usuário
 * - Detectar novos arquivos e enviá-los para impressão
 * - Controlar duplicatas e status de impressão
 */

const { io } = require('socket.io-client');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { Select, Input } = require('enquirer');
const FormData = require('form-data');
const fetch = require('node-fetch');

const { loadConfig, saveConfig, updateConfig } = require('./config');
const {
    hasBeenSent,
    markAsSent,
    updateJobStatus,
    cleanOldHistory,
    getFailedFiles
} = require('./history');

// Configurações do servidor
const SERVER_URL = process.env.SERVER_URL || 'https://echolink-backend-production.up.railway.app';

// Tipos de arquivo suportados para impressão
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.txt', '.doc', '.docx', '.xls', '.xlsx'];

// Estado global
let socket = null;
let watcher = null;
let config = null;
let availableAgents = [];
let isProcessing = false;
const pendingJobs = new Map();

/**
 * Exibe banner de início
 */
function showBanner() {
    console.log('');
    console.log('══════════════════════════════════════════════════');
    console.log('   📁  EchoLink Digitadora Agent');
    console.log('   Monitor de pasta para impressão automática');
    console.log('══════════════════════════════════════════════════');
    console.log('');
}

/**
 * Verifica se arquivo é suportado para impressão
 */
function isSupportedFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Aguarda arquivo estar completamente escrito
 */
function waitForFile(filePath, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let lastSize = -1;

        const check = () => {
            try {
                const stats = fs.statSync(filePath);

                if (stats.size === lastSize && stats.size > 0) {
                    // Tamanho estável, arquivo pronto
                    resolve(true);
                    return;
                }

                lastSize = stats.size;

                if (Date.now() - startTime > timeout) {
                    resolve(true); // Timeout, tenta assim mesmo
                    return;
                }

                setTimeout(check, 500);
            } catch (error) {
                // Arquivo pode ter sido removido
                reject(new Error('Arquivo não encontrado'));
            }
        };

        setTimeout(check, 500);
    });
}

/**
 * Faz upload do arquivo para o servidor
 */
async function uploadFile(filePath) {
    const form = new FormData();
    const fileName = path.basename(filePath);
    const fileStream = fs.createReadStream(filePath);

    form.append('file', fileStream, fileName);

    const response = await fetch(`${SERVER_URL}/api/upload`, {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro no upload');
    }

    return response.json();
}

/**
 * Envia job de impressão para o agente destino
 */
function sendPrintJob(fileUrl, fileName, jobId) {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            reject(new Error('Não conectado ao servidor'));
            return;
        }

        // Debug: mostra para qual agente estamos enviando
        console.log(`   📍 Destino: agentId=${config.targetAgentId}`);
        console.log(`   📍 Impressora: printerId=${config.targetPrinterId}`);

        socket.emit('print:send-job', {
            jobId,
            agentId: config.targetAgentId,
            printerId: config.targetPrinterId,
            fileUrl,
            fileName
        });

        // Armazena job pendente para rastreamento
        pendingJobs.set(jobId, {
            fileName,
            sentAt: new Date().toISOString(),
            status: 'sent'
        });

        resolve(jobId);
    });
}

/**
 * Processa um novo arquivo detectado
 */
async function processNewFile(filePath) {
    if (isProcessing) {
        // Aguarda processamento anterior
        setTimeout(() => processNewFile(filePath), 1000);
        return;
    }

    isProcessing = true;
    const fileName = path.basename(filePath);

    try {
        // Verifica se arquivo é suportado
        if (!isSupportedFile(filePath)) {
            console.log(`   ⚠️ Ignorado (tipo não suportado): ${fileName}`);
            return;
        }

        // Verifica se já foi enviado
        if (hasBeenSent(filePath)) {
            console.log(`   ⏭️ Já enviado anteriormente: ${fileName}`);
            return;
        }

        console.log(`\n📄 Novo arquivo detectado: ${fileName}`);

        // Aguarda arquivo estar pronto
        console.log('   ⏳ Aguardando arquivo estar pronto...');
        await waitForFile(filePath);

        // Gera ID único para o job
        const jobId = `job-${Date.now()}-${uuidv4().slice(0, 8)}`;

        // Marca como enviado (antes do upload para evitar duplicatas)
        markAsSent(filePath, jobId);

        // Faz upload
        console.log('   📤 Enviando para servidor...');
        const uploadResult = await uploadFile(filePath);
        console.log('   ✓ Upload concluído');

        // Envia job de impressão
        console.log('   🖨️ Enviando para impressão...');
        await sendPrintJob(uploadResult.url, fileName, jobId);
        console.log(`   ✓ Job enviado: ${jobId}`);

    } catch (error) {
        console.error(`   ❌ Erro: ${error.message}`);
        // Atualiza histórico com erro
        updateJobStatus(filePath, 'error', error.message);
    } finally {
        isProcessing = false;
    }
}

/**
 * Inicia o monitoramento da pasta
 */
function startWatching(folderPath) {
    // Para watcher anterior se existir
    if (watcher) {
        watcher.close();
    }

    console.log(`\n👁️ Iniciando monitoramento: ${folderPath}`);

    watcher = chokidar.watch(folderPath, {
        ignored: /(^|[\/\\])\../, // Ignora arquivos ocultos
        persistent: true,
        ignoreInitial: true, // Ignora arquivos existentes
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher.on('add', (filePath) => {
        processNewFile(filePath);
    });

    watcher.on('error', (error) => {
        console.error('❌ Erro no watcher:', error.message);
    });

    console.log('✅ Monitoramento ativo!');
    console.log('⏳ Aguardando novos arquivos...\n');
}

/**
 * Seleciona pasta para monitoramento
 */
async function selectFolder() {
    // Tenta usar pasta salva
    if (config.watchFolder && fs.existsSync(config.watchFolder)) {
        const prompt = new Select({
            name: 'useExisting',
            message: `Usar pasta anterior? (${config.watchFolder})`,
            choices: ['Sim', 'Escolher outra pasta']
        });

        const answer = await prompt.run();
        if (answer === 'Sim') {
            return config.watchFolder;
        }
    }

    // Solicita nova pasta
    const prompt = new Input({
        name: 'folder',
        message: 'Caminho da pasta para monitorar:',
        initial: config.watchFolder || path.join(os.homedir(), 'Documents')
    });

    const folder = await prompt.run();

    // Valida pasta
    if (!fs.existsSync(folder)) {
        console.log('❌ Pasta não encontrada!');
        return selectFolder();
    }

    const stats = fs.statSync(folder);
    if (!stats.isDirectory()) {
        console.log('❌ O caminho não é uma pasta!');
        return selectFolder();
    }

    // Salva configuração
    updateConfig({ watchFolder: folder });

    return folder;
}

/**
 * Seleciona agente destino (PC do médico)
 */
async function selectAgent() {
    if (availableAgents.length === 0) {
        console.log('❌ Nenhum agente de impressão conectado!');
        console.log('   Aguarde um agente conectar ou verifique o PC do médico.');

        // Aguarda agentes
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (availableAgents.length > 0) {
                    clearInterval(checkInterval);
                    resolve(selectAgent());
                }
            }, 2000);
        });
    }

    // Se já tem agente configurado e ele está disponível
    if (config.targetAgentId) {
        const existingAgent = availableAgents.find(a => a.id === config.targetAgentId);
        if (existingAgent) {
            const prompt = new Select({
                name: 'useExisting',
                message: `Usar agente anterior? (${existingAgent.name})`,
                choices: ['Sim', 'Escolher outro agente']
            });

            const answer = await prompt.run();
            if (answer === 'Sim') {
                return existingAgent;
            }
        }
    }

    // Lista agentes disponíveis
    const choices = availableAgents.map(agent => ({
        name: agent.id,
        message: `${agent.name} (${agent.printers?.length || 0} impressoras)`,
        value: agent
    }));

    const prompt = new Select({
        name: 'agent',
        message: 'Selecione o agente de impressão (PC destino):',
        choices: choices.map(c => c.message)
    });

    const answer = await prompt.run();
    const selectedIndex = choices.findIndex(c => c.message === answer);
    const selectedAgent = availableAgents[selectedIndex];

    updateConfig({ targetAgentId: selectedAgent.id });

    return selectedAgent;
}

/**
 * Seleciona impressora no agente destino
 */
async function selectPrinter(agent) {
    if (!agent.printers || agent.printers.length === 0) {
        console.log('❌ Nenhuma impressora disponível no agente!');
        return null;
    }

    // Se já tem impressora configurada e ela está disponível
    if (config.targetPrinterId) {
        const existingPrinter = agent.printers.find(p => p.id === config.targetPrinterId);
        if (existingPrinter) {
            const prompt = new Select({
                name: 'useExisting',
                message: `Usar impressora anterior? (${existingPrinter.name})`,
                choices: ['Sim', 'Escolher outra impressora']
            });

            const answer = await prompt.run();
            if (answer === 'Sim') {
                return existingPrinter;
            }
        }
    }

    const choices = agent.printers.map(p => ({
        name: p.id,
        message: p.name,
        value: p
    }));

    const prompt = new Select({
        name: 'printer',
        message: 'Selecione a impressora:',
        choices: choices.map(c => c.message)
    });

    const answer = await prompt.run();
    const selectedIndex = choices.findIndex(c => c.message === answer);
    const selectedPrinter = agent.printers[selectedIndex];

    updateConfig({ targetPrinterId: selectedPrinter.id });

    return selectedPrinter;
}

/**
 * Conecta ao servidor WebSocket
 */
function connectToServer() {
    return new Promise((resolve, reject) => {
        console.log(`📡 Conectando ao servidor: ${SERVER_URL}`);

        socket = io(SERVER_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor!');

            // Solicita lista de agentes
            fetch(`${SERVER_URL}/api/agents`)
                .then(res => res.json())
                .then(agents => {
                    availableAgents = agents;
                    console.log(`   ${agents.length} agente(s) disponível(is)`);
                    resolve(socket);
                })
                .catch(err => {
                    console.log('   ⚠️ Erro ao listar agentes:', err.message);
                    resolve(socket);
                });
        });

        // Escuta atualizações de agentes
        socket.on('dashboard:agent-connected', (data) => {
            const existing = availableAgents.findIndex(a => a.id === data.agentId);
            if (existing >= 0) {
                availableAgents[existing] = { id: data.agentId, ...data };
            } else {
                availableAgents.push({ id: data.agentId, ...data });
            }
            console.log(`\n🟢 Agente conectado: ${data.name}`);
        });

        socket.on('dashboard:agent-disconnected', (data) => {
            availableAgents = availableAgents.filter(a => a.id !== data.agentId);
            console.log(`\n🔴 Agente desconectado: ${data.agentId}`);

            if (data.agentId === config.targetAgentId) {
                console.log('   ⚠️ O agente destino desconectou! Jobs pendentes não serão impressos.');
            }
        });

        // Escuta status dos jobs
        socket.on('dashboard:job-status', (data) => {
            const { jobId, status, message } = data;

            // Atualiza histórico
            updateJobStatus(jobId, status, message);

            // Log de status
            const statusIcons = {
                'downloading': '⬇️',
                'printing': '🖨️',
                'completed': '✅',
                'error': '❌'
            };

            const icon = statusIcons[status] || '📊';
            console.log(`   ${icon} Job ${jobId}: ${status}`);

            if (status === 'completed') {
                console.log('   ✅ Impressão concluída com sucesso!\n');
            } else if (status === 'error') {
                console.log(`   ❌ Erro na impressão: ${message}\n`);
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`\n❌ Desconectado: ${reason}`);
            console.log('   Tentando reconectar...');
        });

        socket.on('connect_error', (error) => {
            console.log(`⚠️ Erro de conexão: ${error.message}`);
        });

        // Escuta erros de impressão (agente não encontrado, etc)
        socket.on('print:error', (data) => {
            console.log(`\n❌ Erro do servidor: ${data.message}`);
            console.log('   Verifique se o agente de impressão está conectado.');
        });

        // Timeout para conexão inicial
        setTimeout(() => {
            if (!socket.connected) {
                reject(new Error('Timeout na conexão'));
            }
        }, 10000);
    });
}

/**
 * Função principal
 */
async function main() {
    showBanner();

    // Carrega configuração
    config = loadConfig();

    // Gera ID se não existir
    if (!config.agentId) {
        config.agentId = uuidv4();
        config.createdAt = new Date().toISOString();
        saveConfig(config);
        console.log(`🆕 Agente criado: ${config.agentId.slice(0, 8)}...`);
    } else {
        console.log(`📋 ID do agente: ${config.agentId.slice(0, 8)}...`);
    }

    // Limpa histórico antigo
    cleanOldHistory();

    try {
        // Conecta ao servidor
        await connectToServer();

        // Seleciona pasta, agente e impressora
        const watchFolder = await selectFolder();
        const targetAgent = await selectAgent();
        const targetPrinter = await selectPrinter(targetAgent);

        if (!targetPrinter) {
            console.log('❌ Nenhuma impressora selecionada. Encerrando...');
            process.exit(1);
        }

        console.log('\n══════════════════════════════════════════════════');
        console.log('   📁 Pasta: ' + watchFolder);
        console.log('   🖥️ Agente: ' + targetAgent.name);
        console.log('   🖨️ Impressora: ' + targetPrinter.name);
        console.log('══════════════════════════════════════════════════');

        // Inicia monitoramento
        startWatching(watchFolder);

        // Mantém processo rodando
        process.on('SIGINT', () => {
            console.log('\n\n👋 Encerrando agente...');
            if (watcher) watcher.close();
            if (socket) socket.disconnect();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Erro fatal:', error.message);
        process.exit(1);
    }
}

// Inicia o agente
main().catch(console.error);
