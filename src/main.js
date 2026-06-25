const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');

let mainWindow;
let settingsWindow;
let hasMigratedLegacyStorage = false;

const APP_DATA_FOLDER = 'PrintaView';
const SETTINGS_FILE_NAME = 'printaview-settings.json';
const HIDDEN_FILE_NAME = 'hidden-items.json';
const FAVORITES_FILE_NAME = 'favorite-items.json';

function getStableDataDirectory() {
  const overrideDataDir = process.env.PRINTAVIEW_DATA_DIR;
  if (overrideDataDir && typeof overrideDataDir === 'string') {
    return path.resolve(overrideDataDir);
  }

  return path.join(app.getPath('appData'), APP_DATA_FOLDER);
}

function migrateLegacyStorageIfNeeded() {
  if (hasMigratedLegacyStorage) {
    return;
  }

  hasMigratedLegacyStorage = true;

  const stableDataDir = getStableDataDirectory();
  const legacyUserDataDir = app.getPath('userData');

  if (path.resolve(stableDataDir) === path.resolve(legacyUserDataDir)) {
    return;
  }

  const fileNames = [SETTINGS_FILE_NAME, HIDDEN_FILE_NAME, FAVORITES_FILE_NAME];
  for (const fileName of fileNames) {
    const legacyPath = path.join(legacyUserDataDir, fileName);
    const stablePath = path.join(stableDataDir, fileName);

    if (!fs.existsSync(legacyPath) || fs.existsSync(stablePath)) {
      continue;
    }

    try {
      fs.copyFileSync(legacyPath, stablePath);
    } catch (error) {
      // Ignore migration failure and continue with default behavior.
    }
  }
}

function ensureDataDirectory() {
  const stableDataDir = getStableDataDirectory();
  fs.mkdirSync(stableDataDir, { recursive: true });
  migrateLegacyStorageIfNeeded();
  return stableDataDir;
}

function getSettingsPath() {
  return path.join(ensureDataDirectory(), SETTINGS_FILE_NAME);
}

function getHiddenStorePath() {
  return path.join(ensureDataDirectory(), HIDDEN_FILE_NAME);
}

function getFavoritesStorePath() {
  return path.join(ensureDataDirectory(), FAVORITES_FILE_NAME);
}

function loadCustomRootFolder() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.customRootFolder || null;
  } catch (error) {
    return null;
  }
}

function saveCustomRootFolder(folderPath) {
  const settingsPath = getSettingsPath();
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      settings = {};
    }
  }
  settings.customRootFolder = folderPath;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return {
      showDetailsPane: true,
      showHidden: false,
      panePosition: 'right',
      sortBy: 'recent',
      favoritesFilter: 'all'
    };
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const allowedSort = new Set(['recent', 'name', 'type']);
    const allowedFavoritesFilter = new Set(['all', 'favorites']);
    return {
      showDetailsPane: parsed.showDetailsPane !== false,
      showHidden: parsed.showHidden === true,
      panePosition: parsed.panePosition || 'right',
      sortBy: allowedSort.has(parsed.sortBy) ? parsed.sortBy : 'recent',
      favoritesFilter: allowedFavoritesFilter.has(parsed.favoritesFilter) ? parsed.favoritesFilter : 'all'
    };
  } catch (error) {
    return {
      showDetailsPane: true,
      showHidden: false,
      panePosition: 'right',
      sortBy: 'recent',
      favoritesFilter: 'all'
    };
  }
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  let existing = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      existing = {};
    }
  }
  const updated = { ...existing, ...settings };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
}

function getRootFolder() {
  const custom = loadCustomRootFolder();
  if (custom && fs.existsSync(custom)) {
    return custom;
  }
  return path.join(os.homedir(), 'Downloads');
}

function normalizePathForKey(inputPath) {
  return path.resolve(inputPath).toLowerCase();
}

function loadHiddenPaths() {
  const storePath = getHiddenStorePath();
  if (!fs.existsSync(storePath)) {
    return new Set();
  }

  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const normalized = parsed
      .filter((item) => typeof item === 'string')
      .map((item) => normalizePathForKey(item));

    return new Set(normalized);
  } catch (error) {
    return new Set();
  }
}

function saveHiddenPaths(hiddenSet) {
  const storePath = getHiddenStorePath();
  const entries = [...hiddenSet];
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(entries, null, 2), 'utf8');
}

function loadFavoritePaths() {
  const storePath = getFavoritesStorePath();
  if (!fs.existsSync(storePath)) {
    return new Set();
  }

  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    const normalized = parsed
      .filter((item) => typeof item === 'string')
      .map((item) => normalizePathForKey(item));

    return new Set(normalized);
  } catch (error) {
    return new Set();
  }
}

function saveFavoritePaths(favoriteSet) {
  const storePath = getFavoritesStorePath();
  const entries = [...favoriteSet];
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(entries, null, 2), 'utf8');
}

function isPathFavorited(targetPath, favoriteSet) {
  return favoriteSet.has(normalizePathForKey(targetPath));
}

function isPathHidden(targetPath, hiddenSet) {
  const normalized = normalizePathForKey(targetPath);
  const segments = normalized.split(path.sep);

  for (let i = segments.length; i > 0; i -= 1) {
    const candidate = segments.slice(0, i).join(path.sep);
    if (hiddenSet.has(candidate)) {
      return true;
    }
  }

  return false;
}

function categorizeFile(filePath, isDirectory) {
  if (isDirectory) {
    return { itemType: 'folder', previewType: 'folder' };
  }

  const ext = path.extname(filePath).toLowerCase();
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tif', '.tiff', '.ico']);

  if (imageExts.has(ext)) {
    return { itemType: 'file', previewType: 'image' };
  }

  if (ext === '.pdf') {
    return { itemType: 'file', previewType: 'pdf' };
  }

  return { itemType: 'file', previewType: 'generic' };
}

async function walkDirectoryRecursive(rootDir, hiddenSet, favoriteSet, includeHidden) {
  const allItems = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];

    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const shouldHide = isPathHidden(absolutePath, hiddenSet);

      let stats;
      try {
        stats = await fs.promises.stat(absolutePath);
      } catch (error) {
        continue;
      }

      const { itemType, previewType } = categorizeFile(absolutePath, stats.isDirectory());
      const item = {
        id: normalizePathForKey(absolutePath),
        name: entry.name,
        path: absolutePath,
        parentPath: currentDir,
        extension: stats.isDirectory() ? '' : path.extname(entry.name).toLowerCase(),
        itemType,
        previewType,
        modifiedTimeMs: stats.mtimeMs,
        createdTimeMs: stats.birthtimeMs,
        size: stats.size,
        hiddenByApp: shouldHide,
        favoritedByApp: isPathFavorited(absolutePath, favoriteSet)
      };

      if (includeHidden || !shouldHide) {
        allItems.push(item);
      }

      if (stats.isDirectory()) {
        stack.push(absolutePath);
      }
    }
  }

  return allItems;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'PrintaView',
    backgroundColor: '#f5f2ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 400,
    title: 'Settings - PrintaView',
    backgroundColor: '#f5f2ea',
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

ipcMain.handle('downloads:getPath', () => {
  return getRootFolder();
});

ipcMain.handle('folder:browse', async () => {
  if (!mainWindow) {
    return { ok: false, error: 'No window available' };
  }
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Root Folder',
      buttonLabel: 'Select'
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, error: 'No folder selected' };
    }
    const selectedPath = result.filePaths[0];
    saveCustomRootFolder(selectedPath);
    return { ok: true, path: selectedPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('items:scan', async (_event, payload = {}) => {
  const downloadsPath = payload.downloadsPath || path.join(os.homedir(), 'Downloads');
  const includeHidden = Boolean(payload.includeHidden);
  const hiddenSet = loadHiddenPaths();
  const favoriteSet = loadFavoritePaths();
  return walkDirectoryRecursive(downloadsPath, hiddenSet, favoriteSet, includeHidden);
});

ipcMain.handle('items:setHidden', (_event, payload = {}) => {
  const inputPath = payload.path;
  const hidden = Boolean(payload.hidden);

  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  const hiddenSet = loadHiddenPaths();
  const normalized = normalizePathForKey(inputPath);

  if (hidden) {
    hiddenSet.add(normalized);
  } else {
    hiddenSet.delete(normalized);
  }

  saveHiddenPaths(hiddenSet);
  return { ok: true };
});

ipcMain.handle('items:open', async (_event, payload = {}) => {
  const inputPath = payload.path;
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  const result = await shell.openPath(inputPath);
  if (result) {
    return { ok: false, message: result };
  }

  return { ok: true };
});

ipcMain.handle('items:reveal', (_event, payload = {}) => {
  const inputPath = payload.path;
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  try {
    shell.showItemInFolder(inputPath);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
});

ipcMain.handle('items:setFavorite', (_event, payload = {}) => {
  const inputPath = payload.path;
  const favorite = Boolean(payload.favorite);

  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  const favoriteSet = loadFavoritePaths();
  const normalized = normalizePathForKey(inputPath);

  if (favorite) {
    favoriteSet.add(normalized);
  } else {
    favoriteSet.delete(normalized);
  }

  saveFavoritePaths(favoriteSet);
  return { ok: true };
});

ipcMain.handle('settings:get', () => {
  return loadSettings();
});

ipcMain.handle('settings:save', (_event, payload = {}) => {
  saveSettings(payload);
  return { ok: true };
});

ipcMain.handle('hidden:getItems', async (_event, payload = {}) => {
  const downloadsPath = payload.downloadsPath || getRootFolder();
  const hiddenSet = loadHiddenPaths();
  const favoriteSet = loadFavoritePaths();
  const items = await walkDirectoryRecursive(downloadsPath, hiddenSet, favoriteSet, true);
  return items.filter((item) => item.hiddenByApp);
});

ipcMain.handle('hidden:clearAll', () => {
  saveHiddenPaths(new Set());
  return { ok: true };
});

ipcMain.on('settings:open', () => {
  createSettingsWindow();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
