/**
 * Módulo de conexão WebSocket
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'https://echolink-backend-production.up.railway.app';

let socket = null;
let eventCallback = null;

/**
 * Conecta ao servidor WebSocket
 */
function connectSocket(onEvent) {
    return new Promise((resolve, reject) => {
        eventCallback = onEvent;

        socket = io(SERVER_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });

        socket.on('connect', () => {
            console.log('✅ Conectado ao servidor');
            eventCallback?.('connected', { socketId: socket.id });
            resolve(socket);
        });

        socket.on('disconnect', (reason) => {
            console.log('❌ Desconectado:', reason);
            eventCallback?.('disconnected', { reason });
        });

        socket.on('connect_error', (error) => {
            console.log('⚠️ Erro de conexão:', error.message);
            eventCallback?.('error', { message: error.message });
        });

        // Escuta eventos do dashboard
        socket.on('dashboard:agent-connected', (data) => {
            eventCallback?.('agent-connected', data);
        });

        socket.on('dashboard:agent-disconnected', (data) => {
            eventCallback?.('agent-disconnected', data);
        });

        socket.on('dashboard:job-status', (data) => {
            eventCallback?.('job-status', data);
        });

        socket.on('print:error', (data) => {
            eventCallback?.('print-error', data);
        });

        // Timeout
        setTimeout(() => {
            if (!socket.connected) {
                reject(new Error('Timeout na conexão'));
            }
        }, 10000);
    });
}

/**
 * Desconecta do servidor
 */
function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

/**
 * Retorna o socket atual
 */
function getSocket() {
    return socket;
}

/**
 * Envia job de impressão
 */
function sendPrintJob(jobData) {
    console.log('🔌 Estado do socket:', socket ? (socket.connected ? 'conectado' : 'desconectado') : 'null');

    if (!socket) {
        throw new Error('Socket não inicializado. Conecte ao servidor primeiro.');
    }

    if (!socket.connected) {
        throw new Error('Socket não conectado. Aguarde a reconexão.');
    }

    console.log('📡 Emitindo print:send-job...');
    socket.emit('print:send-job', jobData);
    console.log('✅ Evento emitido com sucesso');
}

module.exports = {
    connectSocket,
    disconnectSocket,
    getSocket,
    sendPrintJob
};
