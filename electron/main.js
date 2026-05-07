const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = 3099;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function log(msg) {
  try { console.log(`[Electron] ${msg}`); } catch (_) {}
}

function getAppRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..');
}

function getUserDataPath() {
  return app.getPath('userData');
}

function prepararBancoDados() {
  const userDataDir = getUserDataPath();
  const dbDestino = path.join(userDataDir, 'chaveiro.db');

  if (!fs.existsSync(dbDestino)) {
    const dbOrigem = path.join(getAppRoot(), 'database', 'chaveiro.db');
    if (fs.existsSync(dbOrigem)) {
      fs.copyFileSync(dbOrigem, dbDestino);
      log('Banco de dados copiado para pasta do usuário.');
    }
  }

  return dbDestino;
}

function startServer() {
  return new Promise((resolve) => {
    const appRoot = getAppRoot();
    const serverPath = path.join(appRoot, 'server.js');
    const dbPath = prepararBancoDados();

    log(`App root: ${appRoot}`);
    log(`Server: ${serverPath}`);
    log(`Database: ${dbPath}`);

    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: appRoot,
      env: {
        ...process.env,
        PORT: SERVER_PORT,
        DATABASE_PATH: dbPath,
        ELECTRON_APP: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      try {
        const msg = data.toString().trim();
        log(`Server: ${msg}`);
        if (msg.includes('rodando') || msg.includes('listening') || msg.includes(String(SERVER_PORT))) {
          resolve();
        }
      } catch (_) {}
    });

    serverProcess.stdout.on('error', () => {});
    serverProcess.stderr.on('error', () => {});

    serverProcess.stderr.on('data', (data) => {
      try { log(`Server ERRO: ${data.toString().trim()}`); } catch (_) {}
    });

    serverProcess.on('exit', (code) => {
      log(`Servidor encerrado com código ${code}`);
    });

    serverProcess.on('error', (err) => {
      log(`Erro ao iniciar servidor: ${err.message}`);
      resolve();
    });

    setTimeout(resolve, 12000);
  });
}

function waitForServer(retries = 25) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      if (remaining <= 0) return reject(new Error('Servidor não respondeu a tempo'));
      http.get(SERVER_URL, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(() => check(remaining - 1), 500);
      }).on('error', () => setTimeout(() => check(remaining - 1), 500));
    };
    check(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Sistema Chaveiro',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => { if (mainWindow) mainWindow.reload(); }, 2000);
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Sistema', click: () => mainWindow ? mainWindow.show() : createWindow() },
    { label: 'Verificar Atualizações', click: () => autoUpdater.checkForUpdates() },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);

  tray.setToolTip('Sistema Chaveiro');
  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow ? mainWindow.show() : createWindow());
}

autoUpdater.on('update-available', (info) => {
  log(`Atualização disponível: v${info.version}`);
  if (mainWindow) mainWindow.webContents.send('update-status', `Baixando v${info.version}...`);
});

autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Pronta',
    message: `Versão ${info.version} pronta.\nO sistema será reiniciado para instalar.`,
    buttons: ['Reiniciar Agora', 'Depois'],
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => log(`Auto-updater erro: ${err.message}`));

ipcMain.on('check-update', () => autoUpdater.checkForUpdates());

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer();
  } catch (err) {
    log(`Aviso: ${err.message}`);
  }

  createWindow();
  createTray();

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});
