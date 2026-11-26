const fs = require('fs');
const path = require('path');

const DEFAULT_DEBOUNCE_MS = 400;

function createDirectoryWatcher({
  onChange,
  onError = (error) => console.warn('Folder watcher error:', error),
  debounceMs = DEFAULT_DEBOUNCE_MS,
  fsImpl = fs
} = {}) {
  if (typeof onChange !== 'function') {
    throw new TypeError('onChange must be a function.');
  }

  let watcher = null;
  let watchedPath = null;
  let debounceTimer = null;

  function clearPendingChange() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function close() {
    clearPendingChange();
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    watchedPath = null;
  }

  function watch(folderPath) {
    const resolvedPath = path.resolve(folderPath);
    if (resolvedPath === watchedPath && watcher) {
      return true;
    }

    close();

    try {
      const stats = fsImpl.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        throw new Error(`Watch path is not a directory: ${resolvedPath}`);
      }

      watcher = fsImpl.watch(resolvedPath, { recursive: true }, () => {
        clearPendingChange();
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          onChange();
        }, debounceMs);
        debounceTimer.unref?.();
      });

      watcher.on('error', (error) => {
        onError(error);
        close();
      });

      watchedPath = resolvedPath;
      return true;
    } catch (error) {
      onError(error);
      close();
      return false;
    }
  }

  return { watch, close };
}

module.exports = { createDirectoryWatcher, DEFAULT_DEBOUNCE_MS };
