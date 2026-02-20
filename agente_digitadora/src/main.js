/**
 * EchoLink Digitadora - Processo Principal Electron
 */

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const dns = require('dns');

// Força IPv4 para evitar problemas de conexão
dns.setDefaultResultOrder('ipv4first');

// Importa módulos do core
const { createWatcher, stopWatcher } = require('./core/watcher');
const { connectSocket, disconnectSocket, getSocket } = require('./core/socket');
const { loadConfig, saveConfig } = require('./config');

let mainWindow = null;
let tray = null;
let config = null;
let isWatching = false;

/**
 * Cria a janela principal
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 700,
        minWidth: 500,
        minHeight: 600,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

    // Dev tools em modo desenvolvimento
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('close', (event) => {
        if (isWatching) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Cria ícone na bandeja do sistema
 */
function createTray() {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Abrir', click: () => mainWindow?.show() },
        { type: 'separator' },
        {
            label: 'Sair', click: () => {
                isWatching = false;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('EchoLink Digitadora');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow?.show());
}

// === IPC Handlers ===

// Controles da janela
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:close', () => mainWindow?.close());

// Seletor de pasta
ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta para monitorar'
    });
    return result.canceled ? null : result.filePaths[0];
});

// Carregar configuração
ipcMain.handle('config:load', () => {
    config = loadConfig();
    return config;
});

// Salvar configuração
ipcMain.handle('config:save', (event, newConfig) => {
    config = { ...config, ...newConfig };
    saveConfig(config);
    return config;
});

// Conectar ao servidor
ipcMain.handle('server:connect', async () => {
    try {
        await connectSocket((event, data) => {
            mainWindow?.webContents.send('socket:event', { event, data });
        });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Buscar agentes
ipcMain.handle('server:getAgents', async () => {
    const fetch = require('node-fetch');
    const SERVER_URL = process.env.SERVER_URL || 'https://script-impresao-roto.zeabur.app';
    try {
        const response = await fetch(`${SERVER_URL}/api/agents`);
        return await response.json();
    } catch (error) {
        return [];
    }
});

// Iniciar monitoramento
ipcMain.handle('watcher:start', async (event, options) => {
    try {
        await createWatcher(options.folder, options.agentId, options.printerId, (status) => {
            mainWindow?.webContents.send('watcher:status', status);
        });
        isWatching = true;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Parar monitoramento
ipcMain.handle('watcher:stop', () => {
    stopWatcher();
    isWatching = false;
    return { success: true };
});

// === App Lifecycle ===

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !isWatching) {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    stopWatcher();
    disconnectSocket();
});
