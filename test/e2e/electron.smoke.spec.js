const os = require('os');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

function setupFixtureRoot(fixtureRoot) {
  fs.mkdirSync(fixtureRoot, { recursive: true });

  const pdfPath = path.join(fixtureRoot, 'sample.pdf');
  const docxPath = path.join(fixtureRoot, 'sample.docx');

  if (!fs.existsSync(pdfPath)) {
    fs.writeFileSync(pdfPath, '%PDF-1.4\n% smoke fixture\n', 'utf8');
  }

  if (!fs.existsSync(docxPath)) {
    fs.writeFileSync(docxPath, 'smoke fixture', 'utf8');
  }

  return fixtureRoot;
}

function setupAppSettings(dataRoot, customRootFolder) {
  const userDataDir = dataRoot;
  const settings = {
    customRootFolder,
    showDetailsPane: true,
    showHidden: false,
    panePosition: 'right'
  };

  fs.mkdirSync(userDataDir, { recursive: true });

  const settingsPath = path.join(userDataDir, 'printaview-settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  const hiddenStorePath = path.join(userDataDir, 'hidden-items.json');
  if (fs.existsSync(hiddenStorePath)) {
    fs.unlinkSync(hiddenStorePath);
  }
}

async function launchIsolatedApp(customRootFolder) {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-e2e-'));
  const dataRoot = path.join(testRoot, 'printaview-data');
  fs.mkdirSync(dataRoot, { recursive: true });

  setupAppSettings(dataRoot, customRootFolder);

  const electronApp = await electron.launch({
    executablePath: require('electron'),
    args: ['.'],
    env: {
      ...process.env,
      PRINTAVIEW_DATA_DIR: dataRoot
    }
  });

  const cleanup = async () => {
    await electronApp.close();
    fs.rmSync(testRoot, { recursive: true, force: true });
  };

  return { electronApp, cleanup };
}

test('main window loads and settings window opens', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    await expect(mainWindow.locator('.brand')).toHaveText('PrintaView');
    await expect(mainWindow.locator('#downloads-path')).toHaveText(fixtureRoot);
    await expect(mainWindow.locator('#grid .card').first()).toBeVisible();
    await expect(mainWindow.locator('#refresh-button img')).toHaveJSProperty('naturalWidth', 64);
    await expect(mainWindow.locator('#view-menu-button img')).toHaveJSProperty('naturalWidth', 64);

    const settingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const settingsWindow = await settingsWindowPromise;

    await expect(settingsWindow).toHaveTitle(/Settings - PrintaView/);
    await expect(settingsWindow.getByRole('tab', { name: 'Display' })).toHaveAttribute('aria-selected', 'true');
    await expect(settingsWindow.locator('#display-panel')).toBeVisible();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeHidden();
    await settingsWindow.getByRole('tab', { name: 'Hidden Files' }).click();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeVisible();
    await expect(settingsWindow.locator('#display-panel')).toBeHidden();
    await expect(settingsWindow.locator('#show-hidden')).toBeVisible();
    await settingsWindow.getByRole('tab', { name: 'Display' }).click();
    await expect(settingsWindow.locator('#display-panel')).toBeVisible();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeHidden();
    await settingsWindow.close();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('file details show raster image dimensions', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  await sharp({
    create: {
      width: 48,
      height: 32,
      channels: 4,
      background: '#ff0000'
    }
  }).png().toFile(path.join(fixtureRoot, 'dimensions.png'));
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const imageCard = mainWindow.locator('#grid .card').filter({
      has: mainWindow.locator('.title', { hasText: /^dimensions\.png$/ })
    });

    await imageCard.click();
    await expect(mainWindow.locator('#detail-dimensions')).toHaveText('48 × 32 pixels');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('hide action hides selected card from the default view', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    await expect(mainWindow.locator('#downloads-path')).toHaveText(fixtureRoot);
    const cards = mainWindow.locator('#grid .card');
    await expect(cards.first()).toBeVisible();
    const beforeCount = await cards.count();
    expect(beforeCount).toBeGreaterThan(0);

    const firstCard = cards.first();
    await firstCard.click({ button: 'right' });
    await expect(mainWindow.locator('#context-menu')).toBeVisible();

    await mainWindow.locator('#toggle-hide-item').click();
    await expect(cards).toHaveCount(beforeCount - 1);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('favorite action filters the grid and can be cleared', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'second.pdf'), '%PDF-1.4\n% second fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(2);

    await mainWindow.locator('#grid .card').filter({
      has: mainWindow.locator('.title', { hasText: /^sample\.pdf$/ })
    }).click({ button: 'right' });
    await mainWindow.locator('#toggle-favorite-item').click();
    await expect(mainWindow.locator('#grid .card.favorite-card')).toHaveCount(1);

    await mainWindow.locator('#favorites-only-button').click();
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['sample.pdf']);

    await mainWindow.locator('#favorites-all-button').click();
    await expect(cards).toHaveCount(2);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('search filters cards and the clear button restores them', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'alpha.pdf'), '%PDF-1.4\n% alpha fixture\n', 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'beta.pdf'), '%PDF-1.4\n% beta fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(3);

    await mainWindow.locator('#search-input').fill('alpha');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['alpha.pdf']);
    await expect(mainWindow.locator('#search-clear')).toBeVisible();

    await mainWindow.locator('#search-clear').click();
    await expect(cards).toHaveCount(3);
    await expect(mainWindow.locator('#search-input')).toHaveValue('');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('name sort orders cards alphabetically', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'zeta.pdf'), '%PDF-1.4\n% zeta fixture\n', 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'alpha.pdf'), '%PDF-1.4\n% alpha fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(3);

    await mainWindow.locator('#sort-select').selectOption('name');
    await expect(cards.locator('.title')).toHaveText(['alpha.pdf', 'sample.pdf', 'zeta.pdf']);

    await expect(mainWindow.locator('#sort-select option[value="recent"]')).toHaveText('Newest');
    await expect(mainWindow.locator('#sort-select option[value="oldest"]')).toHaveText('Oldest');
    await mainWindow.locator('#sort-select').selectOption('oldest');
    await expect(mainWindow.locator('#sort-select')).toHaveValue('oldest');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
