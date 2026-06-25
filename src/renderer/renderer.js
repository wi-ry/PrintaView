import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../node_modules/pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const gridElement = document.getElementById('grid');
const downloadsPathElement = document.getElementById('downloads-path');
const sortSelect = document.getElementById('sort-select');
const sizeRange = document.getElementById('size-range');
const favoritesAllButton = document.getElementById('favorites-all-button');
const favoritesOnlyButton = document.getElementById('favorites-only-button');
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
const itemUtils = window.PrintaViewItemUtils;

let downloadsPath = '';
let allItems = [];
let contextMenuTargetPath = null;
let contextMenuTargetHidden = false;
let contextMenuTargetFavorite = false;
let selectedItemId = null;
let showHiddenFiles = false;
let showOnlyFavorites = false;
const collapsedTypeGroups = new Set();

const imageCache = new Map();
const pdfThumbnailCache = new Map();
const pdfThumbnailInFlight = new Map();

function cachePreview(filePath, dataUrl) {
  imageCache.set(filePath, dataUrl);
}

function getCachedPreview(filePath) {
  return imageCache.get(filePath);
}

async function getPdfThumbnailData(filePath) {
  const cached = pdfThumbnailCache.get(filePath);
  if (cached) {
    return cached;
  }

  const inFlight = pdfThumbnailInFlight.get(filePath);
  if (inFlight) {
    return inFlight;
  }

  const generationTask = (async () => {
    const loadingTask = pdfjsLib.getDocument({ url: toFileUrl(filePath) });
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
      pdfThumbnailCache.set(filePath, thumbnailData);
      return thumbnailData;
    } finally {
      pdf.cleanup();
      loadingTask.destroy();
    }
  })()
    .finally(() => {
      pdfThumbnailInFlight.delete(filePath);
    });

  pdfThumbnailInFlight.set(filePath, generationTask);
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
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${encodeURI(normalized)}`;
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTargetPath = null;
  contextMenuTargetHidden = false;
  contextMenuTargetFavorite = false;
}

function getVisibleItems() {
  if (!showOnlyFavorites) {
    return allItems;
  }
  return allItems.filter((item) => item.favoritedByApp);
}

function updateFavoritesToggleUI() {
  if (!favoritesAllButton || !favoritesOnlyButton) {
    return;
  }

  const allActive = !showOnlyFavorites;
  favoritesAllButton.classList.toggle('active', allActive);
  favoritesOnlyButton.classList.toggle('active', !allActive);
  favoritesAllButton.setAttribute('aria-pressed', allActive ? 'true' : 'false');
  favoritesOnlyButton.setAttribute('aria-pressed', allActive ? 'false' : 'true');
}

function saveMainViewPreferences() {
  window.printaViewApi.saveSettings({
    sortBy: sortSelect.value,
    favoritesFilter: showOnlyFavorites ? 'favorites' : 'all'
  });
}

function updateDetailsPaneFromItem(item) {
  document.getElementById('detail-name').textContent = item.name;
  document.getElementById('detail-type').textContent =
    item.itemType === 'folder' ? 'Folder' : (item.extension || 'File').toUpperCase();
  document.getElementById('detail-size').textContent = formatSize(item.size);
  document.getElementById('detail-modified').textContent = formatDate(item.createdTimeMs || item.modifiedTimeMs);
  document.getElementById('detail-path').textContent = item.path;
}

function clearDetailsPane() {
  document.getElementById('detail-name').textContent = '-';
  document.getElementById('detail-type').textContent = '-';
  document.getElementById('detail-size').textContent = '-';
  document.getElementById('detail-modified').textContent = '-';
  document.getElementById('detail-path').textContent = '-';
}

function selectCard(item) {
  const previousSelected = gridElement.querySelector('.card.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
  }

  const newSelected = gridElement.querySelector(`[data-item-id="${item.id}"]`);
  if (newSelected) {
    newSelected.classList.add('selected');
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

    getPdfThumbnailData(item.path)
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

function buildCard(item) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const previewContainer = card.querySelector('.preview');
  const title = card.querySelector('.title');

  card.setAttribute('data-item-id', item.id);
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
    favoriteBadge.title = 'Favorite';
    card.appendChild(favoriteBadge);
  }

  card.addEventListener('click', () => {
    selectCard(item);
  });

  card.addEventListener('dblclick', async () => {
    await window.printaViewApi.openItem({ path: item.path });
  });

  const previewElement = card.querySelector('.preview');
  if (previewElement) {
    previewElement.addEventListener('dblclick', async (event) => {
      event.stopPropagation();
      await window.printaViewApi.openItem({ path: item.path });
    });
  }

  card.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    contextMenuTargetPath = item.path;
    contextMenuTargetHidden = item.hiddenByApp;
    contextMenuTargetFavorite = item.favoritedByApp;
    toggleFavoriteButton.textContent = item.favoritedByApp ? 'Unfavorite' : 'Favorite';
    toggleHideButton.textContent = item.hiddenByApp ? 'Unhide' : 'Hide';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.classList.remove('hidden');
  });

  return card;
}

function renderItems() {
  gridElement.innerHTML = '';
  updateFavoritesToggleUI();
  const sortBy = sortSelect.value;
  const sorted = itemUtils.sortItems(getVisibleItems(), sortBy);

  if (sortBy !== 'type') {
    gridElement.classList.remove('grouped-by-type');
    for (const item of sorted) {
      gridElement.appendChild(buildCard(item));
    }
    return;
  }

  gridElement.classList.add('grouped-by-type');
  const grouped = new Map();

  for (const item of sorted) {
    const typeKey = getTypeGroupKey(item);
    if (!grouped.has(typeKey)) {
      grouped.set(typeKey, []);
    }
    grouped.get(typeKey).push(item);
  }

  for (const [typeKey, items] of grouped.entries()) {
    const group = document.createElement('section');
    group.className = 'type-group';
    group.dataset.type = typeKey;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'type-group-header';
    header.setAttribute('aria-expanded', collapsedTypeGroups.has(typeKey) ? 'false' : 'true');
    header.innerHTML = `<span class="type-group-caret">▾</span><span class="type-group-title">${getTypeGroupLabel(typeKey)}</span><span class="type-group-count">${items.length}</span>`;

    const body = document.createElement('div');
    body.className = 'type-group-body';

    for (const item of items) {
      body.appendChild(buildCard(item));
    }

    if (collapsedTypeGroups.has(typeKey)) {
      group.classList.add('collapsed');
    }

    header.addEventListener('click', () => {
      const nextCollapsed = !group.classList.contains('collapsed');
      group.classList.toggle('collapsed', nextCollapsed);
      header.setAttribute('aria-expanded', nextCollapsed ? 'false' : 'true');

      if (nextCollapsed) {
        collapsedTypeGroups.add(typeKey);
      } else {
        collapsedTypeGroups.delete(typeKey);
      }
    });

    group.appendChild(header);
    group.appendChild(body);
    gridElement.appendChild(group);
  }
}

async function loadItems() {
  const scanned = await window.printaViewApi.scanItems({
    downloadsPath,
    includeHidden: showHiddenFiles
  });

  allItems = itemUtils.filterSupportedItems(scanned);

  renderItems();
}

async function applySettingsFromStore() {
  const settings = await window.printaViewApi.getSettings();
  showHiddenFiles = settings.showHidden === true;
  showOnlyFavorites = settings.favoritesFilter === 'favorites';

  if (settings.sortBy) {
    sortSelect.value = settings.sortBy;
  }

  detailsPane.classList.toggle('hidden', settings.showDetailsPane === false);
  detailsPane.classList.toggle('pane-left', settings.panePosition === 'left');
  updateFavoritesToggleUI();
}

async function refreshFromSettings() {
  await applySettingsFromStore();
  await loadItems();

  const visibleItems = getVisibleItems();
  if (visibleItems.length > 0) {
    const keepSelected = visibleItems.find((item) => item.id === selectedItemId) || visibleItems[0];
    selectCard(keepSelected);
  } else {
    selectedItemId = null;
    clearDetailsPane();
  }
}

async function initialize() {
  downloadsPath = await window.printaViewApi.getDownloadsPath();
  downloadsPathElement.textContent = downloadsPath;

  await refreshFromSettings();
}

sortSelect.addEventListener('change', () => {
  renderItems();
  saveMainViewPreferences();
});

function applyFavoritesFilterSelection(onlyFavorites) {
  showOnlyFavorites = onlyFavorites;
  renderItems();

  const visibleItems = getVisibleItems();
  if (visibleItems.length === 0) {
    selectedItemId = null;
    clearDetailsPane();
  } else if (!visibleItems.some((item) => item.id === selectedItemId)) {
    selectCard(visibleItems[0]);
  }

  saveMainViewPreferences();
}

if (favoritesAllButton) {
  favoritesAllButton.addEventListener('click', () => {
    applyFavoritesFilterSelection(false);
  });
}

if (favoritesOnlyButton) {
  favoritesOnlyButton.addEventListener('click', () => {
    applyFavoritesFilterSelection(true);
  });
}

sizeRange.addEventListener('input', () => {
  document.documentElement.style.setProperty('--preview-size', `${sizeRange.value}px`);
});

refreshButton.addEventListener('click', async () => {
  await refreshFromSettings();
});

browseButton.addEventListener('click', async () => {
  const result = await window.printaViewApi.browseFolders();
  if (result.ok) {
    downloadsPath = result.path;
    downloadsPathElement.textContent = downloadsPath;
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

document.addEventListener('click', () => {
  hideContextMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
  }
});

window.addEventListener('focus', async () => {
  await refreshFromSettings();
});

initialize();
