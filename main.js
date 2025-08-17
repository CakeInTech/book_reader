// Guard: prevent running this file with plain Node. It must be launched by Electron.
if (!process.versions || !process.versions.electron) {
  console.error('\nThis app must be started with Electron.\nUse: npm start\n');
  process.exit(1);
}

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Keep a global reference to avoid GC closing the window
let mainWindow = null;

// List available Apple voices
ipcMain.handle('get-voices', async () => {
  try {
    const output = execSync('/usr/bin/say -v "?"', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString();
    const lines = output.split('\n').map(l => l.trim()).filter(l => l);
    const parsed = lines.map(line => {
      const m = line.match(/^(.+?)\s+(\S+)\s+#/);
      if (!m) return null;
      return { name: m[1].trim(), lang: m[2].trim() };
    }).filter(Boolean);
    if (parsed.length === 0) {
      return [
        { name: 'Alex', lang: 'en_US' },
        { name: 'Samantha', lang: 'en_US' }
      ];
    }
    return parsed;
  } catch (e) {
    return [
      { name: 'Alex', lang: 'en_US' },
      { name: 'Samantha', lang: 'en_US' }
    ];
  }
});

// Raw output of say -v "?" for debugging
ipcMain.handle('get-voices-raw', async () => {
  try {
    return execSync('/usr/bin/say -v "?"', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).toString();
  } catch (e) {
    return String(e?.message || e || '');
  }
});

function createWindow() {
  console.log('[main] createWindow called');
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    backgroundColor: '#f8fafc',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    }
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    console.log('[main] ready-to-show');
    win.show();
    win.focus();
  });

  win.webContents.on('did-finish-load', () => console.log('[main] did-finish-load'));
  win.webContents.on('did-fail-load', (e, ec, desc) => console.error('[main] did-fail-load', ec, desc));
  win.webContents.on('render-process-gone', (e, details) => console.error('[main] render-process-gone', details));
  win.on('unresponsive', () => console.warn('[main] window unresponsive'));
  win.on('closed', () => {
    console.log('[main] window closed');
    mainWindow = null;
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const indexPath = path.join(__dirname, 'index.html');
  console.log('[main] loading', indexPath);

  win.loadFile(indexPath).catch(e => {
    console.error('[main] loadFile failed', e);
  });

  win.center();
}

app.whenReady().then(() => {
  console.log('[main] app ready');

  // macOS specific setup
  if (process.platform === 'darwin') {
    try {
      app.setActivationPolicy('regular');
      if (app.dock) app.dock.show();
    } catch (e) {
      console.warn('[main] macOS setup failed', e);
    }
  }

  createWindow();

  app.on('activate', function () {
    console.log('[main] activate');
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// TTS with macOS say
let sayProcess = null;

ipcMain.handle('speak-text', async (event, { text, voice, rate }) => {
  if (sayProcess) {
    try { sayProcess.kill('SIGKILL'); } catch {}
    sayProcess = null;
  }
  if (!text || !voice) return;

  return new Promise((resolve, reject) => {
    try {
      const args = ['-v', voice, '-r', String(rate || 200)];
      sayProcess = spawn('/usr/bin/say', args, { stdio: ['pipe', 'ignore', 'ignore'] });

      sayProcess.on('error', (err) => {
        sayProcess = null;
        reject(err);
      });

      sayProcess.on('close', (code) => {
        sayProcess = null;
        code === 0 ? resolve() : reject(new Error('say exited ' + code));
      });

      sayProcess.stdin.write(text);
      sayProcess.stdin.end();
    } catch (e) {
      sayProcess = null;
      reject(e);
    }
  });
});

ipcMain.handle('stop-speech', () => {
  if (sayProcess) {
    try { sayProcess.kill('SIGKILL'); } catch {}
    sayProcess = null;
  }
});

ipcMain.handle('pause-speech', () => {
  if (sayProcess) {
    try { process.kill(sayProcess.pid, 'SIGSTOP'); } catch {}
  }
});

ipcMain.handle('resume-speech', () => {
  if (sayProcess) {
    try { process.kill(sayProcess.pid, 'SIGCONT'); } catch {}
  }
});
