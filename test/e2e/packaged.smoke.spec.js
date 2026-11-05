const os = require('os');
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

test('packaged app launches and scans the configured folder', async () => {
  const executablePath = process.env.PRINTAVIEW_EXECUTABLE;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error('Set PRINTAVIEW_EXECUTABLE to the built portable application path.');
  }

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-packaged-'));
  const dataRoot = path.join(testRoot, 'data');
  const fixtureRoot = path.join(testRoot, 'downloads');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, 'packaged-smoke.pdf'), '%PDF-1.4\n% smoke fixture\n');
  fs.writeFileSync(path.join(dataRoot, 'printaview-settings.json'), JSON.stringify({
    customRootFolder: fixtureRoot,
    showDetailsPane: true,
    showHidden: false,
    panePosition: 'right'
  }));

  let electronApp;
  try {
    electronApp = await electron.launch({
      executablePath,
      args: process.env.PRINTAVIEW_TEST_HEADED === '1' ? [] : ['--headless'],
      env: {
        ...process.env,
        PRINTAVIEW_DATA_DIR: dataRoot
      },
      timeout: 60000
    });

    const mainWindow = await electronApp.firstWindow();
    await expect(mainWindow.locator('.brand')).toHaveText('PrintaView');
    await expect(mainWindow.locator('#downloads-path')).toHaveText(fixtureRoot);
    await expect(mainWindow.locator('#grid .title')).toHaveText(['packaged-smoke.pdf']);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
