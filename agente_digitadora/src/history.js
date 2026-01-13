/**
 * Gerenciamento de Histórico - EchoLink Digitadora
 * 
 * Responsável por:
 * - Controlar arquivos já enviados (evitar duplicatas)
 * - Rastrear status de impressão
 * - Permitir reenvio de arquivos com erro
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BASE_DIR } = require('./config');

const HISTORY_PATH = path.join(BASE_DIR, 'digitadora-history.json');

/**
 * Carrega histórico do arquivo
 */
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            const data = fs.readFileSync(HISTORY_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('⚠️ Erro ao ler histórico, criando novo...');
    }
    return { files: {} };
}

/**
 * Salva histórico no arquivo
 */
function saveHistory(history) {
    try {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar histórico:', error.message);
        return false;
    }
}

/**
 * Gera hash único do arquivo baseado em nome + tamanho + data de modificação
 * (Mais rápido que MD5 completo para arquivos grandes)
 */
function getFileIdentifier(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const name = path.basename(filePath);
        const identifier = `${name}_${stats.size}_${stats.mtimeMs}`;
        return crypto.createHash('md5').update(identifier).digest('hex');
    } catch (error) {
        return null;
    }
}

/**
 * Verifica se arquivo já foi enviado com sucesso
 */
function hasBeenSent(filePath) {
    const history = loadHistory();
    const fileId = getFileIdentifier(filePath);

    if (!fileId) return false;

    const entry = history.files[fileId];
    if (!entry) return false;

    // Considera enviado se status é completed ou printing
    return ['completed', 'printing', 'downloading'].includes(entry.status);
}

/**
 * Marca arquivo como enviado
 */
function markAsSent(filePath, jobId) {
    const history = loadHistory();
    const fileId = getFileIdentifier(filePath);

    if (!fileId) return false;

    history.files[fileId] = {
        fileName: path.basename(filePath),
        filePath: filePath,
        hash: fileId,
        jobId: jobId,
        sentAt: new Date().toISOString(),
        status: 'pending'
    };

    return saveHistory(history);
}

/**
 * Atualiza status de um job
 */
function updateJobStatus(jobId, status, message = '') {
    const history = loadHistory();

    // Encontra o arquivo pelo jobId
    for (const fileId in history.files) {
        if (history.files[fileId].jobId === jobId) {
            history.files[fileId].status = status;
            history.files[fileId].lastUpdate = new Date().toISOString();
            if (message) {
                history.files[fileId].message = message;
            }
            return saveHistory(history);
        }
    }

    return false;
}

/**
 * Lista arquivos com erro para possível reenvio
 */
function getFailedFiles() {
    const history = loadHistory();
    const failed = [];

    for (const fileId in history.files) {
        const entry = history.files[fileId];
        if (entry.status === 'error') {
            failed.push(entry);
        }
    }

    return failed;
}

/**
 * Remove entrada do histórico (para permitir reenvio)
 */
function removeFromHistory(filePath) {
    const history = loadHistory();
    const fileId = getFileIdentifier(filePath);

    if (fileId && history.files[fileId]) {
        delete history.files[fileId];
        return saveHistory(history);
    }

    return false;
}

/**
 * Limpa histórico antigo (mais de 7 dias)
 */
function cleanOldHistory() {
    const history = loadHistory();
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const fileId in history.files) {
        const entry = history.files[fileId];
        const sentAt = new Date(entry.sentAt).getTime();

        if (sentAt < sevenDaysAgo && entry.status === 'completed') {
            delete history.files[fileId];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveHistory(history);
        console.log(`🧹 Limpeza: ${cleaned} entradas antigas removidas do histórico`);
    }

    return cleaned;
}

module.exports = {
    loadHistory,
    hasBeenSent,
    markAsSent,
    updateJobStatus,
    getFailedFiles,
    removeFromHistory,
    cleanOldHistory,
    getFileIdentifier
};
