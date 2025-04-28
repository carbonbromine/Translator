// main.js
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const robot = require('robotjs');
const clipboardy = require('clipboardy');
const dayjs = require('dayjs');
const { translateText, queryUsage } = require('./deepl');

let mainWindow;
let tray;
let config;
let isHotkeyActive = true;

// Paths for user data storage
const dataDir      = app.getPath('userData');
const userConfig   = path.join(dataDir, 'config.json');
const historyPath  = path.join(dataDir, 'history.txt');
const defaultConfig = path.join(__dirname, 'config.json');

// Path to icon, depending on packaged or dev
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, 'icon.png');

// Ensure user data directory and default config copy
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(userConfig)) {
  try {
    fs.copyFileSync(defaultConfig, userConfig);
  } catch (e) {
    console.error('Failed to copy default config:', e);
  }
}

// Load configuration from user data
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(userConfig, 'utf-8'));
  } catch {
    return {
      hotkey: 'Control+Alt+T',
      targetLang: 'EN',
      deeplApiKey: '',
      autoLaunch: false,
      startupMode: 'silent',
      historyLimit: 100
    };
  }
}

// Save configuration back to user data
function saveConfig() {
  try {
    fs.writeFileSync(userConfig, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Append a translation record to history
function appendHistory(original, translated) {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  fs.appendFileSync(historyPath, `[${timestamp}] ${original} => ${translated}\n`, 'utf-8');
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Show desktop notification
function showNotification(title, body) {
  new Notification({ title, body }).show();
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 700,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  mainWindow.on('close', e => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// Create the system tray icon and menu
function createTray() {
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => mainWindow.show() },
    { label: '退出',       click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setToolTip('DeepL Translator');
  tray.setContextMenu(contextMenu);
}

// Apply auto-launch setting
function applyAutoLaunch() {
  app.setLoginItemSettings({ openAtLogin: config.autoLaunch });
}

// Register the global hotkey for translation
function registerHotkey() {
  globalShortcut.unregisterAll();
  if (!config.hotkey) return;

  globalShortcut.register(config.hotkey, async () => {
    if (!isHotkeyActive) return;

    try {
      // Backup clipboard
      const before = clipboardy.readSync();

      // Copy selection
      robot.keyTap('c', 'control');
      await sleep(50);
      let text = clipboardy.readSync();

      // If unchanged, select all and copy
      if (text.trim() === before.trim()) {
        robot.keyTap('a', 'control');
        await sleep(50);
        robot.keyTap('c', 'control');
        await sleep(50);
        text = clipboardy.readSync();
      }
      if (!text.trim()) return;

      // Translate
      const translated = await translateText(text, config.targetLang, config.deeplApiKey);

      // Save history & notify renderer
      appendHistory(text, translated);
      mainWindow.webContents.send('history-updated');

      // Update usage & notify renderer
      const usage = await queryUsage(config.deeplApiKey);
      mainWindow.webContents.send('usage-updated', usage);

      // Paste translated and restore clipboard
      clipboardy.writeSync(translated);
      await sleep(30);
      robot.keyTap('v', 'control');
      clipboardy.writeSync(before);

      showNotification('翻译成功', '已覆盖所选或全文');
    } catch (err) {
      console.error('Translation error:', err);
    }
  });
}

// Application ready
app.whenReady().then(() => {
  config = loadConfig();
  createWindow();
  createTray();
  registerHotkey();
  applyAutoLaunch();

  if (config.startupMode === 'silent') {
    mainWindow.once('ready-to-show', () => mainWindow.hide());
  } else {
    mainWindow.once('ready-to-show', () => mainWindow.show());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Clean up on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// IPC handlers
ipcMain.handle('get-config',    () => config);
ipcMain.handle('update-config', (_, data) => {
  Object.assign(config, data);
  saveConfig();
  registerHotkey();
  applyAutoLaunch();
  mainWindow.webContents.send('hotkey-updated', config.hotkey);
});
ipcMain.handle('pause-hotkey',  () => { isHotkeyActive = false; });
ipcMain.handle('resume-hotkey', () => { isHotkeyActive = true; });
ipcMain.handle('get-history',   () => {
  return fs.existsSync(historyPath)
    ? fs.readFileSync(historyPath, 'utf-8')
    : '';
});
ipcMain.handle('delete-history-item', (_, line) => {
  let lines = fs.existsSync(historyPath)
    ? fs.readFileSync(historyPath, 'utf-8').trim().split('\n')
    : [];
  lines = lines.filter(l => l !== line);
  fs.writeFileSync(historyPath, lines.length ? lines.join('\n') + '\n' : '', 'utf-8');
  return true;
});
ipcMain.handle('clear-history', () => {
  fs.writeFileSync(historyPath, '', 'utf-8');
  return true;
});
ipcMain.handle('copy-to-clipboard', (_, text) => {
  clipboardy.writeSync(text);
  return true;
});
ipcMain.handle('get-usage', async (_, apiKey) => {
  try {
    return await queryUsage(apiKey);
  } catch (err) {
    console.error('Usage query error:', err);
    return null;
  }
});
