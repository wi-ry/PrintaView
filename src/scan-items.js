const path = require('path');

function normalizePathForKey(inputPath) {
  return path.resolve(inputPath).toLowerCase();
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

  if (ext === '.psd') {
    return { itemType: 'file', previewType: 'psd' };
  }

  if (ext === '.pdf') {
    return { itemType: 'file', previewType: 'pdf' };
  }

  if (ext === '.tif' || ext === '.tiff') {
    return { itemType: 'file', previewType: 'tiff' };
  }

  return { itemType: 'file', previewType: 'generic' };
}

function createScannedItems(entries, hiddenSet, favoriteSet, includeHidden) {
  const items = [];

  for (const { absolutePath, parentPath, stats } of entries) {
    const normalizedPath = normalizePathForKey(absolutePath);
    const hiddenByApp = isPathHidden(absolutePath, hiddenSet);
    const { itemType, previewType } = categorizeFile(absolutePath, stats.isDirectory());
    const item = {
      id: normalizedPath,
      name: path.basename(absolutePath),
      path: absolutePath,
      parentPath,
      extension: stats.isDirectory() ? '' : path.extname(absolutePath).toLowerCase(),
      itemType,
      previewType,
      modifiedTimeMs: stats.mtimeMs,
      createdTimeMs: stats.birthtimeMs,
      size: stats.size,
      hiddenByApp,
      favoritedByApp: favoriteSet.has(normalizedPath)
    };

    if (includeHidden || !hiddenByApp) {
      items.push(item);
    }
  }

  return items;
}

module.exports = {
  createScannedItems,
  normalizePathForKey
};
