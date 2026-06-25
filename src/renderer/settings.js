const showDetailsPaneCheckbox = document.getElementById('show-details-pane');
const showHiddenToggle = document.getElementById('show-hidden');
const paneLeftBtn = document.getElementById('pane-left-btn');
const paneRightBtn = document.getElementById('pane-right-btn');
const hiddenItemsList = document.getElementById('hidden-items-list');
const clearAllHiddenBtn = document.getElementById('clear-all-hidden');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

let currentPanePosition = 'right';
let pendingClearedHiddenItems = false;
let originalSettings = {};

// Track pending changes (not saved yet)
let pendingSettings = {
  showDetailsPane: true,
  showHidden: false,
  panePosition: 'right'
};

// Sync with main window
async function syncSettings() {
  const settings = await window.printaViewApi.getSettings();
  
  originalSettings = { ...settings };
  pendingSettings = { ...settings };
  
  showDetailsPaneCheckbox.checked = settings.showDetailsPane;
  showHiddenToggle.checked = settings.showHidden;
  currentPanePosition = settings.panePosition;
  
  updatePanePositionUI();
  await updateHiddenItemsList();
}

function updatePanePositionUI() {
  if (currentPanePosition === 'left') {
    paneLeftBtn.classList.add('active');
    paneRightBtn.classList.remove('active');
  } else {
    paneRightBtn.classList.add('active');
    paneLeftBtn.classList.remove('active');
  }
}

async function updateHiddenItemsList() {
  const items = await window.printaViewApi.getHiddenItems();
  
  if (items.length === 0) {
    hiddenItemsList.innerHTML = '<div class="hidden-none">No hidden items</div>';
    return;
  }

  hiddenItemsList.innerHTML = items.map((item) => {
    return `<div class="hidden-item">
      <span title="${item.path}">${item.name}</span>
      <button class="unhide-btn" data-path="${item.path}">×</button>
    </div>`;
  }).join('');

  document.querySelectorAll('.unhide-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const path = btn.dataset.path;
      await window.printaViewApi.setHidden({ path, hidden: false });
      await updateHiddenItemsList();
    });
  });
}

// Track changes without saving immediately
showDetailsPaneCheckbox.addEventListener('change', () => {
  pendingSettings.showDetailsPane = showDetailsPaneCheckbox.checked;
});

showHiddenToggle.addEventListener('change', () => {
  pendingSettings.showHidden = showHiddenToggle.checked;
});

paneLeftBtn.addEventListener('click', () => {
  currentPanePosition = 'left';
  pendingSettings.panePosition = 'left';
  updatePanePositionUI();
});

paneRightBtn.addEventListener('click', () => {
  currentPanePosition = 'right';
  pendingSettings.panePosition = 'right';
  updatePanePositionUI();
});

clearAllHiddenBtn.addEventListener('click', async () => {
  if (confirm('Clear all hidden items?')) {
    await window.printaViewApi.clearAllHidden();
    pendingClearedHiddenItems = true;
    await updateHiddenItemsList();
  }
});

// Save changes
saveBtn.addEventListener('click', async () => {
  await window.printaViewApi.saveSettings(pendingSettings);
  window.close();
});

// Cancel changes
cancelBtn.addEventListener('click', () => {
  window.close();
});

syncSettings();

