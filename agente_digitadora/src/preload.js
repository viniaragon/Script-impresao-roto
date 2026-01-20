/**
 * Preload Script - Bridge seguro entre main e renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Controles da janela
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    closeWindow: () => ipcRenderer.send('window:close'),

    // Diálogos
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

    // Configuração
    loadConfig: () => ipcRenderer.invoke('config:load'),
    saveConfig: (config) => ipcRenderer.invoke('config:save', config),

    // Servidor
    connectServer: () => ipcRenderer.invoke('server:connect'),
    getAgents: () => ipcRenderer.invoke('server:getAgents'),

    // Watcher
    startWatcher: (options) => ipcRenderer.invoke('watcher:start', options),
    stopWatcher: () => ipcRenderer.invoke('watcher:stop'),

    // Eventos
    onSocketEvent: (callback) => {
        ipcRenderer.on('socket:event', (event, data) => callback(data));
    },
    onWatcherStatus: (callback) => {
        ipcRenderer.on('watcher:status', (event, data) => callback(data));
    }
});
