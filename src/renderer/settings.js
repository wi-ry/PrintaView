const showDetailsPaneCheckbox = document.getElementById('show-details-pane');
const showHiddenToggle = document.getElementById('show-hidden');
const paneLeftBtn = document.getElementById('pane-left-btn');
const paneRightBtn = document.getElementById('pane-right-btn');
const hiddenItemsList = document.getElementById('hidden-items-list');
const clearAllHiddenBtn = document.getElementById('clear-all-hidden');

let currentPanePosition = 'right';

// Sync with main window
async function syncSettings() {
  const settings = await window.printaViewApi.getSettings();
  
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

showDetailsPaneCheckbox.addEventListener('change', async () => {
  await window.printaViewApi.saveSettings({
    showDetailsPane: showDetailsPaneCheckbox.checked,
    showHidden: showHiddenToggle.checked,
    panePosition: currentPanePosition
  });
});

showHiddenToggle.addEventListener('change', async () => {
  await window.printaViewApi.saveSettings({
    showDetailsPane: showDetailsPaneCheckbox.checked,
    showHidden: showHiddenToggle.checked,
    panePosition: currentPanePosition
  });
});

paneLeftBtn.addEventListener('click', async () => {
  currentPanePosition = 'left';
  updatePanePositionUI();
  await window.printaViewApi.saveSettings({
    showDetailsPane: showDetailsPaneCheckbox.checked,
    showHidden: showHiddenToggle.checked,
    panePosition: currentPanePosition
  });
});

paneRightBtn.addEventListener('click', async () => {
  currentPanePosition = 'right';
  updatePanePositionUI();
  await window.printaViewApi.saveSettings({
    showDetailsPane: showDetailsPaneCheckbox.checked,
    showHidden: showHiddenToggle.checked,
    panePosition: currentPanePosition
  });
});

clearAllHiddenBtn.addEventListener('click', async () => {
  if (confirm('Clear all hidden items?')) {
    await window.printaViewApi.clearAllHidden();
    await updateHiddenItemsList();
  }
});

syncSettings();
