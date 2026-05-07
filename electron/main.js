const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const fs = require('fs');

try { process.stdout.on('error', () => {}); } catch (_) {}
try { process.stderr.on('error', () => {}); } catch (_) {}

// Garante apenas uma instância
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
const SERVER_PORT = 3099;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let logPath = null;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { process.stdout.write(line + '\n'); } catch (_) {}
  try {
    if (!logPath) logPath = path.join(app.getPath('desktop'), 'chaveiro-log.txt');
    fs.appendFileSync(logPath, line + '\n');
  } catch (_) {}
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');
}

function prepararBancoDados() {
  const userDataDir = app.getPath('userData');
  const dbDestino = path.join(userDataDir, 'chaveiro.db');

  if (!fs.existsSync(dbDestino)) {
    // extraResources copia para process.resourcesPath (não dentro de /app)
    const dbOrigem = app.isPackaged
      ? path.join(process.resourcesPath, 'database', 'chaveiro.db')
      : path.join(getAppRoot(), 'database', 'chaveiro.db');

    if (fs.existsSync(dbOrigem)) {
      fs.mkdirSync(path.dirname(dbDestino), { recursive: true });
      fs.copyFileSync(dbOrigem, dbDestino);
      log('Banco de dados copiado: ' + dbOrigem + ' -> ' + dbDestino);
    } else {
      log('Banco não encontrado em origem, iniciando vazio: ' + dbDestino);
    }
  }

  return dbDestino;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const appRoot = getAppRoot();
    const serverPath = path.join(appRoot, 'server.js');
    const dbPath = prepararBancoDados();

    log('App root: ' + appRoot);
    log('Server path: ' + serverPath);
    log('Database: ' + dbPath);

    if (!fs.existsSync(serverPath)) {
      return reject(new Error('server.js não encontrado em: ' + serverPath));
    }

    // Define variáveis de ambiente antes de carregar o servidor
    process.env.PORT = SERVER_PORT;
    process.env.DATABASE_PATH = dbPath;
    process.env.ELECTRON_APP = '1';

    try {
      // Roda o servidor no mesmo processo do Electron (sem spawn)
      require(serverPath);
      log('Servidor carregado no processo principal');
      resolve();
    } catch (err) {
      log('ERRO ao carregar servidor: ' + err.message);
      log(err.stack || '');
      reject(err);
    }
  });
}

function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      if (remaining <= 0) return reject(new Error('Servidor não respondeu após 20 segundos'));
      const req = http.get(SERVER_URL, (res) => {
        res.resume();
        if (res.statusCode < 500) {
          log('Servidor pronto, status: ' + res.statusCode);
          resolve();
        } else {
          setTimeout(() => check(remaining - 1), 500);
        }
      });
      req.on('error', () => setTimeout(() => check(remaining - 1), 500));
      req.setTimeout(1000, () => { req.destroy(); setTimeout(() => check(remaining - 1), 500); });
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

  // Bloqueia qualquer abertura de nova janela pelo conteúdo web
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Sistema', click: () => { if (mainWindow) mainWindow.show(); } },
    { label: 'Verificar Atualizações', click: () => autoUpdater.checkForUpdates() },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);

  tray.setToolTip('Sistema Chaveiro');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

autoUpdater.on('update-available', (info) => {
  log('Atualização disponível: v' + info.version);
  if (mainWindow) mainWindow.webContents.send('update-status', 'Baixando v' + info.version + '...');
});

autoUpdater.on('update-downloaded', (info) => {
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Pronta',
    message: `Versão ${info.version} pronta.\nO sistema será reiniciado para instalar.`,
    buttons: ['Reiniciar Agora', 'Depois'],
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => log('Auto-updater erro: ' + err.message));

ipcMain.on('check-update', () => autoUpdater.checkForUpdates());

app.whenReady().then(async () => {
  log('=== Sistema Chaveiro iniciando ===');

  try {
    log('Carregando servidor...');
    await startServer();
    log('Aguardando servidor na porta ' + SERVER_PORT + '...');
    await waitForServer();
  } catch (err) {
    log('ERRO FATAL: ' + err.message);
    dialog.showErrorBox(
      'Erro ao iniciar Sistema Chaveiro',
      'Não foi possível iniciar o servidor.\n\nErro: ' + err.message +
      '\n\nVerifique o arquivo chaveiro-log.txt na sua Área de Trabalho.'
    );
    app.quit();
    return;
  }

  log('Abrindo janela...');
  createWindow();
  createTray();

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
