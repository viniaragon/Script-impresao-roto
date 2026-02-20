/**
 * Módulo de monitoramento de pasta
 */

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { sendPrintJob } = require('./socket');

const SERVER_URL = process.env.SERVER_URL || 'https://script-impresao-roto.zeabur.app';
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.txt', '.doc', '.docx', '.xls', '.xlsx'];

let watcher = null;
let statusCallback = null;
let currentConfig = null;
const sentFiles = new Set();

/**
 * Verifica se arquivo é suportado
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
                    resolve(true);
                    return;
                }
                lastSize = stats.size;
                if (Date.now() - startTime > timeout) {
                    resolve(true);
                    return;
                }
                setTimeout(check, 500);
            } catch (error) {
                reject(new Error('Arquivo não encontrado'));
            }
        };
        setTimeout(check, 500);
    });
}

/**
 * Faz upload do arquivo
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
 * Processa um novo arquivo
 */
async function processNewFile(filePath) {
    const fileName = path.basename(filePath);

    // Usa apenas o nome do arquivo como ID para evitar duplicatas
    // (o awaitWriteFinish já garante que o arquivo está completo)
    if (sentFiles.has(fileName)) {
        console.log('⏭️ Arquivo já processado, ignorando:', fileName);
        return;
    }

    // Marca imediatamente para evitar processamento duplo
    sentFiles.add(fileName);

    if (!isSupportedFile(filePath)) {
        sentFiles.delete(fileName);
        statusCallback?.({
            type: 'ignored',
            fileName,
            message: 'Tipo não suportado'
        });
        return;
    }

    console.log('📄 Processando arquivo:', fileName);
    console.log('📋 Config atual:', currentConfig);

    statusCallback?.({
        type: 'processing',
        fileName,
        message: 'Processando...'
    });

    try {
        await waitForFile(filePath);

        // Upload
        statusCallback?.({
            type: 'uploading',
            fileName,
            message: 'Enviando...'
        });

        const uploadResult = await uploadFile(filePath);
        console.log('✅ Upload concluído:', uploadResult.url?.substring(0, 50) + '...');

        // Envia para impressão
        const jobId = `job-${Date.now()}-${uuidv4().slice(0, 8)}`;

        console.log('📤 Enviando job de impressão:', {
            jobId,
            agentId: currentConfig.agentId,
            printerId: currentConfig.printerId,
            fileName
        });

        try {
            sendPrintJob({
                jobId,
                agentId: currentConfig.agentId,
                printerId: currentConfig.printerId,
                fileUrl: uploadResult.url,
                fileName
            });
            console.log('✅ Job enviado com sucesso');
        } catch (sendError) {
            console.error('❌ Erro ao enviar job:', sendError.message);
            throw sendError;
        }

        statusCallback?.({
            type: 'sent',
            fileName,
            jobId,
            message: 'Enviado para impressão'
        });

    } catch (error) {
        console.error('❌ Erro no processamento:', error.message);
        sentFiles.delete(fileName);
        statusCallback?.({
            type: 'error',
            fileName,
            message: error.message
        });
    }
}

/**
 * Cria watcher para monitorar pasta
 */
function createWatcher(folderPath, agentId, printerId, onStatus) {
    return new Promise((resolve, reject) => {
        if (watcher) {
            watcher.close();
        }

        currentConfig = { agentId, printerId };
        statusCallback = onStatus;

        if (!fs.existsSync(folderPath)) {
            reject(new Error('Pasta não encontrada'));
            return;
        }

        watcher = chokidar.watch(folderPath, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        watcher.on('add', (filePath) => {
            processNewFile(filePath);
        });

        watcher.on('error', (error) => {
            statusCallback?.({
                type: 'error',
                message: `Erro no watcher: ${error.message}`
            });
        });

        watcher.on('ready', () => {
            statusCallback?.({
                type: 'ready',
                message: 'Monitoramento ativo'
            });
            resolve();
        });
    });
}

/**
 * Para o watcher
 */
function stopWatcher() {
    if (watcher) {
        watcher.close();
        watcher = null;
        statusCallback?.({
            type: 'stopped',
            message: 'Monitoramento parado'
        });
    }
}

module.exports = {
    createWatcher,
    stopWatcher
};
