const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { walkDirectoryRecursive } = require('../src/directory-walker.js');

test('walkDirectoryRecursive visits a directory junction loop only once', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-walker-'));
  const nested = path.join(root, 'nested');
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, 'image.png'), '');

  try {
    fs.symlinkSync(root, path.join(nested, 'back-to-root'), 'junction');
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Directory junctions are unavailable: ${error.message}`);
      return;
    }
    throw error;
  }

  try {
    let timeout;
    const entries = await Promise.race([
      walkDirectoryRecursive(root),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Directory walk did not terminate')), 2000);
      })
    ]).finally(() => clearTimeout(timeout));

    assert.deepEqual(
      entries.map(({ absolutePath }) => absolutePath).sort(),
      [nested, path.join(nested, 'back-to-root'), path.join(nested, 'image.png')].sort()
    );
    const image = entries.find(({ absolutePath }) => absolutePath.endsWith('image.png'));
    assert.equal(image.parentPath, nested);
    assert.equal(image.stats.size, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('walkDirectoryRecursive preserves entries and metadata in nested directories', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-walker-'));
  const nested = path.join(root, 'nested');
  const deeper = path.join(nested, 'deeper');
  const imagePath = path.join(deeper, 'nested image.png');
  fs.mkdirSync(deeper, { recursive: true });
  fs.writeFileSync(imagePath, 'image fixture');

  try {
    const entries = await walkDirectoryRecursive(root);
    const directory = entries.find(({ absolutePath }) => absolutePath === deeper);
    const image = entries.find(({ absolutePath }) => absolutePath === imagePath);

    assert.ok(directory);
    assert.equal(directory.parentPath, nested);
    assert.ok(directory.stats.isDirectory());
    assert.ok(image);
    assert.equal(image.parentPath, deeper);
    assert.equal(image.stats.size, Buffer.byteLength('image fixture'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('walkDirectoryRecursive scans contents only once when directories have multiple junctions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-walker-'));
  const target = path.join(root, 'target');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'unique.txt'), 'unique fixture');

  try {
    fs.symlinkSync(target, path.join(root, 'alias-one'), 'junction');
    fs.symlinkSync(target, path.join(root, 'alias-two'), 'junction');
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`Directory junctions are unavailable: ${error.message}`);
      return;
    }
    throw error;
  }

  try {
    const entries = await walkDirectoryRecursive(root);
    const fileEntries = entries.filter(({ absolutePath }) => path.basename(absolutePath) === 'unique.txt');
    const directoryAliases = entries.filter(({ absolutePath }) =>
      ['target', 'alias-one', 'alias-two'].includes(path.basename(absolutePath))
    );

    assert.equal(fileEntries.length, 1);
    assert.equal(fileEntries[0].stats.size, Buffer.byteLength('unique fixture'));
    assert.equal(directoryAliases.length, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('walkDirectoryRecursive skips an inaccessible directory and scans its siblings', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-walker-'));
  const inaccessible = path.join(root, 'inaccessible');
  const accessible = path.join(root, 'accessible');
  fs.mkdirSync(inaccessible);
  fs.mkdirSync(accessible);
  fs.writeFileSync(path.join(inaccessible, 'hidden.txt'), 'hidden');
  fs.writeFileSync(path.join(accessible, 'visible.txt'), 'visible');
  const deniedFileSystem = {
    ...fs.promises,
    readdir: async (directoryPath, options) => {
      if (directoryPath === inaccessible) {
        const error = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      }
      return fs.promises.readdir(directoryPath, options);
    }
  };

  try {
    const entries = await walkDirectoryRecursive(root, deniedFileSystem);
    const paths = entries.map(({ absolutePath }) => absolutePath);

    assert.ok(paths.includes(accessible));
    assert.ok(paths.includes(path.join(accessible, 'visible.txt')));
    assert.ok(paths.includes(inaccessible));
    assert.ok(!paths.includes(path.join(inaccessible, 'hidden.txt')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
