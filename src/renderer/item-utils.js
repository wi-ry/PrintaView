(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrintaViewItemUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SUPPORTED_EXTENSIONS = Object.freeze([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.ico',
    '.pdf'
  ]);

  const SUPPORTED_EXTENSION_SET = new Set(SUPPORTED_EXTENSIONS);

  function sortItems(items, sortBy) {
    const copy = [...items];

    if (sortBy === 'name') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
      return copy;
    }

    if (sortBy === 'type') {
      copy.sort((a, b) => {
        const typeA = a.itemType === 'folder' ? 'folder' : a.extension;
        const typeB = b.itemType === 'folder' ? 'folder' : b.extension;
        const byType = typeA.localeCompare(typeB);
        if (byType !== 0) {
          return byType;
        }
        return a.name.localeCompare(b.name);
      });
      return copy;
    }

    copy.sort((a, b) => {
      const timeA = a.createdTimeMs || 0;
      const timeB = b.createdTimeMs || 0;
      return sortBy === 'oldest' ? timeA - timeB : timeB - timeA;
    });
    return copy;
  }

  function filterSupportedItems(scannedItems) {
    return scannedItems.filter((item) => {
      if (item.itemType === 'folder') {
        return false;
      }
      return SUPPORTED_EXTENSION_SET.has((item.extension || '').toLowerCase());
    });
  }

  function toFileUrl(filePath) {
    const normalized = filePath.replace(/\\/g, '/');

    if (normalized.startsWith('//')) {
      const [, , host, ...segments] = normalized.split('/');
      return `file://${host}/${segments.map(encodeURIComponent).join('/')}`;
    }

    const segments = normalized.split('/');
    const drivePrefix = /^[a-zA-Z]:$/.test(segments[0]) ? segments.shift() : null;
    const encodedPath = segments.map(encodeURIComponent).join('/');
    return drivePrefix
      ? `file:///${drivePrefix}/${encodedPath}`
      : `file://${encodedPath}`;
  }

  function findCardByItemId(cards, itemId) {
    return Array.from(cards).find((card) => card.dataset.itemId === itemId) || null;
  }

  return {
    SUPPORTED_EXTENSIONS,
    sortItems,
    filterSupportedItems,
    toFileUrl,
    findCardByItemId
  };
});
