const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDirectoryWatcher, DEFAULT_DEBOUNCE_MS } = require('../src/directory-watcher');

function createFakeFs() {
  const watchers = [];
  return {
    watchers,
    statSync: () => ({ isDirectory: () => true }),
    watch: (folderPath, options, callback) => {
      const watcher = new EventEmitter();
      watcher.folderPath = folderPath;
      watcher.options = options;
      watcher.callback = callback;
      watcher.close = () => { watcher.closed = true; };
      watchers.push(watcher);
      return watcher;
    }
  };
}

test('watches the selected directory recursively and debounces filesystem events', async () => {
  const fakeFs = createFakeFs();
  let changeCount = 0;
  const watcher = createDirectoryWatcher({
    fsImpl: fakeFs,
    debounceMs: 20,
    onChange: () => { changeCount += 1; }
  });

  assert.equal(watcher.watch('/watched'), true);
  assert.equal(fakeFs.watchers[0].folderPath, '/watched');
  assert.deepEqual(fakeFs.watchers[0].options, { recursive: true });

  fakeFs.watchers[0].callback('rename', 'first.jpg');
  fakeFs.watchers[0].callback('change', 'second.jpg');
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(changeCount, 1);
  watcher.close();
  assert.equal(fakeFs.watchers[0].closed, true);
});

test('replaces the previous watcher when the root folder changes', () => {
  const fakeFs = createFakeFs();
  const watcher = createDirectoryWatcher({ fsImpl: fakeFs, onChange: () => {} });

  watcher.watch('/first');
  watcher.watch('/second');

  assert.equal(fakeFs.watchers.length, 2);
  assert.equal(fakeFs.watchers[0].closed, true);
  assert.equal(fakeFs.watchers[1].closed, undefined);
  watcher.close();
  assert.equal(fakeFs.watchers[1].closed, true);
});

test('reports watcher setup errors without throwing', () => {
  const errors = [];
  const watcher = createDirectoryWatcher({
    fsImpl: {
      statSync: () => { throw new Error('missing folder'); },
      watch: () => { throw new Error('should not be called'); }
    },
    onChange: () => {},
    onError: (error) => errors.push(error)
  });

  assert.equal(watcher.watch('/missing'), false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'missing folder');
});

test('uses a short debounce by default', () => {
  assert.equal(DEFAULT_DEBOUNCE_MS, 400);
});
