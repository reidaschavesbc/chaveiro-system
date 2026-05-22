const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

try { process.stdout.on('error', () => {}); } catch (_) {}
try { process.stderr.on('error', () => {}); } catch (_) {}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let mainWindow = null;
let tray = null;
const SERVER_URL = 'http://104.251.216.253:3002';

let failRetryCount = 0;
let showingOffline = false;

let logPath = null;
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { process.stdout.write(line + '\n'); } catch (_) {}
  try {
    if (!logPath) logPath = path.join(app.getPath('desktop'), 'chaveiro-log.txt');
    fs.appendFileSync(logPath, line + '\n');
  } catch (_) {}
}

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({ provider: 'generic', url: SERVER_URL + '/downloads' });

const offlinePage = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Sem conexão</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: linear-gradient(135deg, #0f1b47 0%, #1a56db 50%, #0f1b47 100%);
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: white;
    }
    .card {
      background: rgba(255,255,255,0.1); backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.2); border-radius: 20px;
      padding: 48px 44px; text-align: center; max-width: 420px; width: 90%;
    }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    p { color: rgba(255,255,255,0.7); font-size: 14px; line-height: 1.6; margin-bottom: 28px; }
    .hint { color: rgba(255,255,255,0.45); font-size: 12px; margin-bottom: 28px; }
    button {
      background: white; color: #1a56db; border: none; border-radius: 10px;
      padding: 13px 32px; font-size: 15px; font-weight: 700; cursor: pointer;
      font-family: inherit; transition: opacity 0.2s;
    }
    button:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Sem conexão com o servidor</h1>
    <p>Verifique sua conexão com a internet e tente novamente.</p>
    <p class="hint" id="countdown">Tentando reconectar automaticamente em 30s...</p>
    <button onclick="manualRetry()">Tentar novamente</button>
  </div>
  <script>
    var secs = 30;
    var el = document.getElementById('countdown');
    var timer = setInterval(function() {
      secs--;
      if (secs <= 0) {
        clearInterval(timer);
        el.textContent = 'Reconectando...';
        window.electron.retry();
      } else {
        el.textContent = 'Tentando reconectar automaticamente em ' + secs + 's...';
      }
    }, 1000);
    function manualRetry() {
      clearInterval(timer);
      el.textContent = 'Reconectando...';
      window.electron.retry();
    }
  </script>
</body>
</html>`;

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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  failRetryCount = 0;
  showingOffline = false;

  function showOfflinePage() {
    showingOffline = true;
    failRetryCount = 0;
    mainWindow.webContents.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(offlinePage)
    );
  }

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, _desc, validatedURL) => {
    if (errorCode === -3) return; // ERR_ABORTED — ignorar redirecionamentos
    if (validatedURL && validatedURL.startsWith('data:')) return; // ignorar erros na própria página offline
    if (showingOffline) return; // já exibindo página offline, não sobrescrever

    failRetryCount++;
    if (failRetryCount <= 3) {
      log(`Falha ao carregar (tentativa ${failRetryCount}/3): errorCode=${errorCode} — aguardando para retry`);
      setTimeout(() => {
        if (mainWindow && !showingOffline) mainWindow.loadURL(SERVER_URL);
      }, 3000 * failRetryCount);
    } else {
      log(`Falha ao carregar após 3 tentativas: errorCode=${errorCode} — exibindo tela offline`);
      showOfflinePage();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    showingOffline = false;
    failRetryCount = 0;
  });

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
    { label: 'Verificar Atualizações', click: () => { checkUpdateManual = true; autoUpdater.checkForUpdates(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);

  tray.setToolTip('Sistema Chaveiro');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

let checkUpdateManual = false;

autoUpdater.on('update-not-available', () => {
  log('Nenhuma atualização disponível');
  if (checkUpdateManual && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Sistema atualizado',
      message: 'Você já está na versão mais recente.',
      buttons: ['OK'],
    });
  }
  checkUpdateManual = false;
});

autoUpdater.on('update-available', (info) => {
  log('Atualização disponível: v' + info.version);
  checkUpdateManual = false;
  if (!mainWindow) return;
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Atualização Disponível',
    message: `Nova versão v${info.version} disponível!\nDeseja baixar e instalar agora?`,
    buttons: ['Baixar Agora', 'Depois'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-downloaded', (info) => {
  if (!mainWindow) return;
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
  log('Auto-updater erro: ' + err.message);
  if (checkUpdateManual && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Erro na Atualização',
      message: 'Não foi possível verificar atualizações.\n' + err.message,
      buttons: ['OK'],
    });
  }
  checkUpdateManual = false;
});

ipcMain.on('check-update', () => { checkUpdateManual = true; autoUpdater.checkForUpdates(); });
ipcMain.on('retry-load', () => {
  if (mainWindow) {
    showingOffline = false;
    failRetryCount = 0;
    mainWindow.loadURL(SERVER_URL);
  }
});

function abrirPainelAdmin() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Painel Administrativo',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'adm-' + Date.now(), // sessão isolada e única = nunca salva login
    },
    backgroundColor: '#0f172a',
  });
  win.loadURL(SERVER_URL + '/admin');
  win.maximize();
}

function criarMenuBar() {
  const template = [
    {
      label: 'Sistema',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        { role: 'forceReload', label: 'Forçar Recarregar' },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [
        { role: 'resetZoom', label: 'Zoom Padrão' },
        { role: 'zoomIn', label: 'Aumentar Zoom' },
        { role: 'zoomOut', label: 'Diminuir Zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela Cheia' },
      ],
    },
    {
      label: '👑 ADM',
      click: () => abrirPainelAdmin(),
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  log('=== Sistema Chaveiro iniciando (servidor: ' + SERVER_URL + ') ===');
  createWindow();
  createTray();
  criarMenuBar();
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
