// main.js — Noceur Sorter Electron Main Process
const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path         = require('path');
const fs           = require('fs-extra');
const fileOps      = require('./fileOps');
const rawConverter = require('./rawConverter');

const isDev = process.argv.includes('--dev');
let mainWindow;

// ── Background RAW preload queue ─────────────────────────────────────────────
let preloadQueue = [];
let preloadRunning = false;

async function runPreload() {
  if (preloadRunning || !preloadQueue.length) return;
  preloadRunning = true;
  while (preloadQueue.length > 0) {
    const fp = preloadQueue.shift();
    if (!rawConverter.needsConversion(fp) || rawConverter.isCached(fp)) continue;
    try {
      await rawConverter.getBase64Preview(fp);
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('raw-preview-ready', fp);
    } catch {}
    await new Promise(r => setTimeout(r, 80)); // yield to UI
  }
  preloadRunning = false;
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1600, width), height: Math.min(1000, height),
    minWidth: 960, minHeight: 640,
    backgroundColor: '#0f1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webSecurity: false },
  });
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties:['openDirectory'], title:'Pilih Folder' });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('list-images',      async (_,f)       => fileOps.listImages(f));
ipcMain.handle('ensure-folders',   async (_,r,m)     => fileOps.ensureFolders(r,m));
ipcMain.handle('move-and-rename',  async (_,s,d,p)   => fileOps.moveAndRename(s,d,p));
ipcMain.handle('undo-move',        async ()          => fileOps.undoLast());
ipcMain.handle('undo-many',        async (_,c)       => fileOps.undoMany(c));
ipcMain.handle('find-duplicates',  async (_,f)       => fileOps.findDuplicates(f));
ipcMain.handle('load-presets',     async ()          => fileOps.loadPresets());
ipcMain.handle('save-presets',     async (_,p)       => fileOps.savePresets(p));
ipcMain.handle('load-ratings',     async (_,f)       => fileOps.loadRatings(f));
ipcMain.handle('save-ratings',     async (_,f,d)     => fileOps.saveRatings(f,d));
ipcMain.handle('get-exif',         async (_,p)       => fileOps.getExif(p));
ipcMain.handle('check-file-exists',async (_,p)       => fs.pathExists(p));
ipcMain.handle('set-fullscreen',   async (_,flag)    => { mainWindow.setFullScreen(flag); return mainWindow.isFullScreen(); });
ipcMain.handle('get-file-stats',   async (_,p)       => { try { const s=await fs.stat(p); return {size:s.size,mtime:s.mtime}; } catch { return null; } });
ipcMain.handle('export-log', async (_,log,fmt) => {
  const r = await dialog.showSaveDialog(mainWindow, { title:'Export Log', defaultPath:`noceur-log-${new Date().toISOString().slice(0,10)}.${fmt}`, filters: fmt==='csv'?[{name:'CSV',extensions:['csv']}]:[{name:'JSON',extensions:['json']}] });
  return r.canceled ? false : fileOps.exportLog(log, r.filePath, fmt);
});
ipcMain.handle('get-raw-preview',  async (_,p)       => rawConverter.getBase64Preview(p));
ipcMain.handle('is-raw-cached',    async (_,p)       => rawConverter.isCached(p));
ipcMain.handle('start-preload',    async (_,files)   => {
  preloadQueue = files.filter(p => rawConverter.needsConversion(p) && !rawConverter.isCached(p));
  setTimeout(runPreload, 1500);
  return preloadQueue.length;
});
ipcMain.handle('cancel-preload',   async ()          => { preloadQueue = []; return true; });
