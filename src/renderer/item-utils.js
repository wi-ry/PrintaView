(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrintaViewItemUtils = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.psd'
  ]);
  const TIFF_EXTENSIONS = new Set(['.tif', '.tiff']);
  const FILTER_TYPES = Object.freeze(['image', 'pdf', 'tiff', 'other', 'custom']);
  const DEFAULT_FILTER_TYPES = Object.freeze(['image', 'pdf', 'tiff']);

  function getItemDateMs(item, sortBy) {
    const value = sortBy === 'created' ? item.createdTimeMs : item.modifiedTimeMs;
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }

  function sortItems(items, sortBy, sortOrder = 'ascending') {
    const copy = [...items];
    const direction = sortOrder === 'descending' ? -1 : 1;
    const compareNames = (a, b) => a.name.localeCompare(
      b.name,
      undefined,
      { numeric: true, sensitivity: 'base' }
    );

    if (sortBy === 'name') {
      copy.sort((a, b) => direction * compareNames(a, b));
      return copy;
    }

    if (sortBy === 'type') {
      copy.sort((a, b) => {
        const typeA = a.itemType === 'folder' ? 'folder' : (a.extension || '');
        const typeB = b.itemType === 'folder' ? 'folder' : (b.extension || '');
        return direction * (typeA.localeCompare(typeB) || compareNames(a, b));
      });
      return copy;
    }

    copy.sort((a, b) => {
      const timeA = getItemDateMs(a, sortBy);
      const timeB = getItemDateMs(b, sortBy);
      if (timeA === null || timeB === null) {
        if (timeA === timeB) return compareNames(a, b);
        return timeA === null ? 1 : -1;
      }
      return direction * (timeA - timeB) || compareNames(a, b);
    });
    return copy;
  }

  function getDateGroup(item, now = Date.now(), sortBy = 'created') {
    const timestamp = getItemDateMs(item, sortBy);
    const date = timestamp === null ? new Date(0) : new Date(timestamp);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const startOfThisWeek = new Date(today);
    const daysSinceMonday = (startOfThisWeek.getDay() + 6) % 7;
    startOfThisWeek.setDate(startOfThisWeek.getDate() - daysSinceMonday);
    if (date >= today) return 'Today';
    if (date >= startOfThisWeek) return 'This week';
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    if (date >= startOfLastWeek) return 'Last week';
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    if (date >= startOfYear) return 'Earlier this year';
    return 'A long time ago';
  }

  function filterDisplayableItems(scannedItems) {
    return scannedItems.filter((item) => item.itemType !== 'folder');
  }

  function normalizeExtensions(extensions) {
    const values = Array.isArray(extensions)
      ? extensions
      : typeof extensions === 'string'
        ? extensions.split(/[,\s;]+/)
        : [];
    return [...new Set(values
      .filter((extension) => typeof extension === 'string')
      .map((extension) => extension.trim().toLowerCase().replace(/^\*?\./, ''))
      .filter((extension) => /^[a-z0-9][a-z0-9._-]*$/.test(extension) && !extension.endsWith('.'))
      .map((extension) => `.${extension}`))];
  }

  function getItemType(item, customExtensions = []) {
    const extension = (item.extension || '').toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (TIFF_EXTENSIONS.has(extension)) return 'tiff';
    if (extension === '.pdf') return 'pdf';
    if (normalizeExtensions(customExtensions).includes(extension)) return 'custom';
    return 'other';
  }

  function filterItems(items, filters, query = '', now = Date.now(), customExtensions = []) {
    const selectedTypes = new Set(filters.types);
    const normalizedQuery = query.trim().toLowerCase();
    const modifiedSince = {
      any: null,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000
    }[filters.modified] ?? null;

    return items.filter((item) => {
      if (filters.favorites === 'favorites' && !item.favoritedByApp) return false;
      if (!selectedTypes.has(getItemType(item, customExtensions))) return false;

      if (modifiedSince !== null &&
          (!Number.isFinite(item.modifiedTimeMs) || item.modifiedTimeMs < now - modifiedSince)) {
        return false;
      }

      const size = Number(item.size) || 0;
      const megabyte = 1024 * 1024;
      if (filters.size === 'under-1mb' && size >= megabyte) return false;
      if (filters.size === '1-10mb' && (size < megabyte || size > 10 * megabyte)) return false;
      if (filters.size === 'over-10mb' && size <= 10 * megabyte) return false;

      if (normalizedQuery &&
          ![item.name, item.extension, item.path]
            .some((value) => (value || '').toLowerCase().includes(normalizedQuery))) {
        return false;
      }

      return true;
    });
  }

  function normalizeFilters(filters = {}, defaultTypes = DEFAULT_FILTER_TYPES) {
    const types = Array.isArray(filters.types)
      ? FILTER_TYPES.filter((type) => filters.types.includes(type))
      : FILTER_TYPES.filter((type) => defaultTypes.includes(type));
    return {
      favorites: ['all', 'favorites'].includes(filters.favorites)
        ? filters.favorites
        : 'all',
      types: types.length > 0 ? types : FILTER_TYPES.filter((type) => defaultTypes.includes(type)),
      modified: ['any', '7d', '30d', '1y'].includes(filters.modified)
        ? filters.modified
        : 'any',
      size: ['any', 'under-1mb', '1-10mb', 'over-10mb'].includes(filters.size)
        ? filters.size
        : 'any'
    };
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
    sortItems,
    getDateGroup,
    normalizeExtensions,
    getItemType,
    filterDisplayableItems,
    filterItems,
    normalizeFilters,
    toFileUrl,
    findCardByItemId
  };
});
