const os = require('os');
const path = require('path');
const fs = require('fs');
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

    const settingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const settingsWindow = await settingsWindowPromise;

    await expect(settingsWindow).toHaveTitle(/Settings - PrintaView/);
    await settingsWindow.close();
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
