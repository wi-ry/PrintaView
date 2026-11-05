const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const { findDuplicateGroups } = require('../src/duplicate-scanner.js');

const {
  sortItems,
  getDateGroup,
  getItemType,
  normalizeExtensions,
  filterDisplayableItems,
  filterItems,
  normalizeFilters,
  toFileUrl,
  findCardByItemId
} = require('../src/renderer/item-utils.js');

test('getDateGroup classifies today, this week, last week, this year, and older dates', () => {
  const now = new Date(2026, 4, 20, 12).getTime();
  const itemAt = (year, month, day) => ({ createdTimeMs: new Date(year, month, day, 9).getTime() });

  assert.equal(getDateGroup(itemAt(2026, 4, 20), now), 'Today');
  assert.equal(getDateGroup(itemAt(2026, 4, 19), now), 'This week');
  assert.equal(getDateGroup(itemAt(2026, 4, 11), now), 'Last week');
  assert.equal(getDateGroup(itemAt(2026, 1, 2), now), 'Earlier this year');
  assert.equal(getDateGroup(itemAt(2025, 11, 31), now), 'A long time ago');
});

test('getDateGroup treats the prior week as Last week across a year boundary', () => {
  const now = new Date(2026, 0, 5, 12).getTime();

  assert.equal(getDateGroup({ createdTimeMs: new Date(2025, 11, 29, 9).getTime() }, now), 'Last week');
  assert.equal(getDateGroup({ createdTimeMs: new Date(2025, 11, 21, 9).getTime() }, now), 'A long time ago');
});

test('filterDisplayableItems keeps files of every type but excludes folders', () => {
  const scanned = [
    { itemType: 'folder', extension: '', name: 'Folder A' },
    { itemType: 'file', extension: '.png', name: 'Image A' },
    { itemType: 'file', extension: '.PDF', name: 'Doc A' },
    { itemType: 'file', extension: '.xlsx', name: 'Sheet A' },
    { itemType: 'file', extension: '.txt', name: 'Text A' }
  ];

  const filtered = filterDisplayableItems(scanned);
  assert.equal(filtered.length, 4);
  assert.deepEqual(
    filtered.map((item) => item.name),
    ['Image A', 'Doc A', 'Sheet A', 'Text A']
  );
});

test('default type filters show previewable types and exclude Other until enabled', () => {
  const items = [
    { name: 'image.png', extension: '.png' },
    { name: 'artwork.psd', extension: '.psd' },
    { name: 'document.pdf', extension: '.pdf' },
    { name: 'scan.tiff', extension: '.tiff' },
    { name: 'notes.txt', extension: '.txt' },
    { name: 'sheet.xlsx', extension: '.xlsx' }
  ];

  const defaults = normalizeFilters();
  assert.deepEqual(defaults.types, ['image', 'pdf', 'tiff']);
  assert.deepEqual(
    filterItems(items, defaults).map((item) => item.name),
    ['image.png', 'artwork.psd', 'document.pdf', 'scan.tiff']
  );
  assert.deepEqual(
    filterItems(items, normalizeFilters({ types: [...defaults.types, 'other'] }))
      .map((item) => item.name),
    ['image.png', 'artwork.psd', 'document.pdf', 'scan.tiff', 'notes.txt', 'sheet.xlsx']
  );
});

test('custom extensions normalize consistently and get their own file type', () => {
  const extensions = normalizeExtensions('.PSD, zip\n*.blend; .psd');

  assert.deepEqual(extensions, ['.psd', '.zip', '.blend']);
  assert.equal(getItemType({ extension: '.PSD' }, extensions), 'image');
  assert.equal(getItemType({ extension: '.docx' }, extensions), 'other');
  assert.equal(getItemType({ extension: '.pdf' }, extensions), 'pdf');

  const items = [
    { name: 'art.psd', extension: '.psd' },
    { name: 'archive.zip', extension: '.zip' },
    { name: 'notes.txt', extension: '.txt' }
  ];
  assert.deepEqual(
    filterItems(items, normalizeFilters({ types: ['custom'] }), '', Date.now(), extensions)
      .map((item) => item.name),
    ['archive.zip']
  );
});

test('filterItems combines type, favorite, modified date, size, and search filters', () => {
  const now = 1_800_000_000_000;
  const items = [
    { name: 'favorite.pdf', path: '/favorite.pdf', extension: '.pdf', favoritedByApp: true, modifiedTimeMs: now - 2 * 86400000, size: 2 * 1024 * 1024 },
    { name: 'old.pdf', path: '/old.pdf', extension: '.pdf', favoritedByApp: true, modifiedTimeMs: now - 40 * 86400000, size: 2 * 1024 * 1024 },
    { name: 'image.png', path: '/image.png', extension: '.png', favoritedByApp: false, modifiedTimeMs: now - 86400000, size: 512 }
  ];

  const filters = normalizeFilters({
    favorites: 'favorites',
    types: ['pdf'],
    modified: '7d',
    size: '1-10mb'
  });
  assert.deepEqual(filterItems(items, filters, 'favorite', now).map((item) => item.name), ['favorite.pdf']);
});

test('filterItems applies inclusive 1–10 MB bounds and separates TIFF from images', () => {
  const items = [
    { name: 'small.pdf', extension: '.pdf', size: 1024 * 1024 - 1 },
    { name: 'one.pdf', extension: '.pdf', size: 1024 * 1024 },
    { name: 'ten.pdf', extension: '.pdf', size: 10 * 1024 * 1024 },
    { name: 'large.pdf', extension: '.pdf', size: 10 * 1024 * 1024 + 1 },
    { name: 'scan.tiff', extension: '.tiff', size: 100 }
  ];

  assert.deepEqual(
    filterItems(items, normalizeFilters({ types: ['pdf'], size: '1-10mb' })).map((item) => item.name),
    ['one.pdf', 'ten.pdf']
  );
  assert.deepEqual(
    filterItems(items, normalizeFilters({ types: ['tiff'] })).map((item) => item.name),
    ['scan.tiff']
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

test('findDuplicateGroups detects exact content and ignores same-sized differences', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-duplicates-'));
  try {
    const contents = [
      ['first.bin', 'same content'],
      ['copy.bin', 'same content'],
      ['different.bin', 'nope content']
    ];
    const entries = contents.map(([name, content]) => {
      const absolutePath = path.join(directory, name);
      fs.writeFileSync(absolutePath, content);
      return {
        absolutePath,
        parentPath: directory,
        stats: fs.statSync(absolutePath)
      };
    });

    const { groups } = await findDuplicateGroups(entries);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].files.map((file) => file.name), ['copy.bin', 'first.bin']);
    assert.equal(groups[0].size, Buffer.byteLength('same content'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('findDuplicateGroups skips unreadable files and reports them without losing other matches', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-duplicates-unreadable-'));
  try {
    const contents = [
      ['first.bin', 'same content'],
      ['copy.bin', 'same content'],
      ['unreadable.bin', 'nope content']
    ];
    const entries = contents.map(([name, content]) => {
      const absolutePath = path.join(directory, name);
      fs.writeFileSync(absolutePath, content);
      return {
        absolutePath,
        parentPath: directory,
        stats: fs.statSync(absolutePath)
      };
    });
    const unreadablePath = entries[2].absolutePath;
    fs.unlinkSync(unreadablePath);

    const result = await findDuplicateGroups(entries);
    assert.equal(result.groups.length, 1);
    assert.deepEqual(result.groups[0].files.map((file) => file.name), ['copy.bin', 'first.bin']);
    assert.deepEqual(result.skippedFiles.map((file) => file.name), ['unreadable.bin']);
    assert.equal(result.skippedFiles[0].path, unreadablePath);
    assert.ok(result.skippedFiles[0].message);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
