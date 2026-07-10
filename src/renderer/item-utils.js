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

    copy.sort((a, b) => (b.createdTimeMs || 0) - (a.createdTimeMs || 0));
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

  return {
    SUPPORTED_EXTENSIONS,
    sortItems,
    filterSupportedItems
  };
});
