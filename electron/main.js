const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Configuração do auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function log(msg) {
  console.log(`[Electron] ${msg}`);
}

function startServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(__dirname, '..', 'server.js');
    log('Iniciando servidor...');

    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: SERVER_PORT },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      log(`Server: ${msg}`);
      if (msg.includes('rodando') || msg.includes('listening') || msg.includes(SERVER_PORT)) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      log(`Server ERRO: ${data.toString().trim()}`);
    });

    serverProcess.on('exit', (code) => {
      log(`Servidor encerrado com código ${code}`);
    });

    // Aguarda no máximo 10s antes de tentar conectar de qualquer forma
    setTimeout(resolve, 10000);
  });
}

function waitForServer(retries = 20) {
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Recarrega se perder conexão com o servidor
  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow) mainWindow.reload();
    }, 2000);
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

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

// === Auto-updater events ===

autoUpdater.on('checking-for-update', () => {
  log('Verificando atualizações...');
});

autoUpdater.on('update-available', (info) => {
  log(`Atualização disponível: v${info.version}`);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', `Baixando atualização v${info.version}...`);
  }
});

autoUpdater.on('update-not-available', () => {
  log('Sistema atualizado.');
});

autoUpdater.on('download-progress', (progress) => {
  const pct = Math.round(progress.percent);
  log(`Download: ${pct}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', pct);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log(`Atualização v${info.version} baixada.`);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Pronta',
    message: `Versão ${info.version} baixada.\nO sistema será reiniciado para instalar.`,
    buttons: ['Reiniciar Agora', 'Depois'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  log(`Erro no auto-updater: ${err.message}`);
});

// === IPC ===

ipcMain.on('check-update', () => autoUpdater.checkForUpdates());

// === App lifecycle ===

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer();
  } catch (err) {
    log(`Aviso: ${err.message}`);
  }

  createWindow();
  createTray();

  // Verifica atualizações 5s após iniciar
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);

  // Verifica a cada 1 hora
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  // No macOS mantém o app rodando; no Windows/Linux encerra
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
