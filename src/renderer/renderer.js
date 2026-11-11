import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../node_modules/pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const gridElement = document.getElementById('grid');
const loadingStateElement = document.getElementById('loading-state');
const loadingMessageElement = document.getElementById('loading-message');
const downloadsPathElement = document.getElementById('downloads-path');
const sortButton = document.getElementById('sort-select');
const sortValueLabel = document.getElementById('sort-value-label');
const sortPopover = document.getElementById('sort-popover');
const sortControl = document.querySelector('.sort-control');
const sizeRange = document.getElementById('size-range');
const filterButton = document.getElementById('filter-button');
const filterPopover = document.getElementById('filter-popover');
const filterCount = document.getElementById('filter-count');
const activeFilterBar = document.getElementById('active-filter-bar');
const favoritesFilter = document.getElementById('favorites-filter');
const modifiedFilter = document.getElementById('modified-filter');
const sizeFilter = document.getElementById('size-filter');
const filterControl = document.querySelector('.filter-control');
const duplicateToolbar = document.getElementById('duplicate-toolbar');
const duplicateWarning = document.getElementById('duplicate-warning');
const duplicateGroupTemplate = document.getElementById('duplicate-group-template');
const refreshButton = document.getElementById('refresh-button');
const browseButton = document.getElementById('browse-button');
const contextMenu = document.getElementById('context-menu');
const openItemButton = document.getElementById('open-item');
const revealItemButton = document.getElementById('reveal-item');
const toggleFavoriteButton = document.getElementById('toggle-favorite-item');
const toggleHideButton = document.getElementById('toggle-hide-item');
const cardTemplate = document.getElementById('card-template');
const viewMenuButton = document.getElementById('view-menu-button');
const detailsPane = document.getElementById('details-pane');
const toggleDetailsPaneButton = document.getElementById('toggle-details-pane-button');
const closeDetailsPaneButton = document.getElementById('close-details-pane-button');
const detailsPaneResizer = document.getElementById('details-pane-resizer');
const contentWrapper = document.querySelector('.content-wrapper');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const itemUtils = window.PrintaViewItemUtils;

let downloadsPath = '';
let allItems = [];
let contextMenuTargetPath = null;
let contextMenuTargetHidden = false;
let contextMenuTargetFavorite = false;
let selectedItemId = null;
let showHiddenFiles = false;
let searchQuery = '';
let filters = itemUtils.normalizeFilters();
let defaultFileTypes = ['image', 'pdf', 'tiff'];
let customExtensions = [];
let duplicateGroups = null;
let duplicateSkippedFiles = [];
let isFindingDuplicates = false;
const collapsedGroups = new Set();
const MIN_DETAILS_PANE_WIDTH = 240;
const MAX_DETAILS_PANE_WIDTH = 600;

function updateDetailsPaneWidth(width) {
  const normalizedWidth = Math.min(MAX_DETAILS_PANE_WIDTH, Math.max(MIN_DETAILS_PANE_WIDTH, Math.round(width)));
  document.documentElement.style.setProperty('--details-pane-width', `${normalizedWidth}px`);
  detailsPaneResizer.setAttribute('aria-valuenow', String(normalizedWidth));
  return normalizedWidth;
}

async function saveDetailsPaneWidth() {
  try {
    const result = await window.printaViewApi.saveSettings({
      detailsPaneWidth: Number(detailsPaneResizer.getAttribute('aria-valuenow'))
    });
    if (!result?.ok) {
      throw new Error('The details pane width could not be saved.');
    }
  } catch (error) {
    console.error('Failed to save details pane width:', error);
    updateGridStatus('Could not save the details pane width.');
  }
}

function setSortBy(value) {
  const option = sortPopover.querySelector(`[data-sort-value="${value}"]`);
  if (!option) return;

  sortButton.dataset.sortValue = value;
  sortValueLabel.textContent = option.textContent;
  sortPopover.querySelectorAll('[data-sort-value]').forEach((item) => {
    item.setAttribute('aria-checked', item === option ? 'true' : 'false');
  });
}

function updateGridStatus(message, loading = false) {
  loadingMessageElement.textContent = message;
  loadingStateElement.classList.toggle('is-loading', loading);
  loadingStateElement.setAttribute('aria-busy', loading ? 'true' : 'false');
  loadingStateElement.hidden = message === '';
}

const imageCache = new Map();
const pdfThumbnailCache = new Map();
const pdfThumbnailInFlight = new Map();

function getPdfCacheToken(item) {
  return `${item.path.toLowerCase()}|${Number(item.modifiedTimeMs) || 0}|${Number(item.size) || 0}`;
}

function cachePreview(filePath, dataUrl) {
  imageCache.set(filePath, dataUrl);
}

function getCachedPreview(filePath) {
  return imageCache.get(filePath);
}

async function getPdfThumbnailData(item) {
  const cacheToken = getPdfCacheToken(item);
  const cached = pdfThumbnailCache.get(cacheToken);
  if (cached) {
    return cached;
  }

  const inFlight = pdfThumbnailInFlight.get(cacheToken);
  if (inFlight) {
    return inFlight;
  }

  const generationTask = (async () => {
    const diskCacheResult = await window.printaViewApi.getPdfCache({
      path: item.path,
      modifiedTimeMs: item.modifiedTimeMs,
      size: item.size
    });

    if (diskCacheResult?.ok && diskCacheResult.imagePath) {
      const cachedData = {
        dataUrl: toFileUrl(diskCacheResult.imagePath),
        pageCount: Number(diskCacheResult.pageCount) || 0
      };
      pdfThumbnailCache.set(cacheToken, cachedData);
      return cachedData;
    }

    const loadingTask = pdfjsLib.getDocument({ url: toFileUrl(item.path) });
    const pdf = await loadingTask.promise;

    try {
      const page = await pdf.getPage(1);
      const initialViewport = page.getViewport({ scale: 1 });
      const targetWidth = 320;
      const scale = targetWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const context = canvas.getContext('2d', { alpha: false });
      await page.render({ canvasContext: context, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const thumbnailData = {
        dataUrl,
        pageCount: pdf.numPages
      };

      pdfThumbnailCache.set(cacheToken, thumbnailData);

      window.printaViewApi.setPdfCache({
        path: item.path,
        modifiedTimeMs: item.modifiedTimeMs,
        size: item.size,
        dataUrl,
        pageCount: thumbnailData.pageCount
      }).catch(() => {
        // Ignore cache write errors to avoid impacting preview rendering.
      });

      return thumbnailData;
    } finally {
      pdf.cleanup();
      loadingTask.destroy();
    }
  })()
    .finally(() => {
      pdfThumbnailInFlight.delete(cacheToken);
    });

  pdfThumbnailInFlight.set(cacheToken, generationTask);
  return generationTask;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${bytes || 0} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = -1;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function toFileUrl(filePath) {
  return itemUtils.toFileUrl(filePath);
}

async function openItemByPath(itemPath, name) {
  try {
    const result = await window.printaViewApi.openItem({ path: itemPath });
    if (!result.ok) throw new Error(result.message || 'The file could not be opened.');
  } catch (error) {
    console.error('Failed to open file:', error);
    updateGridStatus(`Could not open ${name}: ${error.message}`);
  }
}

function applyTheme(theme) {
  if (!theme || theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
}

function updateDetailsPaneVisibility(isVisible) {
  detailsPane.classList.toggle('hidden', !isVisible);
  contentWrapper.classList.toggle('details-pane-hidden', !isVisible);
  toggleDetailsPaneButton.setAttribute('aria-pressed', String(isVisible));
  const label = `${isVisible ? 'Hide' : 'Show'} details pane`;
  toggleDetailsPaneButton.setAttribute('aria-label', label);
  toggleDetailsPaneButton.title = label;
}

async function setDetailsPaneVisibility(isVisible) {
  const previousVisibility = !detailsPane.classList.contains('hidden');
  updateDetailsPaneVisibility(isVisible);

  try {
    const result = await window.printaViewApi.saveSettings({ showDetailsPane: isVisible });
    if (!result?.ok) {
      throw new Error('The details pane setting could not be saved.');
    }
  } catch (error) {
    updateDetailsPaneVisibility(previousVisibility);
    console.error('Failed to save details pane visibility:', error);
    updateGridStatus('Could not save the details pane setting.');
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTargetPath = null;
  contextMenuTargetHidden = false;
  contextMenuTargetFavorite = false;
}

function getVisibleItems() {
  return itemUtils.filterItems(allItems, filters, searchQuery, Date.now(), customExtensions);
}

function getActiveFilters() {
  const active = [];
  if (filters.favorites !== 'all') {
    active.push({ key: 'favorites', label: 'Favourites' });
  }
  const isDefaultTypeSelection = filters.types.length === defaultFileTypes.length &&
    defaultFileTypes.every((type) => filters.types.includes(type));
  if (!isDefaultTypeSelection) {
    const labels = { image: 'Images', pdf: 'PDF', tiff: 'TIFF', other: 'Other', custom: 'Custom' };
    active.push({ key: 'types', label: `Type: ${filters.types.map((type) => labels[type]).join(', ') || 'None'}` });
  }
  const modifiedLabels = { '7d': 'Last 7 days', '30d': 'Last 30 days', '1y': 'Last year' };
  if (filters.modified !== 'any') {
    active.push({ key: 'modified', label: modifiedLabels[filters.modified] });
  }
  const sizeLabels = {
    'under-1mb': 'Under 1 MB',
    '1-10mb': '1–10 MB',
    'over-10mb': 'Over 10 MB'
  };
  if (filters.size !== 'any') {
    active.push({ key: 'size', label: sizeLabels[filters.size] });
  }
  return active;
}

function updateFilterUI() {
  favoritesFilter.value = filters.favorites;
  modifiedFilter.value = filters.modified;
  sizeFilter.value = filters.size;
  for (const checkbox of filterPopover.querySelectorAll('input[name="file-type"]')) {
    checkbox.checked = filters.types.includes(checkbox.value);
  }
  const customTypeInput = filterPopover.querySelector('input[name="file-type"][value="custom"]');
  customTypeInput.disabled = customExtensions.length === 0;
  customTypeInput.closest('label').title = customExtensions.length > 0
    ? customExtensions.join(', ')
    : 'Add custom extensions in Settings';

  const active = getActiveFilters();
  filterCount.textContent = String(active.length);
  filterCount.hidden = active.length === 0;
  activeFilterBar.innerHTML = '';
  activeFilterBar.hidden = active.length === 0;

  for (const { key, label } of active) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-chip';
    chip.dataset.filterKey = key;
    chip.textContent = `${label} ×`;
    activeFilterBar.appendChild(chip);
  }

  if (active.length > 0) {
    const count = document.createElement('span');
    count.className = 'filter-result-count';
    count.textContent = `Showing ${getVisibleItems().length} of ${allItems.length}`;
    activeFilterBar.appendChild(count);
  }
}

function saveMainViewPreferences() {
  window.printaViewApi.saveSettings({
    sortBy: sortButton.dataset.sortValue,
    filters
  });
}

function applyFilters() {
  filters = itemUtils.normalizeFilters(filters, defaultFileTypes);
  renderItems();
  updateFilterUI();

  const visibleItems = getVisibleItems();
  if (visibleItems.length === 0) {
    selectedItemId = null;
    clearDetailsPane();
  } else if (!visibleItems.some((item) => item.id === selectedItemId)) {
    selectCard(visibleItems[0]);
  }

  saveMainViewPreferences();
}

function updateDetailsPaneFromItem(item) {
  const detailPreview = document.getElementById('detail-preview');
  detailPreview.hidden = duplicateGroups === null;
  if (duplicateGroups !== null) {
    detailPreview.replaceChildren(buildPreview(item));
  }
  document.getElementById('detail-name').textContent = item.name;
  document.getElementById('detail-type').textContent =
    item.itemType === 'folder' ? 'Folder' : (item.extension || 'File').toUpperCase();
  document.getElementById('detail-size').textContent = formatSize(item.size);
  const dimensionsElement = document.getElementById('detail-dimensions');
  dimensionsElement.textContent = '—';
  document.getElementById('detail-modified').textContent = formatDate(item.createdTimeMs || item.modifiedTimeMs);
  document.getElementById('detail-path').textContent = item.path;

  if (item.previewType === 'image' || item.previewType === 'tiff' || item.previewType === 'psd') {
    window.printaViewApi.getImageDimensions(item.path).then((result) => {
      if (selectedItemId !== item.id) {
        return;
      }

      if (result.ok) {
        dimensionsElement.textContent = `${result.width} × ${result.height} pixels`;
      } else if (result.message !== 'Image dimensions are unavailable.') {
        console.warn(result.message);
      }
    }).catch((error) => {
      console.warn('Failed to read image dimensions:', error);
    });
  }
}

function clearDetailsPane() {
  const detailPreview = document.getElementById('detail-preview');
  detailPreview.hidden = duplicateGroups === null;
  detailPreview.replaceChildren();
  const emptyPreview = document.createElement('span');
  emptyPreview.className = 'detail-preview-empty';
  emptyPreview.textContent = duplicateGroups === null
    ? ''
    : 'Select a duplicate to preview it.';
  detailPreview.appendChild(emptyPreview);
  document.getElementById('detail-name').textContent = '-';
  document.getElementById('detail-type').textContent = '-';
  document.getElementById('detail-size').textContent = '-';
  document.getElementById('detail-dimensions').textContent = '-';
  document.getElementById('detail-modified').textContent = '-';
  document.getElementById('detail-path').textContent = '-';
}

function selectCard(item, focusCard = false) {
  const previousSelected = gridElement.querySelector('.card.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
    previousSelected.setAttribute('aria-pressed', 'false');
  }

  const newSelected = itemUtils.findCardByItemId(
    gridElement.querySelectorAll('.card'),
    item.id
  );
  if (newSelected) {
    newSelected.classList.add('selected');
    newSelected.setAttribute('aria-pressed', 'true');
    if (focusCard) {
      newSelected.focus({ preventScroll: true });
    }
  }

  selectedItemId = item.id;
  updateDetailsPaneFromItem(item);
}

async function setItemHidden(itemPath, hidden) {
  await window.printaViewApi.setHidden({ path: itemPath, hidden });

  allItems = allItems
    .map((item) => {
      if (item.path.toLowerCase() !== itemPath.toLowerCase()) {
        return item;
      }
      return { ...item, hiddenByApp: hidden };
    })
    .filter((item) => showHiddenFiles || !item.hiddenByApp);

  renderItems();

  const visibleItems = getVisibleItems();
  if (visibleItems.length === 0) {
    selectedItemId = null;
    clearDetailsPane();
    return;
  }

  const keepSelected = visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0];
  selectCard(keepSelected);
}

async function setItemFavorite(itemPath, favorite) {
  await window.printaViewApi.setFavorite({ path: itemPath, favorite });

  allItems = allItems.map((item) => {
    if (item.path.toLowerCase() !== itemPath.toLowerCase()) {
      return item;
    }
    return { ...item, favoritedByApp: favorite };
  });

  renderItems();

  const visibleItems = getVisibleItems();
  if (visibleItems.length === 0) {
    selectedItemId = null;
    clearDetailsPane();
    return;
  }

  const keepSelected = visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0];
  selectCard(keepSelected);
}

async function moveItemToRecycleBin(item) {
  try {
    const result = await window.printaViewApi.deleteItem({ path: item.path });
    if (!result.ok) throw new Error(result.message || 'The file could not be moved to the Recycle Bin.');

    imageCache.delete(item.path);
    pdfThumbnailCache.delete(getPdfCacheToken(item));
    allItems = allItems.filter((candidate) => candidate.id !== item.id);
    if (duplicateGroups !== null) {
      duplicateGroups = duplicateGroups
        .map((group) => ({
          ...group,
          files: group.files.filter((file) =>
            file.path.toLowerCase() !== item.path.toLowerCase())
        }))
        .filter((group) => group.files.length > 1);
    }
    if (selectedItemId === item.id) selectedItemId = null;
    renderItems();

    if (duplicateGroups !== null) {
      const nextFile = duplicateGroups[0]?.files[0];
      const nextItem = nextFile && getDuplicateItem(nextFile);
      if (nextItem) {
        const nextRow = [...gridElement.querySelectorAll('.duplicate-file')]
          .find((row) => row.dataset.itemId === nextItem.id);
        selectDuplicateFile(nextRow || null, nextItem);
      }
      else clearDetailsPane();
    } else {
      const visibleItems = getVisibleItems();
      if (visibleItems.length > 0) {
        selectCard(visibleItems[0]);
      } else {
        clearDetailsPane();
      }
    }
  } catch (error) {
    console.error('Failed to move file to Recycle Bin:', error);
    updateGridStatus(`Could not move ${item.name} to the Recycle Bin: ${error.message}`);
  }
}

async function revealItemByPath(itemPath, name) {
  try {
    const result = await window.printaViewApi.revealItem({ path: itemPath });
    if (!result.ok) throw new Error(result.message || 'The file could not be shown in its folder.');
  } catch (error) {
    console.error('Failed to show file in folder:', error);
    updateGridStatus(`Could not show ${name} in its folder: ${error.message}`);
  }
}

function getDuplicateItem(file) {
  return allItems.find((item) =>
    item.path.toLowerCase() === file.path.toLowerCase()) || {
    id: file.path.toLowerCase(),
    name: file.name,
    path: file.path,
    extension: file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '',
    itemType: 'file',
    previewType: 'generic',
    size: file.size || 0,
    createdTimeMs: file.modifiedTimeMs || 0,
    modifiedTimeMs: file.modifiedTimeMs || 0
  };
}

function selectDuplicateFile(row, item) {
  gridElement.querySelectorAll('.duplicate-file.selected')
    .forEach((selectedRow) => selectedRow.classList.remove('selected'));
  row?.classList.add('selected');
  selectedItemId = item.id;
  updateDetailsPaneFromItem(item);
}

function buildPreview(item) {
  const preview = document.createElement('div');
  preview.className = 'preview';

  if (item.previewType === 'image') {
    const image = document.createElement('img');
    image.loading = 'lazy';
    const cached = getCachedPreview(item.path);

    if (cached) {
      image.src = cached;
    } else {
      image.src = toFileUrl(item.path);
      image.onload = () => cachePreview(item.path, image.src);
    }

    image.alt = item.name;
    preview.appendChild(image);
    return preview;
  }

  if (item.previewType === 'tiff') {
    const image = document.createElement('img');
    image.loading = 'lazy';
    const cached = getCachedPreview(item.path);

    if (cached) {
      image.src = cached;
    } else {
      // Generate TIFF preview via main process
      window.printaViewApi.getTiffPreview(item.path)
        .then((result) => {
          if (result.ok) {
            image.src = result.dataUrl;
            cachePreview(item.path, result.dataUrl);
          }
        })
        .catch(() => {
          // Silent failure - image stays broken
        });
    }

    image.alt = item.name;
    preview.appendChild(image);
    return preview;
  }

  if (item.previewType === 'psd') {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = `${item.name} preview`;
    const cached = getCachedPreview(item.path);
    if (cached) {
      image.src = cached;
      preview.appendChild(image);
      return preview;
    }

    preview.appendChild(image);

    window.printaViewApi.getPsdPreview(item.path)
      .then((result) => {
        if (result.ok) {
          image.src = result.dataUrl;
          cachePreview(item.path, result.dataUrl);
          return;
        }

        image.remove();
        const fallback = document.createElement('div');
        fallback.className = 'generic';
        fallback.textContent = 'PSD';
        preview.appendChild(fallback);
      })
      .catch((error) => {
        console.warn(`Failed to generate PSD preview for ${item.name}:`, error);
        image.remove();
        const fallback = document.createElement('div');
        fallback.className = 'generic';
        fallback.textContent = 'PSD';
        preview.appendChild(fallback);
      });

    return preview;
  }

  if (item.previewType === 'pdf') {
    const pdfThumb = document.createElement('div');
    pdfThumb.className = 'pdf-thumb';

    const pdfImage = document.createElement('img');
    pdfImage.alt = `${item.name} thumbnail`;
    pdfImage.className = 'pdf-thumb-image';
    pdfThumb.appendChild(pdfImage);

    const pdfLabel = document.createElement('div');
    pdfLabel.className = 'pdf-label';
    pdfLabel.textContent = 'PDF';

    const pdfHint = document.createElement('div');
    pdfHint.className = 'pdf-hint';
    pdfHint.textContent = 'Double-click to open';

    const pdfPageCount = document.createElement('div');
    pdfPageCount.className = 'pdf-page-count';
    pdfPageCount.textContent = '...';

    pdfThumb.appendChild(pdfLabel);
    pdfThumb.appendChild(pdfHint);
    pdfThumb.appendChild(pdfPageCount);

    getPdfThumbnailData(item)
      .then((thumbnailData) => {
        pdfImage.src = thumbnailData.dataUrl;
        pdfThumb.classList.add('has-image');

        const pageCount = Number(thumbnailData.pageCount) || 0;
        pdfPageCount.textContent = pageCount === 1 ? '1 page' : `${pageCount} pages`;
      })
      .catch(() => {
        // Keep the fallback label/hint if thumbnail generation fails.
        pdfPageCount.textContent = 'PDF';
      });

    preview.appendChild(pdfThumb);
    return preview;
  }

  const text = document.createElement('div');
  text.className = item.itemType === 'folder' ? 'folder' : 'generic';
  text.textContent = item.itemType === 'folder'
    ? 'Folder'
    : (item.extension || 'FILE').replace('.', '').toUpperCase();

  preview.appendChild(text);
  return preview;
}

function getTypeGroupKey(item) {
  return (item.extension || '').toLowerCase() || 'unknown';
}

function getTypeGroupLabel(typeKey) {
  if (typeKey === 'unknown') {
    return 'UNKNOWN';
  }
  return typeKey.replace('.', '').toUpperCase();
}

function renderGroupedItems(items, groupType, getGroupKey, getGroupLabel) {
  const grouped = new Map();
  for (const item of items) {
    const key = getGroupKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  gridElement.classList.add(groupType === 'date' ? 'grouped-by-date' : 'grouped-by-type');

  for (const [key, groupItems] of grouped.entries()) {
    const collapseKey = `${groupType}:${key}`;
    const group = document.createElement('section');
    group.className = groupType === 'date' ? 'type-group date-group' : 'type-group';
    group.dataset[groupType === 'date' ? 'dateGroup' : 'type'] = key;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'type-group-header';
    header.setAttribute('aria-expanded', collapsedGroups.has(collapseKey) ? 'false' : 'true');

    const caret = document.createElement('span');
    caret.className = 'type-group-caret';
    caret.textContent = '▾';
    const title = document.createElement('span');
    title.className = 'type-group-title';
    title.textContent = getGroupLabel(key);
    const count = document.createElement('span');
    count.className = 'type-group-count';
    count.textContent = String(groupItems.length);
    header.append(caret, title, count);

    const body = document.createElement('div');
    body.className = 'type-group-body';
    for (const item of groupItems) {
      body.appendChild(buildCard(item));
    }

    if (collapsedGroups.has(collapseKey)) group.classList.add('collapsed');
    header.addEventListener('click', () => {
      const nextCollapsed = !group.classList.contains('collapsed');
      group.classList.toggle('collapsed', nextCollapsed);
      header.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');
      if (nextCollapsed) {
        collapsedGroups.add(collapseKey);
      } else {
        collapsedGroups.delete(collapseKey);
      }
    });

    group.append(header, body);
    gridElement.appendChild(group);
  }
}

function buildCard(item) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const previewContainer = card.querySelector('.preview');
  const title = card.querySelector('.title');

  card.setAttribute('data-item-id', item.id);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${item.name}, ${(item.extension || 'file').replace('.', '')}`);
  card.setAttribute('aria-pressed', item.id === selectedItemId ? 'true' : 'false');
  card.classList.toggle('selected', item.id === selectedItemId);
  previewContainer.replaceWith(buildPreview(item));
  title.textContent = item.name;

  if (item.hiddenByApp) {
    card.classList.add('hidden-card');
  }

  if (item.favoritedByApp) {
    card.classList.add('favorite-card');
    const favoriteBadge = document.createElement('div');
    favoriteBadge.className = 'favorite-badge';
    favoriteBadge.textContent = '★';
    favoriteBadge.title = 'Favourite';
    card.appendChild(favoriteBadge);
  }

  card.addEventListener('click', () => {
    selectCard(item, true);
  });

  card.addEventListener('dblclick', async () => {
    await openItemByPath(item.path, item.name);
  });

  const previewElement = card.querySelector('.preview');
  if (previewElement) {
    previewElement.addEventListener('dblclick', async (event) => {
      event.stopPropagation();
      await openItemByPath(item.path, item.name);
    });
  }

  card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    contextMenuTargetPath = item.path;
    contextMenuTargetHidden = item.hiddenByApp;
    contextMenuTargetFavorite = item.favoritedByApp;
    toggleFavoriteButton.textContent = item.favoritedByApp ? 'Unfavourite' : 'Favourite';
    toggleHideButton.textContent = item.hiddenByApp ? 'Unhide' : 'Hide';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.classList.remove('hidden');
  });

  const actions = buildFileActions(item);
  const cardShell = document.createElement('div');
  cardShell.className = 'card-shell';
  cardShell.append(card, actions);
  return cardShell;
}

function buildFileActions(item) {
  const actions = document.getElementById('card-actions-template').content.firstElementChild.cloneNode(true);
  actions.querySelector('.open-file-action').addEventListener('click', async (event) => {
    event.stopPropagation();
    await openItemByPath(item.path, item.name);
  });
  actions.querySelector('.show-folder-action').addEventListener('click', async (event) => {
    event.stopPropagation();
    await revealItemByPath(item.path, item.name);
  });
  actions.querySelector('.delete-file-action').addEventListener('click', async (event) => {
    event.stopPropagation();
    await moveItemToRecycleBin(item);
  });
  return actions;
}

function renderDuplicateGroups() {
  gridElement.innerHTML = '';
  gridElement.classList.remove('grouped-by-type');
  gridElement.classList.remove('grouped-by-date');
  gridElement.classList.add('grouped-by-duplicates');
  duplicateToolbar.hidden = false;
  duplicateWarning.hidden = duplicateSkippedFiles.length === 0;
  duplicateWarning.textContent = duplicateSkippedFiles.length > 0
    ? `Skipped ${duplicateSkippedFiles.length} unreadable file${duplicateSkippedFiles.length === 1 ? '' : 's'}; results may be incomplete.`
    : '';
  duplicateWarning.title = duplicateSkippedFiles
    .map((file) => `${file.name}: ${file.message}`)
    .join('\n');
  activeFilterBar.hidden = true;
  selectedItemId = null;
  clearDetailsPane();

  if (duplicateGroups.length === 0) {
    updateGridStatus('No exact duplicates found.');
    return;
  }

  updateGridStatus('');
  for (const groupData of duplicateGroups) {
    const group = duplicateGroupTemplate.content.firstElementChild.cloneNode(true);
    group.querySelector('.duplicate-heading').textContent =
      `${groupData.files.length} identical files · ${formatSize(groupData.size)}`;
    const files = group.querySelector('.duplicate-files');

    for (const file of groupData.files) {
      const item = getDuplicateItem(file);
      const row = document.createElement('div');
      row.className = 'duplicate-file';
      row.dataset.itemId = item.id;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Select ${file.name}`);
      row.appendChild(buildPreview(item));
      const details = document.createElement('div');
      details.className = 'duplicate-file-details';
      const name = document.createElement('strong');
      name.textContent = file.name;
      const filePath = document.createElement('span');
      filePath.textContent = file.path;
      details.append(name, filePath);

      row.appendChild(details);
      const actions = buildFileActions(item);
      actions.classList.add('duplicate-file-actions');
      row.appendChild(actions);
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        selectDuplicateFile(row, item);
      });
      row.addEventListener('keydown', (event) => {
        if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        selectDuplicateFile(row, item);
      });
      files.appendChild(row);
    }

    gridElement.appendChild(group);
  }
}

function renderItems() {
  if (isFindingDuplicates) return;

  if (duplicateGroups !== null) {
    renderDuplicateGroups();
    return;
  }

  gridElement.innerHTML = '';
  gridElement.classList.remove('grouped-by-duplicates');
  duplicateToolbar.hidden = true;
  document.getElementById('detail-preview').hidden = true;
  updateFilterUI();
  const sortBy = sortButton.dataset.sortValue;
  const sorted = itemUtils.sortItems(getVisibleItems(), sortBy);

  if (sorted.length === 0) {
    updateGridStatus(
      allItems.length === 0
        ? 'No files found in this folder.'
        : 'No files match the current view.'
    );
    gridElement.classList.remove('grouped-by-type');
    gridElement.classList.remove('grouped-by-date');
    return;
  }

  updateGridStatus('');

  if (sortBy === 'type') {
    gridElement.classList.remove('grouped-by-date');
    renderGroupedItems(sorted, 'type', getTypeGroupKey, getTypeGroupLabel);
    return;
  }

  if (sortBy === 'recent' || sortBy === 'oldest') {
    gridElement.classList.remove('grouped-by-type');
    renderGroupedItems(sorted, 'date', (item) => itemUtils.getDateGroup(item), (key) => key);
    return;
  }

  gridElement.classList.remove('grouped-by-type');
  gridElement.classList.remove('grouped-by-date');
  for (const item of sorted) {
    gridElement.appendChild(buildCard(item));
  }
}

async function loadItems() {
  const scanned = await window.printaViewApi.scanItems({
    downloadsPath,
    includeHidden: showHiddenFiles
  });

  allItems = itemUtils.filterDisplayableItems(scanned);

  renderItems();
}

async function applySettingsFromStore() {
  const settings = await window.printaViewApi.getSettings();
  showHiddenFiles = settings.showHidden === true;
  defaultFileTypes = itemUtils.normalizeFilters({
    types: settings.defaultFileTypes
  }).types;
  customExtensions = itemUtils.normalizeExtensions(settings.customExtensions);
  const allFileTypes = ['image', 'pdf', 'tiff', 'other'];
  const storedTypes = settings.filters?.types;
  const storedAllTypes = Array.isArray(storedTypes) &&
    storedTypes.length === allFileTypes.length &&
    allFileTypes.every((type) => storedTypes.includes(type));
  const storedFilters = storedAllTypes
    ? { ...settings.filters, types: ['image', 'pdf', 'tiff'] }
    : settings.filters;
  filters = itemUtils.normalizeFilters(storedFilters || {
    favorites: settings.favoritesFilter || 'all',
    types: defaultFileTypes
  }, defaultFileTypes);

  if (settings.sortBy) {
    setSortBy(settings.sortBy);
  }

  applyTheme(settings.theme || 'default');

  updateDetailsPaneVisibility(settings.showDetailsPane !== false);
  detailsPane.classList.toggle('pane-left', settings.panePosition === 'left');
  contentWrapper.classList.toggle('details-pane-left', settings.panePosition === 'left');
  updateDetailsPaneWidth(settings.detailsPaneWidth);
  updateFilterUI();
}

async function refreshFromSettings() {
  if (isFindingDuplicates || duplicateGroups !== null) return;
  duplicateGroups = null;
  if (gridElement.childElementCount === 0) {
    updateGridStatus('Loading your files…', true);
  } else {
    updateGridStatus('');
  }
  try {
    await applySettingsFromStore();
    if (isFindingDuplicates || duplicateGroups !== null) return;
    await loadItems();
    if (isFindingDuplicates || duplicateGroups !== null) return;

    const visibleItems = getVisibleItems();
    if (visibleItems.length > 0) {
      const keepSelected = visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0];
      selectCard(keepSelected);
    } else {
      selectedItemId = null;
      clearDetailsPane();
    }
  } catch (error) {
    console.error('Failed to load files:', error);
    updateGridStatus('Could not load files. Check the folder and try Refresh.');
    selectedItemId = null;
    clearDetailsPane();
  }
}

async function initialize() {
  downloadsPath = await window.printaViewApi.getDownloadsPath();
  downloadsPathElement.textContent = downloadsPath;

  await refreshFromSettings();
}

sortButton.addEventListener('click', (event) => {
  event.stopPropagation();
  filterPopover.hidden = true;
  filterButton.setAttribute('aria-expanded', 'false');
  sortPopover.hidden = !sortPopover.hidden;
  sortButton.setAttribute('aria-expanded', sortPopover.hidden ? 'false' : 'true');
  if (!sortPopover.hidden) {
    sortPopover.querySelector('[aria-checked="true"]')?.focus();
  }
});

sortPopover.addEventListener('click', (event) => {
  const option = event.target.closest('[data-sort-value]');
  if (!option) return;

  setSortBy(option.dataset.sortValue);
  sortPopover.hidden = true;
  sortButton.setAttribute('aria-expanded', 'false');
  renderItems();
  saveMainViewPreferences();
  sortButton.focus();
});

sortPopover.addEventListener('keydown', (event) => {
  const options = Array.from(sortPopover.querySelectorAll('[data-sort-value]'));
  const currentIndex = options.indexOf(document.activeElement);
  let nextIndex;

  if (event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % options.length;
  } else if (event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + options.length) % options.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = options.length - 1;
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    sortPopover.hidden = true;
    sortButton.setAttribute('aria-expanded', 'false');
    if (event.key === 'Escape') {
      event.preventDefault();
      sortButton.focus();
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  options[nextIndex].focus();
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    duplicateGroups = null;
    searchQuery = searchInput.value.trim();
    searchClear.hidden = searchQuery === '';
    renderItems();

    const visibleItems = getVisibleItems();
    if (visibleItems.length === 0) {
      selectedItemId = null;
      clearDetailsPane();
    } else if (!visibleItems.some((item) => item.id === selectedItemId)) {
      selectCard(visibleItems[0]);
    }
  });
}

if (searchClear) {
  searchClear.addEventListener('click', () => {
    duplicateGroups = null;
    searchInput.value = '';
    searchQuery = '';
    searchClear.hidden = true;
    searchInput.focus();
    renderItems();

    const visibleItems = getVisibleItems();
    if (visibleItems.length > 0 && !visibleItems.some((item) => item.id === selectedItemId)) {
      selectCard(visibleItems[0]);
    }
  });
}

filterButton.addEventListener('click', (event) => {
  event.stopPropagation();
  sortPopover.hidden = true;
  sortButton.setAttribute('aria-expanded', 'false');
  filterPopover.hidden = !filterPopover.hidden;
  filterButton.setAttribute('aria-expanded', filterPopover.hidden ? 'false' : 'true');
});

favoritesFilter.addEventListener('change', () => {
  filters.favorites = favoritesFilter.value;
  applyFilters();
});

modifiedFilter.addEventListener('change', () => {
  filters.modified = modifiedFilter.value;
  applyFilters();
});

sizeFilter.addEventListener('change', () => {
  filters.size = sizeFilter.value;
  applyFilters();
});

filterPopover.querySelectorAll('input[name="file-type"]').forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    filters.types = Array.from(filterPopover.querySelectorAll('input[name="file-type"]:checked'))
      .map((input) => input.value);
    applyFilters();
  });
});

activeFilterBar.addEventListener('click', (event) => {
  const key = event.target.closest('[data-filter-key]')?.dataset.filterKey;
  if (!key) return;
  if (key === 'favorites') filters.favorites = 'all';
  if (key === 'types') filters.types = [...defaultFileTypes];
  if (key === 'modified') filters.modified = 'any';
  if (key === 'size') filters.size = 'any';
  applyFilters();
});

document.getElementById('clear-filters-button').addEventListener('click', () => {
  filters = itemUtils.normalizeFilters({}, defaultFileTypes);
  applyFilters();
});

document.getElementById('find-duplicates-button').addEventListener('click', async () => {
  filterPopover.hidden = true;
  filterButton.setAttribute('aria-expanded', 'false');
  isFindingDuplicates = true;
  duplicateGroups = null;
  gridElement.innerHTML = '';
  gridElement.classList.remove('grouped-by-type');
  gridElement.classList.remove('grouped-by-date');
  gridElement.classList.remove('grouped-by-duplicates');
  updateGridStatus('Finding exact duplicates…', true);
  try {
    const result = await window.printaViewApi.findDuplicates({
      types: filters.types
    });
    duplicateGroups = result.groups;
    duplicateSkippedFiles = result.skippedFiles;
    isFindingDuplicates = false;
    renderDuplicateGroups();
  } catch (error) {
    console.error('Failed to find duplicate files:', error);
    isFindingDuplicates = false;
    duplicateGroups = null;
    duplicateSkippedFiles = [];
    duplicateToolbar.hidden = true;
    updateGridStatus(`Could not find duplicates: ${error.message}`);
  }
});

document.getElementById('duplicate-back-button').addEventListener('click', () => {
  duplicateGroups = null;
  gridElement.classList.remove('grouped-by-duplicates');
  renderItems();
  const visibleItems = getVisibleItems();
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId);
  if (selectedItem) {
    selectCard(selectedItem);
  } else if (visibleItems.length > 0) {
    selectCard(visibleItems[0]);
  } else {
    clearDetailsPane();
  }
});

sizeRange.addEventListener('input', () => {
  document.documentElement.style.setProperty('--preview-size', `${sizeRange.value}px`);
});

refreshButton.addEventListener('click', async () => {
  await refreshFromSettings();
});

toggleDetailsPaneButton.addEventListener('click', async () => {
  const isVisible = detailsPane.classList.contains('hidden');
  await setDetailsPaneVisibility(isVisible);
});

closeDetailsPaneButton.addEventListener('click', async () => {
  await setDetailsPaneVisibility(false);
  toggleDetailsPaneButton.focus();
});

detailsPaneResizer.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  detailsPaneResizer.setPointerCapture(event.pointerId);
  detailsPaneResizer.classList.add('is-resizing');
  detailsPaneResizer.dataset.startX = String(event.clientX);
  detailsPaneResizer.dataset.startWidth = detailsPaneResizer.getAttribute('aria-valuenow');
});

detailsPaneResizer.addEventListener('pointermove', (event) => {
  if (!detailsPaneResizer.hasPointerCapture(event.pointerId)) return;
  const startX = Number(detailsPaneResizer.dataset.startX);
  const startWidth = Number(detailsPaneResizer.dataset.startWidth);
  const direction = contentWrapper.classList.contains('details-pane-left') ? 1 : -1;
  updateDetailsPaneWidth(startWidth + (event.clientX - startX) * direction);
});

detailsPaneResizer.addEventListener('pointerup', async (event) => {
  if (!detailsPaneResizer.hasPointerCapture(event.pointerId)) return;
  detailsPaneResizer.releasePointerCapture(event.pointerId);
  detailsPaneResizer.classList.remove('is-resizing');
  await saveDetailsPaneWidth();
});

detailsPaneResizer.addEventListener('pointercancel', async () => {
  detailsPaneResizer.classList.remove('is-resizing');
  await saveDetailsPaneWidth();
});

detailsPaneResizer.addEventListener('keydown', async (event) => {
  const direction = contentWrapper.classList.contains('details-pane-left') ? 1 : -1;
  let width = Number(detailsPaneResizer.getAttribute('aria-valuenow'));
  if (event.key === 'ArrowLeft') {
    width -= 16 * direction;
  } else if (event.key === 'ArrowRight') {
    width += 16 * direction;
  } else if (event.key === 'Home') {
    width = MIN_DETAILS_PANE_WIDTH;
  } else if (event.key === 'End') {
    width = MAX_DETAILS_PANE_WIDTH;
  } else {
    return;
  }

  event.preventDefault();
  updateDetailsPaneWidth(width);
  await saveDetailsPaneWidth();
});

browseButton.addEventListener('click', async () => {
  const result = await window.printaViewApi.browseFolders();
  if (result.ok) {
    downloadsPath = result.path;
    downloadsPathElement.textContent = downloadsPath;
    searchQuery = '';
    if (searchInput) {
      searchInput.value = '';
      searchClear.hidden = true;
    }
    await refreshFromSettings();
  }
});

toggleHideButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await setItemHidden(contextMenuTargetPath, !contextMenuTargetHidden);
  hideContextMenu();
});

toggleFavoriteButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await setItemFavorite(contextMenuTargetPath, !contextMenuTargetFavorite);
  hideContextMenu();
});

openItemButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await window.printaViewApi.openItem({ path: contextMenuTargetPath });
  hideContextMenu();
});

revealItemButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await window.printaViewApi.revealItem({ path: contextMenuTargetPath });
  hideContextMenu();
});

if (viewMenuButton) {
  viewMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    window.printaViewApi.openSettings();
  });
}

document.addEventListener('click', (event) => {
  hideContextMenu();
  if (!filterControl.contains(event.target)) {
    filterPopover.hidden = true;
    filterButton.setAttribute('aria-expanded', 'false');
  }
  if (!sortControl.contains(event.target)) {
    sortPopover.hidden = true;
    sortButton.setAttribute('aria-expanded', 'false');
  }
});

function findDirectionalCard(currentCard, direction) {
  const cards = Array.from(gridElement.querySelectorAll('.card'));
  const currentRect = currentCard.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  let best = null;
  let bestScore = Infinity;

  for (const card of cards) {
    if (card === currentCard) continue;
    const rect = card.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - currentX;
    const dy = rect.top + rect.height / 2 - currentY;
    const primary = direction === 'left' ? -dx
      : direction === 'right' ? dx
        : direction === 'up' ? -dy : dy;
    if (primary <= 0) continue;
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2;
    if (score < bestScore) {
      best = card;
      bestScore = score;
    }
  }
  return best;
}

function isEditableTarget(target) {
  return target instanceof Element &&
    (target.matches('input, textarea, select, button, [contenteditable="true"]') ||
      target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
    filterPopover.hidden = true;
    filterButton.setAttribute('aria-expanded', 'false');
    return;
  }

  if (isEditableTarget(event.target)) return;
  const activeCard = document.activeElement?.closest?.('.card') ||
    itemUtils.findCardByItemId(gridElement.querySelectorAll('.card'), selectedItemId);
  if (!activeCard) return;

  const direction = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
  }[event.key];

  if (direction) {
    const cards = Array.from(gridElement.querySelectorAll('.card'));
    const directionalCard = findDirectionalCard(activeCard, direction);
    const currentIndex = cards.indexOf(activeCard);
    const movingForward = direction === 'right' || direction === 'down';
    const adjacentIndex = currentIndex + (movingForward ? 1 : -1);
    const nextCard = directionalCard || cards[adjacentIndex] || null;
    if (nextCard) {
      event.preventDefault();
      const item = allItems.find((candidate) => candidate.id === nextCard.dataset.itemId);
      if (item) {
        selectCard(item, true);
        nextCard.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  } else if (event.key === 'Enter') {
    const item = allItems.find((candidate) => candidate.id === activeCard.dataset.itemId);
    if (item) {
      event.preventDefault();
      openItemByPath(item.path, item.name);
    }
  }
});

window.printaViewApi.onSettingsUpdated(async () => {
  if (isFindingDuplicates || duplicateGroups !== null) return;
  await refreshFromSettings();
});

initialize();
