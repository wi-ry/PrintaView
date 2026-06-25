const gridElement = document.getElementById('grid');
const downloadsPathElement = document.getElementById('downloads-path');
const sortSelect = document.getElementById('sort-select');
const sizeRange = document.getElementById('size-range');
const showHiddenToggle = document.getElementById('show-hidden');
const refreshButton = document.getElementById('refresh-button');
const browseButton = document.getElementById('browse-button');
const contextMenu = document.getElementById('context-menu');
const toggleHideButton = document.getElementById('toggle-hide-item');
const cardTemplate = document.getElementById('card-template');
const viewMenuButton = document.getElementById('view-menu-button');
const viewMenu = document.getElementById('view-menu');
const showDetailsPaneCheckbox = document.getElementById('show-details-pane');
const detailsPanePositionRadios = document.querySelectorAll('input[name="pane-pos"]');
const detailsPane = document.getElementById('details-pane');

let downloadsPath = '';
let allItems = [];
let contextMenuTargetPath = null;
let contextMenuTargetHidden = false;
let selectedItemId = null;

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

  if (item.previewType === 'image') {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.src = toFileUrl(item.path);
    image.alt = item.name;
    preview.appendChild(image);
    return preview;
  }

  if (item.previewType === 'pdf') {
    const object = document.createElement('object');
    object.data = `${toFileUrl(item.path)}#toolbar=0&navpanes=0`;
    object.type = 'application/pdf';
    preview.appendChild(object);
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
  const includeHidden = showHiddenToggle.checked;
  const scanned = await window.printaViewApi.scanItems({ downloadsPath, includeHidden });
  const blockedExts = new Set(['.mkv', '.rtf']);
  allItems = scanned.filter((item) => {
    if (item.itemType === 'folder') {
      return false;
    }
    if (blockedExts.has(item.extension)) {
      return false;
    }
    return true;
  });
  renderItems();
}

async function initialize() {
  downloadsPath = await window.printaViewApi.getDownloadsPath();
  downloadsPathElement.textContent = downloadsPath;
  await loadItems();
  if (allItems.length > 0) {
    selectCard(allItems[0]);
  }
}

sortSelect.addEventListener('change', renderItems);
sizeRange.addEventListener('input', () => {
  document.documentElement.style.setProperty('--preview-size', `${sizeRange.value}px`);
});
showHiddenToggle.addEventListener('change', loadItems);
refreshButton.addEventListener('click', loadItems);
browseButton.addEventListener('click', async () => {
  const result = await window.printaViewApi.browseFolders();
  if (result.ok) {
    downloadsPath = result.path;
    downloadsPathElement.textContent = downloadsPath;
    await loadItems();
  }
});

viewMenuButton.addEventListener('click', (e) => {
  e.stopPropagation();
  viewMenu.classList.toggle('hidden');
});

showDetailsPaneCheckbox.addEventListener('change', () => {
  if (showDetailsPaneCheckbox.checked) {
    detailsPane.classList.remove('hidden');
  } else {
    detailsPane.classList.add('hidden');
  }
});

detailsPanePositionRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.value === 'left') {
      detailsPane.classList.add('pane-left');
    } else {
      detailsPane.classList.remove('pane-left');
    }
  });
});

toggleHideButton.addEventListener('click', async () => {
  if (!contextMenuTargetPath) {
    return;
  }

  await setItemHidden(contextMenuTargetPath, !contextMenuTargetHidden);
  hideContextMenu();
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

initialize();
