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
  mainWindow.webContents.on('console-message', (_event, levelOrDetails, message, lineNumber, sourceId) => {
    const details = typeof levelOrDetails === 'object'
      ? levelOrDetails
      : { level: levelOrDetails, message, lineNumber, sourceId };
    writeDiagnostic(`renderer-console level=${details.level} ${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  if (process.env.SPECTRON_DESKTOP_LOG) {
    const requestFilter = { urls: ['file://*/*'] };
    mainWindow.webContents.session.webRequest.onBeforeRequest(requestFilter, (details, callback) => {
      writeDiagnostic(`request-start ${details.url}`);
      callback({});
    });
    mainWindow.webContents.session.webRequest.onCompleted(requestFilter, (details) => {
      writeDiagnostic(`request-complete status=${details.statusCode} ${details.url}`);
    });
    mainWindow.webContents.session.webRequest.onErrorOccurred(requestFilter, (details) => {
      writeDiagnostic(`request-error ${details.error} ${details.url}`);
    });
    try {
      mainWindow.webContents.debugger.attach('1.3');
      mainWindow.webContents.debugger.sendCommand('Runtime.enable');
      mainWindow.webContents.debugger.sendCommand('Log.enable');
      mainWindow.webContents.debugger.sendCommand('Network.enable');
      mainWindow.webContents.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.exceptionThrown' || method === 'Log.entryAdded' || method === 'Network.loadingFailed') {
          writeDiagnostic(`devtools ${method} ${JSON.stringify(params)}`);
        }
      });
    } catch (error) {
      writeDiagnostic(`devtools-attach-failed ${error.message}`);
    }
  }
  mainWindow.webContents.on('did-finish-load', async () => {
    const inspectRenderer = async (label) => {
      try {
        const state = await mainWindow.webContents.executeJavaScript(`({
          href: location.href,
          rootChildren: document.getElementById('root')?.childElementCount ?? -1,
          bodyText: document.body?.innerText?.slice(0, 160) ?? '',
          scripts: Array.from(document.scripts).map(script => script.src),
          resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, duration: entry.duration }))
        })`);
        writeDiagnostic(`${label} ${JSON.stringify(state)}`);
      } catch (error) {
        writeDiagnostic(`diagnostic-script-failed ${error.message}`);
      }
    };
    await inspectRenderer('did-finish-load');
    setTimeout(() => inspectRenderer('two-seconds-later'), 2000);
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
