const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getAppVersion: () => ipcRenderer.invoke('get-version'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  checkNodejs: () => ipcRenderer.invoke('check-nodejs'),
  getNpmRegistry: () => ipcRenderer.invoke('get-npm-registry'),
  checkOpenCode: () => ipcRenderer.invoke('check-opencode'),
  extractNodejs: () => ipcRenderer.invoke('extract-nodejs'),
  configureNpm: (registry) => ipcRenderer.invoke('configure-npm', registry),
  installOpenCode: () => ipcRenderer.invoke('install-opencode'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  launchTUI: (workDir) => ipcRenderer.invoke('launch-tui', workDir),
  launchWeb: (data) => ipcRenderer.invoke('launch-web', data),
  onInstallProgress: (callback) => ipcRenderer.on('install-progress', (event, data) => callback(data)),
  resetEnvironment: () => ipcRenderer.invoke('reset-environment')
});
