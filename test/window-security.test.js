const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyWindowSecurity } = require('../src/window-security');

function createWebContents(initialUrl = 'file:///app/index.html') {
  const webContents = new EventEmitter();
  webContents.currentUrl = initialUrl;
  webContents.getURL = () => webContents.currentUrl;
  webContents.setWindowOpenHandler = (handler) => {
    webContents.windowOpenHandler = handler;
  };
  return webContents;
}

test('denies new windows and opens HTTP(S) links externally', () => {
  const webContents = createWebContents();
  const openedUrls = [];
  applyWindowSecurity(webContents, {
    openExternal: async (url) => openedUrls.push(url)
  });

  assert.deepEqual(webContents.windowOpenHandler({ url: 'https://example.com/path' }), { action: 'deny' });
  assert.deepEqual(webContents.windowOpenHandler({ url: 'http://example.com' }), { action: 'deny' });
  assert.deepEqual(webContents.windowOpenHandler({ url: 'file:///etc/passwd' }), { action: 'deny' });
  assert.deepEqual(webContents.windowOpenHandler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepEqual(openedUrls, ['https://example.com/path', 'http://example.com/']);
});

test('blocks navigation away from the current document and opens HTTP(S) links externally', () => {
  const webContents = createWebContents();
  const openedUrls = [];
  applyWindowSecurity(webContents, {
    openExternal: async (url) => openedUrls.push(url)
  });

  const sameDocumentEvent = { preventDefault: () => assert.fail('Current document navigation should be allowed') };
  webContents.emit('will-navigate', sameDocumentEvent, 'file:///app/index.html');

  let prevented = false;
  webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://example.com/');
  assert.equal(prevented, true);
  assert.deepEqual(openedUrls, ['https://example.com/']);

  prevented = false;
  webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'file:///tmp/untrusted.html');
  assert.equal(prevented, true);
  assert.deepEqual(openedUrls, ['https://example.com/']);
});
