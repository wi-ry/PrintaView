const test = require('node:test');
const assert = require('node:assert/strict');

const { sortItems, filterSupportedItems } = require('../src/renderer/item-utils.js');

test('filterSupportedItems keeps only supported non-folder files', () => {
  const scanned = [
    { itemType: 'folder', extension: '', name: 'Folder A' },
    { itemType: 'file', extension: '.png', name: 'Image A' },
    { itemType: 'file', extension: '.PDF', name: 'Doc A' },
    { itemType: 'file', extension: '.xlsx', name: 'Sheet A' },
    { itemType: 'file', extension: '.txt', name: 'Text A' },
    { itemType: 'file', extension: '', name: 'No Ext' }
  ];

  const filtered = filterSupportedItems(scanned);
  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((item) => item.name),
    ['Image A', 'Doc A']
  );
});

test('sortItems sorts by most recent when sortBy is recent', () => {
  const items = [
    { name: 'A', createdTimeMs: 100 },
    { name: 'B', createdTimeMs: 300 },
    { name: 'C', createdTimeMs: 200 }
  ];

  const sorted = sortItems(items, 'recent');
  assert.deepEqual(sorted.map((item) => item.name), ['B', 'C', 'A']);
});

test('sortItems sorts by name alphabetically', () => {
  const items = [
    { name: 'zeta' },
    { name: 'alpha' },
    { name: 'beta' }
  ];

  const sorted = sortItems(items, 'name');
  assert.deepEqual(sorted.map((item) => item.name), ['alpha', 'beta', 'zeta']);
});

test('sortItems sorts by type, then by name within type', () => {
  const items = [
    { itemType: 'file', extension: '.pdf', name: 'zFile' },
    { itemType: 'file', extension: '.docx', name: 'aFile' },
    { itemType: 'file', extension: '.docx', name: 'bFile' },
    { itemType: 'folder', extension: '', name: 'folderOne' }
  ];

  const sorted = sortItems(items, 'type');
  assert.deepEqual(
    sorted.map((item) => item.name),
    ['aFile', 'bFile', 'zFile', 'folderOne']
  );
});
