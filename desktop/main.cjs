'use strict';
const { app, BrowserWindow, Menu, ipcMain, protocol, session, dialog, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('./release-config.json');
const { ContentStore, atomicWrite } = require('./content-store.cjs');
const { ApplicationUpdater } = require('./updater.cjs');
const { markUpdateHealthy } = require('./app-update.cjs');
const { MAX_ENVELOPE_BYTES, exactKeys } = require('./security.cjs');
const { readBoundedFile } = require('./bounded-file.cjs');
const { LocalContentInbox } = require('./local-content-inbox.cjs');
const { SaveBackupStore } = require('./save-backup.cjs');
const { validatePack, CONTENT_API_VERSION } = require('../src/content.js');
const APP_URL = 'app://dog-squad/desktop/app.html';
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; worker-src 'none'";
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true } }]);
app.enableSandbox();
app.setName('狗狗突击队');
if (!config.production && process.env.DOG_SQUAD_USER_DATA) app.setPath('userData', path.resolve(process.env.DOG_SQUAD_USER_DATA));
if (!app.requestSingleInstanceLock()) app.quit();
let win, store, updater, inbox, saveBackup, battleActive = false, allowQuit = false, checkBusy = false;
let preferences = { automaticUpdates: true };
let contentState = { enabled: false, phase: 'idle', reason: '', packs: [], lastCheck: null };
function state() { return { app: { ...(updater?.state || { version: app.getVersion(), enabled: false, phase: 'loading', reason: '正在启动…' }) }, content: { ...contentState, packs: store?.summaries() || [], localInbox: inbox?.snapshot() || null }, preferences: { ...preferences }, battleActive }; }
function notify() { if (win && !win.isDestroyed()) win.webContents.send('dog:state', state()); }
function assertSender(event) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== APP_URL) throw new Error('请求来源无效');
}
function noBattle() { if (battleActive) throw new Error('请先结束当前战斗，再管理关卡或重启应用。'); }
async function checkUpdates(manual = false) {
  if (checkBusy || (!manual && !preferences.automaticUpdates)) return state();
  checkBusy = true;
  try {
    await updater.check({ manual });
    if (config.contentFeedURL && Object.keys(config.contentPublicKeys).length && !battleActive) {
      contentState = { ...contentState, phase: 'checking', reason: '正在检查新章节…' }; notify();
      const result = await store.checkUpdates(() => !battleActive && (manual || preferences.automaticUpdates));
      contentState = { ...contentState, phase: result.installed ? 'updated' : 'current', reason: result.message, lastCheck: new Date().toISOString() };
    }
    if (inbox) await inbox.scan({ manual });
  } catch { contentState = { ...contentState, phase: 'error', reason: '关卡更新检查未完成，当前战役不受影响。请稍后重试或导入官方离线包。' }; }
  finally { checkBusy = false; notify(); }
  return state();
}
function registerIPC() {
  const handle = (name, fn) => ipcMain.handle(`dog:${name}`, async (event, value) => { assertSender(event); return fn(value); });
  handle('state', () => state()); handle('packs', () => store.getPacks());
  handle('update-health', () => markUpdateHealthy(process.argv, app.getPath('userData')));
  handle('check', () => checkUpdates(true));
  handle('reload', () => { noBattle(); inbox?.markReloaded(); setImmediate(()=>{if(win&&!win.isDestroyed())win.webContents.reload();});return true; });
  handle('battle', value => { if (typeof value !== 'boolean') throw new Error('战斗状态无效'); if(value && (updater.state.phase==='installing'||store?.isMutating()||inbox?.isInstalling()))throw new Error('正在安全安装更新，请稍候。');battleActive = value; if (!value) inbox?.requestScan(0); notify(); return state(); });
  handle('preferences', async value => {
    exactKeys(value, ['automaticUpdates']); if (typeof value.automaticUpdates !== 'boolean') throw new Error('更新偏好无效');
    preferences = { automaticUpdates: value.automaticUpdates }; updater.setPreferences(preferences);
    await atomicWrite(path.join(app.getPath('userData'), 'update-preferences.json'), JSON.stringify(preferences)); if (preferences.automaticUpdates) inbox?.requestScan(0); notify(); return state();
  });
  handle('import', async () => {
    noBattle(); if (!Object.keys(config.contentPublicKeys).length) throw new Error('本安装包尚未配置关卡发行公钥。');
    const choice = await dialog.showOpenDialog(win, { title: '导入官方关卡包', buttonLabel: '验证并安装', filters: [{ name: '狗狗突击队签名关卡包', extensions: ['dogpack'] }], properties: ['openFile'] });
    if (choice.canceled || !choice.filePaths[0]) return state();
    noBattle();
    const bytes = await readBoundedFile(choice.filePaths[0], MAX_ENVELOPE_BYTES); noBattle(); await store.install(bytes);
    contentState = { ...contentState, phase: 'updated', reason: '签名已验证，关卡包已安装。返回行动地图即可加载。' }; notify(); return state();
  });
  handle('rollback', async id => { noBattle(); if (typeof id !== 'string') throw new Error('关卡包标识无效'); await store.rollback(id); contentState = { ...contentState, phase: 'updated', reason: '已恢复上一版关卡内容；关卡成绩与存档保留。' }; notify(); return state(); });
  handle('install', () => { noBattle(); return updater.install(); });
  handle('open-update-inbox', async () => {
    await inbox.prepare(); const error = await shell.openPath(inbox.directory); if (error) throw new Error('无法打开本机章节更新目录'); return state();
  });
  handle('save-progress', json => saveBackup.save(json));
  handle('load-progress', () => saveBackup.load());
  handle('export-save', async json => {
    if(typeof json!=='string'||Buffer.byteLength(json)>1024*1024)throw new Error('存档超过大小限制');
    const data=JSON.parse(json);if(data?.format!=='dog-squad-save'||data.schema!==1||data.data?.version!==4)throw new Error('存档格式无效');
    const save=require('../src/progress.js').normalize(data.data,[]);
    const choice=await dialog.showSaveDialog(win,{title:'导出行动记录',defaultPath:'Dog-Squad-save-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'狗狗突击队存档',extensions:['json']}]});
    if(choice.canceled||!choice.filePath)return {saved:false};
    await atomicWrite(choice.filePath,JSON.stringify({format:'dog-squad-save',schema:1,exportedAt:new Date().toISOString(),data:require('../src/progress.js').capture(save,[])},null,2));return {saved:true};
  });
}
function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '狗狗突击队', submenu: [{ role: 'about', label: '关于狗狗突击队' }, { type: 'separator' }, { label: '检查更新…', click: () => checkUpdates(true) }, { type: 'separator' }, { role: 'hide', label: '隐藏狗狗突击队' }, { role: 'hideOthers', label: '隐藏其他应用' }, { role: 'unhide', label: '显示全部' }, { type: 'separator' }, { role: 'quit', label: '退出狗狗突击队' }] },
    { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '窗口', submenu: [{ role: 'minimize', label: '最小化' }, { role: 'togglefullscreen', label: '切换全屏' }, { role: 'front', label: '全部置于顶层' }] }
  ]));
}
function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 980, minWidth: 980, minHeight: 760, title: '狗狗突击队', backgroundColor: '#10283c', show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, devTools: !app.isPackaged } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('will-frame-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => { battleActive = false; });
  win.on('close', event => {
    if (battleActive && !allowQuit) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(win, { type: 'question', title: '离开当前战斗？', message: '当前战斗尚未完成', detail: '已完成关卡和设置会保留。本场进度不会保存。', buttons: ['继续战斗', '退出游戏'], defaultId: 0, cancelId: 0 });
      if (choice === 1) { allowQuit = true; app.quit(); }
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; battleActive = false; });
  win.loadURL(APP_URL);
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: '狗狗突击队', applicationVersion: app.getVersion(), copyright: 'Dog Squad · 星海远征', version: config.production ? '正式发行' : '本机安装版' });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', event => event.preventDefault());
  protocol.handle('app', async request => {
    const url = new URL(request.url), file = decodeURIComponent(url.pathname);
    if (url.hostname !== 'dog-squad' || request.method !== 'GET' || !/^\/(?:desktop\/(?:app\.html|assets\.js)|src\/[a-z][a-z0-9-]*\.(?:js|css)|content\/builtin\.js|assets\/[a-z][a-z0-9-]*\.(?:png|jpg|webp|svg))$/.test(file)) return new Response('Not found', { status: 404 });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    try { const bytes = await fs.readFile(path.join(app.getAppPath(), file)); return new Response(bytes, { headers: { 'Content-Type': types[path.extname(file)], 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } }); } catch { return new Response('Not found', { status: 404 }); }
  });
  try { const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'update-preferences.json'), 'utf8')); if (typeof saved.automaticUpdates === 'boolean') preferences.automaticUpdates = saved.automaticUpdates; } catch {}
  store = new ContentStore({ directory: path.join(app.getPath('userData'), 'content-packs'), keys: config.contentPublicKeys || {}, appVersion: CONTENT_API_VERSION, validatePack, feedURL: config.contentFeedURL || '' });
  await store.load();
  saveBackup = new SaveBackupStore({ directory: path.join(app.getPath('userData'), 'save-backups') });
  inbox = new LocalContentInbox({ directory: path.join(app.getPath('userData'), 'update-inbox'), store,
    isEnabled: () => preferences.automaticUpdates, isBattleActive: () => battleActive, onState: notify });
  contentState = { enabled: Object.keys(config.contentPublicKeys || {}).length > 0, phase: store.warning ? 'recovered' : 'idle', reason: store.warning || (config.contentFeedURL ? '官方关卡更新服务已连接。' : '可离线游玩内置战役；支持导入经签名的官方关卡包。'), lastCheck: null };
  updater = new ApplicationUpdater({ version: app.getVersion(), config, isPackaged: app.isPackaged, notify, isBattleActive: () => battleActive,
    userData: app.getPath('userData'), executable: app.getPath('exe'), quit: () => { allowQuit = true; app.quit(); } });
  updater.setPreferences(preferences); registerIPC(); menu(); createWindow(); await inbox.start();
  setTimeout(() => checkUpdates(false), 5000).unref();
  setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000).unref();
  app.on('activate', () => { if (!win) createWindow(); });
}).catch(error => { dialog.showErrorBox('启动未完成', `狗狗突击队无法启动：${error.message}`); app.quit(); });
app.on('before-quit', () => inbox?.stop());
app.on('window-all-closed', () => app.quit());
