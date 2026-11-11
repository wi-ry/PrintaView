const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createScannedItems, normalizePathForKey } = require('../src/scan-items.js');

function stats({ directory = false, size = 0, modified = 20, created = 10 } = {}) {
  return {
    isDirectory: () => directory,
    size,
    mtimeMs: modified,
    birthtimeMs: created
  };
}

test('createScannedItems maps path metadata, preview types, hidden ancestry, and favorites', () => {
  const root = path.resolve('scan-fixture');
  const folderPath = path.join(root, 'hidden-folder');
  const imagePath = path.join(folderPath, 'favorite.PNG');
  const pdfPath = path.join(root, 'document.pdf');
  const items = createScannedItems([
    { absolutePath: folderPath, parentPath: root, stats: stats({ directory: true }) },
    { absolutePath: imagePath, parentPath: folderPath, stats: stats({ size: 12 }) },
    { absolutePath: pdfPath, parentPath: root, stats: stats({ size: 34 }) },
    { absolutePath: path.join(root, 'artwork.psd'), parentPath: root, stats: stats({ size: 56 }) }
  ], new Set([normalizePathForKey(folderPath)]), new Set([normalizePathForKey(imagePath)]), true);

  assert.deepEqual(items.map(({ name }) => name), [
    'hidden-folder', 'favorite.PNG', 'document.pdf', 'artwork.psd'
  ]);
  assert.deepEqual(items.map(({ itemType, previewType }) => [itemType, previewType]), [
    ['folder', 'folder'],
    ['file', 'image'],
    ['file', 'pdf'],
    ['file', 'psd']
  ]);
  assert.equal(items[1].extension, '.png');
  assert.equal(items[1].size, 12);
  assert.equal(items[1].modifiedTimeMs, 20);
  assert.equal(items[1].createdTimeMs, 10);
  assert.equal(items[1].parentPath, folderPath);
  assert.equal(items[1].hiddenByApp, true);
  assert.equal(items[1].favoritedByApp, true);
  assert.equal(items[2].hiddenByApp, false);
  assert.equal(items[2].favoritedByApp, false);
});

test('createScannedItems excludes items hidden by a parent when hidden items are disabled', () => {
  const hiddenFolder = path.resolve('scan-fixture', 'hidden-folder');
  const hiddenFile = path.join(hiddenFolder, 'hidden.tiff');
  const visibleFile = path.resolve('scan-fixture', 'visible.txt');

  const items = createScannedItems([
    { absolutePath: hiddenFolder, parentPath: path.dirname(hiddenFolder), stats: stats({ directory: true }) },
    { absolutePath: hiddenFile, parentPath: hiddenFolder, stats: stats() },
    { absolutePath: visibleFile, parentPath: path.dirname(visibleFile), stats: stats() }
  ], new Set([normalizePathForKey(hiddenFolder)]), new Set(), false);

  assert.deepEqual(items.map(({ path: itemPath }) => itemPath), [visibleFile]);
  assert.equal(items[0].previewType, 'generic');
});

test('createScannedItems treats __MACOSX folder as hidden', () => {
  const macosxFolder = path.resolve('scan-fixture', '__MACOSX');
  const macosxFile = path.join(macosxFolder, 'Icon\r');
  const visibleFile = path.resolve('scan-fixture', 'visible.txt');

  const items = createScannedItems([
    { absolutePath: macosxFolder, parentPath: path.dirname(macosxFolder), stats: stats({ directory: true }) },
    { absolutePath: macosxFile, parentPath: macosxFolder, stats: stats({ size: 8 }) },
    { absolutePath: visibleFile, parentPath: path.dirname(visibleFile), stats: stats() }
  ], new Set(), new Set(), true);

  assert.deepEqual(items.map(({ name, hiddenByApp }) => ({ name, hiddenByApp })), [
    { name: '__MACOSX', hiddenByApp: true },
    { name: 'Icon\r', hiddenByApp: true },
    { name: 'visible.txt', hiddenByApp: false }
  ]);
  assert.equal(items.filter(i => !i.hiddenByApp).length, 1);
  assert.equal(items[2].name, 'visible.txt');
});
