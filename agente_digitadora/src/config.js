/**
 * Gerenciamento de Configuração - EchoLink Digitadora
 * 
 * Responsável por:
 * - Persistir configurações do agente
 * - Gerenciar pasta monitorada, agente destino e impressora
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Detecta se está rodando como executável PKG
const isPkg = typeof process.pkg !== 'undefined';

// Diretório base: se for PKG usa a pasta do executável, senão usa __dirname
const BASE_DIR = isPkg
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..');

const CONFIG_PATH = path.join(BASE_DIR, 'digitadora-config.json');

const DEFAULT_CONFIG = {
    agentId: null,
    name: `Digitadora-${os.hostname()}`,
    watchFolder: null,
    targetAgentId: null,
    targetPrinterId: null,
    createdAt: null
};

/**
 * Carrega configuração do arquivo ou retorna padrão
 */
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
        }
    } catch (error) {
        console.log('⚠️ Erro ao ler configuração, usando padrão...');
    }
    return { ...DEFAULT_CONFIG };
}

/**
 * Salva configuração no arquivo
 */
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar configuração:', error.message);
        return false;
    }
}

/**
 * Atualiza configuração parcialmente
 */
function updateConfig(updates) {
    const current = loadConfig();
    const updated = { ...current, ...updates };
    return saveConfig(updated) ? updated : current;
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfig,
    CONFIG_PATH,
    BASE_DIR
};
