const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const isDev = !app.isPackaged;
const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:3001';
const appIcon = path.join(__dirname, 'assets', 'spectron.ico');

function redactSensitive(value) {
  return String(value)
    .replace(/([?&](?:token|access_token|api_key|key)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(authorization["']?\s*[:=]\s*["']?bearer\s+)[^"'\s]+/gi, '$1[REDACTED]');
}

function writeDiagnostic(message) {
  if (!process.env.SPECTRON_DESKTOP_LOG) return;
  try {
    fs.appendFileSync(process.env.SPECTRON_DESKTOP_LOG, `${new Date().toISOString()} ${redactSensitive(message)}\n`);
  } catch (_) {
    // Diagnostics must never prevent the application from opening.
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'Spectron',
    icon: appIcon,
    backgroundColor: '#faf0ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    writeDiagnostic(`did-fail-load code=${code} description=${description} url=${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeDiagnostic(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  mainWindow.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error') {
      writeDiagnostic(`renderer-error ${details.message} (${details.sourceId}:${details.lineNumber})`);
    }
  });
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const state = await mainWindow.webContents.executeJavaScript(`({
        href: location.href,
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
        bodyText: document.body?.innerText?.slice(0, 160) ?? ''
      })`);
      writeDiagnostic(`did-finish-load ${JSON.stringify(state)}`);
    } catch (error) {
      writeDiagnostic(`diagnostic-script-failed ${error.message}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '..', 'build', 'index.html');
    writeDiagnostic(`loading ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
