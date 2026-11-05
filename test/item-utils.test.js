const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const {
  sortItems,
  filterSupportedItems,
  toFileUrl,
  findCardByItemId
} = require('../src/renderer/item-utils.js');

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

test('sortItems sorts by oldest when sortBy is oldest', () => {
  const items = [
    { name: 'A', createdTimeMs: 100 },
    { name: 'B', createdTimeMs: 300 },
    { name: 'C', createdTimeMs: 200 }
  ];

  const sorted = sortItems(items, 'oldest');
  assert.deepEqual(sorted.map((item) => item.name), ['A', 'C', 'B']);
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

test('toFileUrl encodes reserved characters in Windows paths', () => {
  assert.equal(
    toFileUrl('C:\\Users\\Person\\A #100%?.png'),
    'file:///C:/Users/Person/A%20%23100%25%3F.png'
  );
});

test('toFileUrl encodes reserved characters in UNC paths', () => {
  assert.equal(
    toFileUrl('\\\\server\\share\\A #100%?.png'),
    'file://server/share/A%20%23100%25%3F.png'
  );
});

test('toFileUrl round-trips an existing path containing reserved characters', () => {
  const originalPath = path.join(
    path.parse(process.cwd()).root,
    'PrintaView URL test #100% [sample]?.png'
  );
  const fileUrl = toFileUrl(originalPath);

  assert.equal(fileURLToPath(fileUrl), originalPath);
});

test('findCardByItemId matches Windows paths without parsing them as CSS', () => {
  const path = 'c:\\users\\person\\file [#1].png';
  const cards = [
    { dataset: { itemId: 'c:\\users\\person\\other.png' } },
    { dataset: { itemId: path } }
  ];

  assert.equal(findCardByItemId(cards, path), cards[1]);
  assert.equal(findCardByItemId(cards, 'missing'), null);
});
