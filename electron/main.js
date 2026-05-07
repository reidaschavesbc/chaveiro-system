const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

// Evita crash por EPIPE no processo principal
try { process.stdout.on('error', () => {}); } catch (_) {}
try { process.stderr.on('error', () => {}); } catch (_) {}

// Garante apenas uma instância do app
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = 3099;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Log em arquivo na Área de Trabalho para diagnóstico
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
    const dbOrigem = path.join(getAppRoot(), 'database', 'chaveiro.db');
    if (fs.existsSync(dbOrigem)) {
      fs.copyFileSync(dbOrigem, dbDestino);
      log('Banco de dados copiado para pasta do usuário.');
    } else {
      log('AVISO: banco de dados de origem não encontrado: ' + dbOrigem);
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

    let resolved = false;
    function resolveOnce() {
      if (!resolved) { resolved = true; resolve(); }
    }

    serverProcess.stdout.on('data', (data) => {
      try {
        const msg = data.toString().trim();
        log('Server: ' + msg);
        if (msg.includes('rodando') || msg.includes('listening') || msg.includes(String(SERVER_PORT))) {
          resolveOnce();
        }
      } catch (_) {}
    });

    serverProcess.stdout.on('error', () => {});
    serverProcess.stderr.on('error', () => {});

    serverProcess.stderr.on('data', (data) => {
      try { log('Server ERRO: ' + data.toString().trim()); } catch (_) {}
    });

    serverProcess.on('exit', (code) => {
      log('Servidor encerrado com código ' + code);
    });

    serverProcess.on('error', (err) => {
      log('Erro spawn servidor: ' + err.message);
      reject(err);
    });

    // Resolve após 15s mesmo sem confirmação do stdout
    setTimeout(resolveOnce, 15000);
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

  // Bloqueia qualquer tentativa de abrir nova janela pelo conteúdo web
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Se segunda instância tentar abrir, foca a janela existente
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
    log('Iniciando servidor...');
    await startServer();
    log('Aguardando servidor responder na porta ' + SERVER_PORT + '...');
    await waitForServer();
  } catch (err) {
    log('ERRO FATAL ao iniciar servidor: ' + err.message);
    dialog.showErrorBox(
      'Erro ao iniciar Sistema Chaveiro',
      'Não foi possível iniciar o servidor interno.\n\n' +
      'Erro: ' + err.message + '\n\n' +
      'Um arquivo chaveiro-log.txt foi criado na sua Área de Trabalho com detalhes.'
    );
    app.quit();
    return;
  }

  log('Servidor pronto. Abrindo janela...');
  createWindow();
  createTray();

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
