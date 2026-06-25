const gridElement = document.getElementById('grid');
const downloadsPathElement = document.getElementById('downloads-path');
const sortSelect = document.getElementById('sort-select');
const sizeRange = document.getElementById('size-range');
const refreshButton = document.getElementById('refresh-button');
const browseButton = document.getElementById('browse-button');
const contextMenu = document.getElementById('context-menu');
const openItemButton = document.getElementById('open-item');
const toggleHideButton = document.getElementById('toggle-hide-item');
const cardTemplate = document.getElementById('card-template');
const viewMenu = document.getElementById('view-menu');
const viewMenuButton = document.getElementById('view-menu-button');
const openSettingsBtn = document.getElementById('open-settings-btn');
const detailsPane = document.getElementById('details-pane');

let downloadsPath = '';
let allItems = [];
let contextMenuTargetPath = null;
let contextMenuTargetHidden = false;
let selectedItemId = null;
let showHiddenFiles = false;
let currentPanePosition = 'right';

// Image caching and lazy loading
const imageCache = new Map();
const lazyLoadObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const preview = entry.target;
      loadPreviewContent(preview);
      lazyLoadObserver.unobserve(preview);
    }
  });
}, { rootMargin: '50px' });

function cachePreview(filePath, dataUrl) {
  imageCache.set(filePath, dataUrl);
}

function getCachedPreview(filePath) {
  return imageCache.get(filePath);
}

async function loadPreviewContent(previewElement) {
  if (previewElement.dataset.loaded === 'true') {
    return;
  }

  const itemId = previewElement.closest('.card')?.getAttribute('data-item-id');
  if (!itemId) return;

  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;

  if (item.previewType === 'image') {
    const cached = getCachedPreview(item.path);
    if (cached) {
      const img = previewElement.querySelector('img');
      if (img) img.src = cached;
      previewElement.dataset.loaded = 'true';
      return;
    }

    const img = previewElement.querySelector('img');
    if (img) {
      img.onload = () => {
        cachePreview(item.path, img.src);
        previewElement.dataset.loaded = 'true';
      };
    }
  } else {
    previewElement.dataset.loaded = 'true';
  }
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

function getSortedItems(items) {
  const sortBy = sortSelect.value;
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

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  contextMenuTargetPath = null;
  contextMenuTargetHidden = false;
}

function updateDetailsPaneFromItem(item) {
  document.getElementById('detail-name').textContent = item.name;
  document.getElementById('detail-type').textContent = item.itemType === 'folder' ? 'Folder' : (item.extension || 'File').toUpperCase();
  document.getElementById('detail-size').textContent = formatSize(item.size);
  document.getElementById('detail-modified').textContent = formatDate(item.createdTimeMs || item.modifiedTimeMs);
  document.getElementById('detail-path').textContent = item.path;
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

async function setItemHidden(path, hidden) {
  await window.printaViewApi.setHidden({ path, hidden });
  await loadItems();
}

function buildPreview(item) {
  const preview = document.createElement('div');
  preview.className = 'preview';
  preview.dataset.loaded = 'false';

  if (item.previewType === 'image') {
    const image = document.createElement('img');
    image.loading = 'lazy';
    // Start with a cached version if available
    const cached = getCachedPreview(item.path);
    if (cached) {
      image.src = cached;
      preview.dataset.loaded = 'true';
    } else {
      image.src = toFileUrl(item.path);
    }
    image.alt = item.name;
    preview.appendChild(image);
    return preview;
  }

  if (item.previewType === 'pdf') {
    const object = document.createElement('object');
    object.data = `${toFileUrl(item.path)}#toolbar=0&navpanes=0`;
    object.type = 'application/pdf';
    preview.appendChild(object);
    preview.dataset.loaded = 'true';
    return preview;
  }

  const text = document.createElement('div');
  if (item.itemType === 'folder') {
    text.className = 'folder';
    text.textContent = 'Folder';
  } else {
    text.className = 'generic';
    text.textContent = (item.extension || 'FILE').replace('.', '').toUpperCase();
  }

  preview.appendChild(text);
  preview.dataset.loaded = 'true';
  return preview;
}

function renderItems() {
  gridElement.innerHTML = '';
  const sorted = getSortedItems(allItems);

  for (const item of sorted) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const previewContainer = card.querySelector('.preview');
    const title = card.querySelector('.title');

    card.setAttribute('data-item-id', item.id);
    previewContainer.replaceWith(buildPreview(item));

    title.textContent = item.name;

    if (item.hiddenByApp) {
      card.classList.add('hidden-card');
    }

    card.addEventListener('click', () => {
      selectCard(item);
    });

    card.addEventListener('dblclick', async () => {
      await window.printaViewApi.openItem({ path: item.path });
    });

    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      contextMenuTargetPath = item.path;
      contextMenuTargetHidden = item.hiddenByApp;
      toggleHideButton.textContent = item.hiddenByApp ? 'Unhide' : 'Hide';
      contextMenu.style.left = `${event.clientX}px`;
      contextMenu.style.top = `${event.clientY}px`;
      contextMenu.classList.remove('hidden');
    });

    gridElement.appendChild(card);
  }
}

async function loadItems() {
  const scanned = await window.printaViewApi.scanItems({ downloadsPath, includeHidden: showHiddenFiles });
  
  // Supported image and document types
  const supportedExts = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.ico',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'
  ]);
  
  allItems = scanned.filter((item) => {
    if (item.itemType === 'folder') {
      return false;
    }
    const ext = item.extension.toLowerCase();
    return supportedExts.has(ext);
  });
  
  renderItems();
}

async function initialize() {
  downloadsPath = await window.printaViewApi.getDownloadsPath();
  downloadsPathElement.textContent = downloadsPath;
  
  const settings = await window.printaViewApi.getSettings();
  showHiddenFiles = settings.showHidden;
  currentPanePosition = settings.panePosition;
  
  if (!settings.showDetailsPane) {
    detailsPane.classList.add('hidden');
  }
  
  if (currentPanePosition === 'left') {
    detailsPane.classList.add('pane-left');
  }
  
  await loadItems();
  if (allItems.length > 0) {
    selectCard(allItems[0]);
  }
}

// Settings moved to Settings window

initialize();
sizeRange.addEventListener('input', () => {
  document.documentElement.style.setProperty('--preview-size', `${sizeRange.value}px`);
});
refreshButton.addEventListener('click', loadItems);
browseButton.addEventListener('click', async () => {
  const result = await window.printaViewApi.browseFolders();
  if (result.ok) {
    downloadsPath = result.path;
    downloadsPathElement.textContent = downloadsPath;
    await loadItems();
  }
});

// Show View menu on right-click in toolbar area
document.querySelector('.toolbar').addEventListener('contextmenu', (event) => {
  event.preventDefault();
  viewMenu.style.left = `${event.clientX}px`;
  viewMenu.style.top = `${event.clientY}px`;
  viewMenu.classList.remove('hidden');
});

openSettingsBtn.addEventListener('click', () => {
  window.printaViewApi.openSettings();
});

// Settings moved to Settings window - old handlers removed

toggleHideButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await setItemHidden(contextMenuTargetPath, !contextMenuTargetHidden);
  hideContextMenu();
});

openItemButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await window.printaViewApi.openItem({ path: contextMenuTargetPath });
  hideContextMenu();
});

// Show View menu on button click
viewMenuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const rect = viewMenuButton.getBoundingClientRect();
  // Open to the left of the button
  viewMenu.style.left = `${rect.left - viewMenu.offsetWidth}px`;
  viewMenu.style.top = `${rect.bottom + 4}px`;
  viewMenu.classList.remove('hidden');
});

document.addEventListener('click', () => {
  hideContextMenu();
  viewMenu.classList.add('hidden');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideContextMenu();
    viewMenu.classList.add('hidden');
  }
});

async function initialize() {
  downloadsPath = await window.printaViewApi.getDownloadsPath();
  downloadsPathElement.textContent = downloadsPath;
  
  const settings = await window.printaViewApi.getSettings();
  showHiddenFiles = settings.showHidden;
  currentPanePosition = settings.panePosition;
  
  if (!settings.showDetailsPane) {
    detailsPane.classList.add('hidden');
  }
  
  if (currentPanePosition === 'left') {
    detailsPane.classList.add('pane-left');
  }
  
  await loadItems();
  if (allItems.length > 0) {
    selectCard(allItems[0]);
  }
}

// Settings moved to Settings window

initialize();
