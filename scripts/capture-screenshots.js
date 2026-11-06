const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

const imagesDirectory = path.join(__dirname, '..', 'images');
const screenshotFiles = [
  ['app-without-details.png', 'app1.png'],
  ['app-with-details.png', 'app2.png'],
  ['right-click-menu.png', 'right-click.png'],
  ['settings-appearance.png', 'settings1.png'],
  ['settings-file-types.png', 'settings2.png'],
  ['settings-hidden-files.png', 'settings3.png'],
  ['settings-about.png', 'settings4.png']
];

function getDemoFolder() {
  const configuredFolder = process.argv[2] || process.env.PRINTAVIEW_SCREENSHOT_FOLDER;
  if (configuredFolder) return path.resolve(configuredFolder);
  return path.join(imagesDirectory, 'staging');
}

async function waitForItems(window) {
  await window.locator('#downloads-path').waitFor({ state: 'visible' });
  await window.waitForFunction(() => {
    const loadingState = document.querySelector('#loading-state');
    return document.querySelectorAll('#grid .card').length > 0 &&
      loadingState?.hidden === true;
  });
}

async function waitForScreenshotReady(window) {
  await window.waitForFunction(() => {
    const cards = Array.from(document.querySelectorAll('#grid .card')).filter((card) => {
      const bounds = card.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 &&
        bounds.bottom > 0 && bounds.right > 0 &&
        bounds.top < window.innerHeight && bounds.left < window.innerWidth;
    });
    const images = Array.from(document.querySelectorAll('#grid .preview img, #detail-preview img'))
      .filter((image) => {
        const bounds = image.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.bottom > 0 && bounds.right > 0 &&
          bounds.top < window.innerHeight && bounds.left < window.innerWidth;
      });

    const activeAnimations = document.getAnimations()
      .some((animation) => animation.playState === 'running');

    return cards.length > 0 &&
      cards.every((card) => Number(getComputedStyle(card).opacity) >= 0.999) &&
      images.length > 0 &&
      images.every((image) =>
        image.complete &&
        image.naturalWidth > 0 &&
        Number(getComputedStyle(image).opacity) >= 0.999
      ) &&
      !activeAnimations;
  }, null, { timeout: 60000, polling: 100 });

  await window.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('#grid .preview img, #detail-preview img'))
      .filter((image) => {
        const bounds = image.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.bottom > 0 && bounds.right > 0 &&
          bounds.top < window.innerHeight && bounds.left < window.innerWidth;
      });
    await Promise.all(images.map((image) => image.decode()));
  });
  await window.waitForTimeout(500);
}

async function saveScreenshot(window, stagingDirectory, name, screenshotOptions = {}) {
  const screenshot = await window.screenshot({
    animations: 'disabled',
    ...screenshotOptions
  });
  const outputPath = path.join(stagingDirectory, name);
  fs.writeFileSync(outputPath, screenshot);
  const width = screenshot.readUInt32BE(16);
  const height = screenshot.readUInt32BE(20);
  console.log(`${name}: ${width}x${height} px`);
}

async function saveRightClickScreenshot(window, stagingDirectory) {
  const actionIcons = window.locator('.card-actions').first();
  const contextMenu = window.locator('#context-menu');
  await actionIcons.waitFor({ state: 'visible' });

  const [iconsBounds, menuBounds, viewport] = await Promise.all([
    actionIcons.boundingBox(),
    contextMenu.boundingBox(),
    window.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  ]);
  if (!iconsBounds || !menuBounds) {
    throw new Error('Could not measure the right-click menu and action icons.');
  }

  const padding = 25;
  const left = Math.max(0, Math.floor(Math.min(iconsBounds.x, menuBounds.x) - padding));
  const top = Math.max(0, Math.floor(Math.min(iconsBounds.y, menuBounds.y) - padding));
  const right = Math.min(
    viewport.width,
    Math.ceil(Math.max(iconsBounds.x + iconsBounds.width, menuBounds.x + menuBounds.width) + padding)
  );
  const bottom = Math.min(
    viewport.height,
    Math.ceil(Math.max(iconsBounds.y + iconsBounds.height, menuBounds.y + menuBounds.height) + padding)
  );

  await saveScreenshot(window, stagingDirectory, 'right-click-menu.png', {
    clip: { x: left, y: top, width: right - left, height: bottom - top }
  });
}

async function captureScreenshots() {
  const demoFolder = getDemoFolder();
  if (!fs.statSync(demoFolder).isDirectory()) {
    throw new Error(`Demo folder is not a directory: ${demoFolder}`);
  }

  const stagingDirectory = fs.mkdtempSync(path.join(imagesDirectory, '.screenshots-'));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-screenshots-'));
  const settingsPath = path.join(dataDirectory, 'printaview-settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    customRootFolder: demoFolder,
    showDetailsPane: true,
    showHidden: false,
    panePosition: 'right',
    detailsPaneWidth: 320,
    sortBy: 'name',
    favoritesFilter: 'all',
    filters: null,
    defaultFileTypes: ['image', 'pdf', 'tiff'],
    customExtensions: [],
    theme: 'default'
  }, null, 2));

  let app;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: ['--headless', '.'],
      env: { ...process.env, PRINTAVIEW_DATA_DIR: dataDirectory }
    });

    const mainWindow = await app.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await waitForItems(mainWindow);
    const displayedFolder = await mainWindow.locator('#downloads-path').textContent();
    if (path.resolve(displayedFolder) !== path.resolve(demoFolder)) {
      throw new Error(`PrintaView opened ${displayedFolder} instead of ${demoFolder}.`);
    }

    await waitForScreenshotReady(mainWindow);
    await saveScreenshot(mainWindow, stagingDirectory, 'app-with-details.png');

    await mainWindow.locator('#toggle-details-pane-button').click();
    await mainWindow.locator('#details-pane').waitFor({ state: 'hidden' });
    await waitForScreenshotReady(mainWindow);
    await saveScreenshot(mainWindow, stagingDirectory, 'app-without-details.png');

    await mainWindow.locator('#toggle-details-pane-button').click();
    await mainWindow.locator('#details-pane').waitFor({ state: 'visible' });
    await waitForScreenshotReady(mainWindow);
    await cards.first().click({ button: 'right', position: { x: 90, y: 80 } });
    await mainWindow.locator('#context-menu').waitFor({ state: 'visible' });
    await saveRightClickScreenshot(mainWindow, stagingDirectory);

    const settingsWindowPromise = app.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const settingsWindow = await settingsWindowPromise;
    await settingsWindow.locator('#display-panel').waitFor({ state: 'visible' });
    await saveScreenshot(settingsWindow, stagingDirectory, 'settings-appearance.png');

    for (const [tabName, panelId, screenshotName] of [
      ['File Types', 'file-types-panel', 'settings-file-types.png'],
      ['Hidden Files', 'hidden-files-panel', 'settings-hidden-files.png'],
      ['About', 'about-panel', 'settings-about.png']
    ]) {
      await settingsWindow.getByRole('tab', { name: tabName }).click();
      await settingsWindow.locator(`#${panelId}`).waitFor({ state: 'visible' });
      await saveScreenshot(settingsWindow, stagingDirectory, screenshotName);
    }

    for (const [stagedName, targetName] of screenshotFiles) {
      fs.copyFileSync(
        path.join(stagingDirectory, stagedName),
        path.join(imagesDirectory, targetName)
      );
    }
    console.log(`Updated ${screenshotFiles.length} screenshots in images/`);
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDirectory, { recursive: true, force: true });
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

captureScreenshots().catch((error) => {
  console.error('Screenshot capture failed:', error);
  process.exitCode = 1;
});
