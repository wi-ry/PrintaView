const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const sharp = require('sharp');
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');

let mainWindow;
let settingsWindow;
let hasMigratedLegacyStorage = false;

const APP_DATA_FOLDER = 'PrintaView';
const SETTINGS_FILE_NAME = 'printaview-settings.json';
const HIDDEN_FILE_NAME = 'hidden-items.json';
const FAVORITES_FILE_NAME = 'favorite-items.json';
const PDF_CACHE_DIR_NAME = 'pdf-cache';
const PDF_CACHE_CLEANUP_COOLDOWN_MS = 10 * 60 * 1000;

let pdfCacheCleanupInProgress = false;
let lastPdfCacheCleanupAtMs = 0;

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

function getPdfCacheDirectory() {
  const cacheDir = path.join(ensureDataDirectory(), PDF_CACHE_DIR_NAME);
  fs.mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

function getPdfCacheKey(payload = {}) {
  const inputPath = typeof payload.path === 'string' ? payload.path : '';
  const modifiedTimeMs = Number(payload.modifiedTimeMs) || 0;
  const size = Number(payload.size) || 0;
  const hashInput = `${normalizePathForKey(inputPath)}|${modifiedTimeMs}|${size}`;
  return crypto.createHash('sha1').update(hashInput).digest('hex');
}

function getPdfCachePaths(cacheKey) {
  const base = path.join(getPdfCacheDirectory(), cacheKey);
  return {
    imagePath: `${base}.jpg`,
    metadataPath: `${base}.json`
  };
}

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return null;
  }

  const match = /^data:image\/jpeg;base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    return null;
  }

  try {
    return Buffer.from(match[1], 'base64');
  } catch (error) {
    return null;
  }
}

function isPdfCacheEntryStale(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return true;
  }

  const sourcePath = metadata.sourcePath;
  if (!sourcePath || typeof sourcePath !== 'string') {
    return true;
  }

  if (!fs.existsSync(sourcePath)) {
    return true;
  }

  try {
    const stats = fs.statSync(sourcePath);
    const expectedSize = Number(metadata.sourceSize) || 0;
    const expectedModified = Number(metadata.sourceModifiedTimeMs) || 0;
    const changedSize = Number(stats.size) !== expectedSize;
    const changedModified = Math.floor(Number(stats.mtimeMs) || 0) !== Math.floor(expectedModified);
    return changedSize || changedModified;
  } catch (error) {
    return true;
  }
}

async function cleanupPdfCacheIfDue() {
  const now = Date.now();
  if (pdfCacheCleanupInProgress) {
    return;
  }

  if (now - lastPdfCacheCleanupAtMs < PDF_CACHE_CLEANUP_COOLDOWN_MS) {
    return;
  }

  pdfCacheCleanupInProgress = true;

  try {
    const cacheDir = getPdfCacheDirectory();
    const entries = await fs.promises.readdir(cacheDir);
    const metadataFiles = entries.filter((file) => file.endsWith('.json'));

    for (const metadataFile of metadataFiles) {
      const metadataPath = path.join(cacheDir, metadataFile);
      const imagePath = metadataPath.replace(/\.json$/i, '.jpg');

      let stale = true;
      try {
        const raw = await fs.promises.readFile(metadataPath, 'utf8');
        const metadata = JSON.parse(raw);
        stale = isPdfCacheEntryStale(metadata);
      } catch (error) {
        stale = true;
      }

      if (!stale) {
        continue;
      }

      await Promise.all([
        fs.promises.rm(metadataPath, { force: true }),
        fs.promises.rm(imagePath, { force: true })
      ]);
    }

    lastPdfCacheCleanupAtMs = now;
  } catch (error) {
    // Ignore cleanup errors. Cache cleanup should never block app behavior.
  } finally {
    pdfCacheCleanupInProgress = false;
  }
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
      favoritesFilter: 'all',
      theme: 'default'
    };
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const allowedSort = new Set(['recent', 'name', 'type']);
    const allowedFavoritesFilter = new Set(['all', 'favorites']);
    const allowedThemes = new Set(['default', 'pastel-pink', 'baby-blue']);
    return {
      showDetailsPane: parsed.showDetailsPane !== false,
      showHidden: parsed.showHidden === true,
      panePosition: parsed.panePosition || 'right',
      sortBy: allowedSort.has(parsed.sortBy) ? parsed.sortBy : 'recent',
      favoritesFilter: allowedFavoritesFilter.has(parsed.favoritesFilter) ? parsed.favoritesFilter : 'all',
      theme: allowedThemes.has(parsed.theme) ? parsed.theme : 'default'
    };
  } catch (error) {
    return {
      showDetailsPane: true,
      showHidden: false,
      panePosition: 'right',
      sortBy: 'recent',
      favoritesFilter: 'all',
      theme: 'default'
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
  const imageExts = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.ico']);

  if (imageExts.has(ext)) {
    return { itemType: 'file', previewType: 'image' };
  }

  if (ext === '.pdf') {
    return { itemType: 'file', previewType: 'pdf' };
  }

  if (ext === '.tif' || ext === '.tiff') {
    return { itemType: 'file', previewType: 'tiff' };
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

function getAppIconPath() {
  const iconPath = path.join(app.getAppPath(), 'images', 'icon.ico');
  if (fs.existsSync(iconPath)) {
    return iconPath;
  }
  return null;
}

function createMainWindow() {
  const iconPath = getAppIconPath();
  const config = {
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
  };
  
  if (iconPath) {
    config.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(config);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const iconPath = getAppIconPath();
  const config = {
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
  };
  
  if (iconPath) {
    config.icon = iconPath;
  }
  
  settingsWindow = new BrowserWindow(config);

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
  cleanupPdfCacheIfDue();
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

ipcMain.handle('pdfcache:get', (_event, payload = {}) => {
  const inputPath = payload.path;
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  const cacheKey = getPdfCacheKey(payload);
  const { imagePath, metadataPath } = getPdfCachePaths(cacheKey);

  if (!fs.existsSync(imagePath) || !fs.existsSync(metadataPath)) {
    return { ok: false, message: 'Cache miss.' };
  }

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const pageCount = Number(metadata.pageCount) || 0;
    if (isPdfCacheEntryStale(metadata)) {
      fs.rmSync(metadataPath, { force: true });
      fs.rmSync(imagePath, { force: true });
      return { ok: false, message: 'Cache stale.' };
    }
    return { ok: true, imagePath, pageCount };
  } catch (error) {
    return { ok: false, message: 'Cache read failed.' };
  }
});

ipcMain.handle('pdfcache:set', (_event, payload = {}) => {
  const inputPath = payload.path;
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  const imageBuffer = parseImageDataUrl(payload.dataUrl);
  if (!imageBuffer) {
    return { ok: false, message: 'Invalid image data.' };
  }

  const cacheKey = getPdfCacheKey(payload);
  const { imagePath, metadataPath } = getPdfCachePaths(cacheKey);

  try {
    fs.writeFileSync(imagePath, imageBuffer);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          pageCount: Number(payload.pageCount) || 0,
          sourcePath: payload.path,
          sourceModifiedTimeMs: Number(payload.modifiedTimeMs) || 0,
          sourceSize: Number(payload.size) || 0,
          savedAtMs: Date.now()
        },
        null,
        2
      ),
      'utf8'
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, message: 'Cache write failed.' };
  }
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

ipcMain.handle('tiff:getPreview', async (_event, payload = {}) => {
  const inputPath = payload.path;
  if (!inputPath || typeof inputPath !== 'string') {
    return { ok: false, message: 'Invalid path.' };
  }

  try {
    // Use sharp to read TIFF and convert to PNG preview
    const buffer = await sharp(inputPath)
      .resize(300, 300, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png()
      .toBuffer();

    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, message: `Failed to generate TIFF preview: ${error.message}` };
  }
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
