'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (name, value) => ipcRenderer.invoke(`dog:${name}`, value);
contextBridge.exposeInMainWorld('dogDesktop', Object.freeze({
  getState: () => call('state'),
  markUpdateHealthy: () => call('update-health'),
  exportSave: json => call('export-save', json),
  getPacks: () => call('packs'),
  reloadContent: () => call('reload'),
  checkUpdates: () => call('check'),
  importPack: () => call('import'),
  openUpdateInbox: () => call('open-update-inbox'),
  saveProgress: json => call('save-progress', json),
  loadProgress: () => call('load-progress'),
  rollbackPack: id => call('rollback', id),
  installAppUpdate: () => call('install'),
  setPreferences: value => call('preferences', value),
  setBattleActive: value => call('battle', value),
  onState: callback => {
    if (typeof callback !== 'function') throw new TypeError('callback must be a function');
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('dog:state', handler);
    return () => ipcRenderer.removeListener('dog:state', handler);
  }
}));
