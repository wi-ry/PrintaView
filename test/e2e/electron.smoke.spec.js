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

async function writePsdWithThumbnail(filePath) {
  const width = 32;
  const height = 24;
  const thumbnail = await sharp({
    create: { width, height, channels: 3, background: { r: 36, g: 112, b: 154 } }
  }).jpeg().toBuffer();

  const thumbnailHeader = Buffer.alloc(28);
  thumbnailHeader.writeUInt32BE(1, 0);
  thumbnailHeader.writeUInt32BE(width, 4);
  thumbnailHeader.writeUInt32BE(height, 8);
  thumbnailHeader.writeUInt32BE(width * 3, 12);
  thumbnailHeader.writeUInt32BE(thumbnail.length, 16);
  thumbnailHeader.writeUInt32BE(thumbnail.length, 20);
  thumbnailHeader.writeUInt16BE(24, 24);
  thumbnailHeader.writeUInt16BE(1, 26);

  const resourceData = Buffer.concat([thumbnailHeader, thumbnail]);
  const resourceHeader = Buffer.alloc(12);
  resourceHeader.write('8BIM', 0, 'ascii');
  resourceHeader.writeUInt16BE(1036, 4);
  resourceHeader.writeUInt32BE(resourceData.length, 8);
  const imageResource = Buffer.concat([resourceHeader, resourceData]);

  const header = Buffer.alloc(26);
  header.write('8BPS', 0, 'ascii');
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(3, 12);
  header.writeUInt32BE(height, 14);
  header.writeUInt32BE(width, 18);
  header.writeUInt16BE(8, 22);
  header.writeUInt16BE(3, 24);
  const emptySection = Buffer.alloc(4);
  const resourceSection = Buffer.alloc(4);
  resourceSection.writeUInt32BE(imageResource.length);

  fs.writeFileSync(filePath, Buffer.concat([
    header,
    emptySection,
    resourceSection,
    imageResource,
    emptySection,
    Buffer.alloc(2 + width * height * 3)
  ]));
}

function setupAppSettings(dataRoot, customRootFolder, overrides = {}) {
  const userDataDir = dataRoot;
  const settings = {
    customRootFolder,
    showDetailsPane: true,
    showHidden: false,
    panePosition: 'right',
    ...overrides
  };

  fs.mkdirSync(userDataDir, { recursive: true });

  const settingsPath = path.join(userDataDir, 'printaview-settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  const hiddenStorePath = path.join(userDataDir, 'hidden-items.json');
  if (fs.existsSync(hiddenStorePath)) {
    fs.unlinkSync(hiddenStorePath);
  }
}

async function launchIsolatedApp(customRootFolder, settingsOverrides = {}) {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-e2e-'));
  const dataRoot = path.join(testRoot, 'printaview-data');
  fs.mkdirSync(dataRoot, { recursive: true });

  setupAppSettings(dataRoot, customRootFolder, settingsOverrides);

  const electronApp = await electron.launch({
    executablePath: require('electron'),
    args: [
      ...(process.env.PRINTAVIEW_TEST_HEADED === '1' ? [] : ['--headless']),
      '.'
    ],
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
    await expect(mainWindow.locator('.brand span')).toHaveText('PrintaView');
    await expect(mainWindow.locator('.brand img')).toBeVisible();
    await expect(mainWindow.locator('.brand img')).toHaveJSProperty('naturalWidth', 512);
    await expect(mainWindow.locator('#downloads-path')).toHaveText(fixtureRoot);
    await expect(mainWindow.locator('#browse-button')).toHaveText('Change folder');
    expect(await mainWindow.locator('#browse-button').evaluate((button) =>
      button.parentElement.classList.contains('path-row'))).toBe(true);
    await expect(mainWindow.locator('#grid .card').first()).toBeVisible();
    expect(await mainWindow.locator('#sort-select').evaluate((button) =>
      getComputedStyle(button).height)).toBe(await mainWindow.locator('#filter-button').evaluate((button) =>
      getComputedStyle(button).height));
    expect(await mainWindow.locator('#sort-select').evaluate((button) =>
      getComputedStyle(button).width)).toBe(await mainWindow.locator('#filter-button').evaluate((button) =>
      getComputedStyle(button).width));
    expect(await mainWindow.locator('#sort-select').evaluate((button) =>
      getComputedStyle(button, '::after').content)).not.toBe('none');
    expect(await mainWindow.locator('#filter-button').evaluate((button) =>
      getComputedStyle(button, '::after').content)).not.toBe('none');
    await expect(mainWindow.locator('#loading-state')).toBeHidden();
    await expect(mainWindow.locator('#refresh-button svg')).toHaveAttribute('viewBox', '0 0 24 24');
    await expect(mainWindow.locator('#view-menu-button svg')).toHaveAttribute('viewBox', '0 0 24 24');
    const settingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const settingsWindow = await settingsWindowPromise;

    await expect(settingsWindow).toHaveTitle(/Settings - PrintaView/);
    await expect(settingsWindow.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
    await expect(settingsWindow.locator('#display-panel')).toBeVisible();
    await expect(settingsWindow.locator('#show-file-action-icons')).toHaveCount(0);
    await expect(settingsWindow.getByText('Color Scheme')).toBeVisible();
    await expect(settingsWindow.locator('.theme-swatch').first()).toHaveCSS('width', '28px');
    await expect(settingsWindow.locator('.theme-swatch').first()).toHaveCSS('height', '14px');
    expect(await settingsWindow.evaluate(() => window.outerHeight)).toBeLessThanOrEqual(640);
    expect(await settingsWindow.locator('.settings-container').evaluate((container) =>
      container.scrollHeight)).toBeLessThanOrEqual(await settingsWindow.locator('.settings-container').evaluate((container) =>
      container.clientHeight));
    await settingsWindow.getByRole('tab', { name: 'File Types' }).click();
    await expect(settingsWindow.locator('#file-types-panel')).toBeVisible();
    await expect(settingsWindow.locator('#default-file-types input[value="image"]')).toBeChecked();
    await expect(settingsWindow.locator('#custom-extensions')).toBeVisible();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeHidden();
    await settingsWindow.getByRole('tab', { name: 'Hidden Files' }).click();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeVisible();
    await expect(settingsWindow.locator('#display-panel')).toBeHidden();
    await expect(settingsWindow.locator('#show-hidden')).toBeVisible();
    await settingsWindow.getByRole('tab', { name: 'Appearance' }).click();
    await expect(settingsWindow.locator('#display-panel')).toBeVisible();
    await expect(settingsWindow.locator('#hidden-files-panel')).toBeHidden();
    await settingsWindow.close();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('dark theme can be selected and persists across windows', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const settingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const settingsWindow = await settingsWindowPromise;
    const darkThemeOption = settingsWindow.locator('input[name="theme"][value="dark"]');

    await darkThemeOption.check();
    await expect(settingsWindow.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(settingsWindow.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(settingsWindow.locator('.theme-swatch.dark')).toBeVisible();
    await Promise.all([
      settingsWindow.waitForEvent('close'),
      settingsWindow.locator('#save-btn').click()
    ]);

    await expect(mainWindow.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(mainWindow.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(mainWindow.locator('#grid .card').first()).toBeVisible();

    const reopenedSettingsPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    const reopenedSettings = await reopenedSettingsPromise;
    await expect(reopenedSettings.locator('input[name="theme"][value="dark"]')).toBeChecked();
    await reopenedSettings.close();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('sort and filter dropdown popovers stay anchored without shifting the toolbar', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const toolbar = mainWindow.locator('.toolbar');
    const sortButton = mainWindow.locator('#sort-select');
    const sortPopover = mainWindow.locator('#sort-popover');
    const filterButton = mainWindow.locator('#filter-button');
    const filterPopover = mainWindow.locator('#filter-popover');
    const initialToolbarBox = await toolbar.boundingBox();

    await sortButton.click();
    await expect(sortPopover).toBeVisible();
    await expect(sortPopover).toHaveCSS('position', 'absolute');
    await expect(sortPopover.getByRole('menuitemradio')).toHaveCount(4);
    await expect(sortPopover.getByRole('menuitemradio', { name: 'Newest' })).toHaveAttribute('aria-checked', 'true');
    const sortAnchor = await sortButton.boundingBox();
    const sortMenu = await sortPopover.boundingBox();
    expect(Math.abs(sortMenu.x - sortAnchor.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sortMenu.y - sortAnchor.y - sortAnchor.height - 8)).toBeLessThanOrEqual(1);
    expect(await toolbar.boundingBox()).toEqual(initialToolbarBox);

    await filterButton.click();
    await expect(sortPopover).toBeHidden();
    await expect(filterPopover).toBeVisible();
    await expect(filterPopover).toHaveCSS('position', 'absolute');
    await expect(filterPopover.locator('select')).toHaveCount(3);
    await expect(filterPopover.locator('fieldset input[name="file-type"]')).toHaveCount(5);
    const filterAnchor = await filterButton.boundingBox();
    const filterMenu = await filterPopover.boundingBox();
    expect(Math.abs(filterMenu.x + filterMenu.width - filterAnchor.x - filterAnchor.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(filterMenu.y - filterAnchor.y - filterAnchor.height - 8)).toBeLessThanOrEqual(1);
    expect(await toolbar.boundingBox()).toEqual(initialToolbarBox);

    await mainWindow.locator('.brand').click();
    await expect(filterPopover).toBeHidden();
    expect(await toolbar.boundingBox()).toEqual(initialToolbarBox);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('refresh keeps existing files visible without showing the loading overlay', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(1);
    await expect(mainWindow.locator('#loading-state')).toBeHidden();

    const loadingVisibleDuringRefresh = await mainWindow.evaluate(() => {
      document.querySelector('#refresh-button').click();
      return !document.querySelector('#loading-state').hidden;
    });
    expect(loadingVisibleDuringRefresh).toBe(false);
    await expect(cards).toHaveCount(1);
    await expect(mainWindow.locator('#loading-state')).toBeHidden();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('details pane can be closed and toggled from the folder toolbar', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    let mainWindow = await electronApp.firstWindow();
    const detailsPane = mainWindow.locator('#details-pane');
    const paneToggle = mainWindow.locator('#toggle-details-pane-button');

    await expect(detailsPane).toBeVisible();
    await expect(mainWindow.locator('#close-details-pane-button')).toBeVisible();
    const paneWidth = () => detailsPane.evaluate((pane) => pane.getBoundingClientRect().width);
    const resizer = mainWindow.locator('#details-pane-resizer');
    expect(await paneToggle.evaluate((button) =>
      button.parentElement.classList.contains('path-row'))).toBe(true);
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await paneToggle.evaluate((button) => getComputedStyle(button).borderColor))
      .not.toBe('rgb(213, 204, 185)');
    expect(await paneToggle.locator('.pane-state-open').first().evaluate((element) =>
      getComputedStyle(element).display)).not.toBe('none');
    expect(await paneToggle.locator('.pane-state-closed').evaluate((element) =>
      getComputedStyle(element).display)).toBe('none');
    expect(await paneWidth()).toBe(320);
    await expect(resizer).toHaveAttribute('role', 'separator');
    const visiblePaneButtonBorder = await paneToggle.evaluate((button) =>
      getComputedStyle(button).borderColor);

    await mainWindow.locator('#close-details-pane-button').click();
    await expect(detailsPane).toBeHidden();
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(paneToggle).toHaveAttribute('aria-label', 'Show details pane');
    expect(await paneToggle.evaluate((button) =>
      getComputedStyle(button).borderColor)).not.toBe(visiblePaneButtonBorder);

    await paneToggle.click();
    await expect(detailsPane).toBeVisible();
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'true');
    expect(await paneToggle.evaluate((button) =>
      getComputedStyle(button).borderColor)).toBe(visiblePaneButtonBorder);

    await resizer.focus();
    await mainWindow.keyboard.press('ArrowLeft');
    await expect(resizer).toHaveAttribute('aria-valuenow', '336');
    expect(await paneWidth()).toBe(336);

    const resizerBox = await resizer.boundingBox();
    await mainWindow.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 40);
    await mainWindow.mouse.down();
    await mainWindow.mouse.move(resizerBox.x + resizerBox.width / 2 - 30, resizerBox.y + 40);
    await mainWindow.mouse.up();
    await expect(resizer).toHaveAttribute('aria-valuenow', '366');
    expect(await paneWidth()).toBe(366);

    await mainWindow.reload();
    mainWindow = await electronApp.firstWindow();
    await expect(mainWindow.locator('#details-pane')).toBeVisible();
    await expect(mainWindow.locator('#details-pane')).toHaveCSS('width', '366px');
    await mainWindow.locator('#toggle-details-pane-button').click();
    await expect(mainWindow.locator('#details-pane')).toBeHidden();

    await mainWindow.reload();
    mainWindow = await electronApp.firstWindow();
    await expect(mainWindow.locator('#details-pane')).toBeHidden();
    expect(await mainWindow.locator('#toggle-details-pane-button .pane-state-closed').evaluate((element) =>
      getComputedStyle(element).display)).not.toBe('none');
    expect(await mainWindow.locator('#toggle-details-pane-button .pane-state-open').first().evaluate((element) =>
      getComputedStyle(element).display)).toBe('none');
    await mainWindow.locator('#toggle-details-pane-button').click();
    await expect(mainWindow.locator('#details-pane')).toBeVisible();
    expect(await mainWindow.locator('#toggle-details-pane-button .pane-state-open').first().evaluate((element) =>
      getComputedStyle(element).display)).not.toBe('none');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('file type defaults and custom extensions persist in settings', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const settingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    let settingsWindow = await settingsWindowPromise;
    expect(await settingsWindow.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(500);
    await expect(settingsWindow.locator('#show-file-action-icons')).toHaveCount(0);
    await settingsWindow.getByRole('tab', { name: 'File Types' }).click();
    const customFileTypesToggle = settingsWindow.locator('#default-file-types input[value="custom"]');
    const customExtensions = settingsWindow.locator('#custom-extensions');
    await expect(customExtensions).toBeDisabled();
    await settingsWindow.locator('#default-file-types input[value="other"]').check();
    await customFileTypesToggle.check();
    await expect(customExtensions).toBeEnabled();
    await customExtensions.fill('.psd, .blend');
    await customFileTypesToggle.uncheck();
    await expect(customExtensions).toBeDisabled();
    await customFileTypesToggle.check();
    await expect(customExtensions).toBeEnabled();
    const settingsClosed = settingsWindow.waitForEvent('close');
    await settingsWindow.locator('#save-btn').click();
    await settingsClosed;
    await mainWindow.reload();
    const regularCard = mainWindow.locator('.card-shell').first();
    await expect(regularCard.locator('.card-actions')).toHaveCSS('opacity', '0');
    await regularCard.hover();
    await expect(regularCard.locator('.card-actions')).toHaveCSS('opacity', '1');

    const reopenedSettingsWindowPromise = electronApp.waitForEvent('window');
    await mainWindow.locator('#view-menu-button').click();
    settingsWindow = await reopenedSettingsWindowPromise;
    await expect(settingsWindow.locator('#show-file-action-icons')).toHaveCount(0);
    await settingsWindow.getByRole('tab', { name: 'File Types' }).click();
    await expect(settingsWindow.locator('#default-file-types input[value="other"]')).toBeChecked();
    await expect(settingsWindow.locator('#default-file-types input[value="custom"]')).toBeChecked();
    await expect(settingsWindow.locator('#custom-extensions')).toBeEnabled();
    await expect(settingsWindow.locator('#custom-extensions')).toHaveValue('.psd, .blend');
    const reopenedSettingsClosed = settingsWindow.waitForEvent('close');
    await settingsWindow.locator('#save-btn').click();
    await reopenedSettingsClosed;
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
    await expect(mainWindow.locator('#detail-preview')).toBeHidden();
    const cardActions = imageCard.locator('..');
    await expect(cardActions.getByRole('button', { name: 'Open file' })).toHaveCount(1);
    await expect(cardActions.getByRole('button', { name: 'Show in folder' })).toHaveCount(1);
    await expect(cardActions.getByRole('button', { name: 'Move to Recycle Bin' })).toHaveCount(1);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('PSD files use their embedded thumbnail for the preview', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  await writePsdWithThumbnail(path.join(fixtureRoot, 'artwork.psd'));
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const psdCard = mainWindow.locator('#grid .card').filter({
      has: mainWindow.locator('.title', { hasText: 'artwork.psd' })
    });
    await expect(psdCard).toBeVisible();
    await expect(psdCard.locator('.preview img')).toHaveJSProperty('naturalWidth', 32);
    await expect(psdCard.locator('.preview img')).toHaveJSProperty('naturalHeight', 24);
    await psdCard.click();
    await expect(mainWindow.locator('#detail-dimensions')).toHaveText('32 × 24 pixels');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('selecting a file with CSS-special characters updates its card and details', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const imageName = 'sample [#1] 100%.png';
  await sharp({
    create: {
      width: 24,
      height: 16,
      channels: 4,
      background: '#00ff00'
    }
  }).png().toFile(path.join(fixtureRoot, imageName));
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const imageCard = mainWindow.locator('#grid .card').filter({
      has: mainWindow.locator('.title', { hasText: new RegExp(`^${imageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
    });

    await imageCard.click();

    await expect(imageCard).toHaveClass(/selected/);
    await expect(mainWindow.locator('#detail-name')).toHaveText(imageName);
    await expect(mainWindow.locator('#detail-path')).toHaveText(path.join(fixtureRoot, imageName));
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('long filenames have room for two lines and comfortable card padding', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const filename = 'A_very_long_filename_that_wraps_onto_multiple_lines_for_readability.pdf';
  fs.writeFileSync(path.join(fixtureRoot, filename), '%PDF-1.4\n% long filename fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const card = mainWindow.locator('#grid .card').filter({
      has: mainWindow.locator('.title', { hasText: new RegExp(`^${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
    });
    await expect(card).toBeVisible();

    const spacing = await card.evaluate((element) => {
      const meta = element.querySelector('.meta');
      const title = meta.querySelector('.title');
      const metaStyle = getComputedStyle(meta);
      return {
        paddingTop: metaStyle.paddingTop,
        paddingLeft: metaStyle.paddingLeft,
        metaHeight: meta.clientHeight,
        titleHeight: title.clientHeight
      };
    });
    expect(spacing.paddingTop).toBe('12px');
    expect(spacing.paddingLeft).toBe('16px');
    expect(spacing.metaHeight - spacing.titleHeight).toBeGreaterThanOrEqual(24);
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

    await mainWindow.locator('#filter-button').click();
    await mainWindow.locator('#favorites-filter').selectOption('favorites');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['sample.pdf']);

    await mainWindow.locator('#favorites-filter').selectOption('all');
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

    await mainWindow.locator('#sort-select').click();
    await mainWindow.locator('#sort-popover [data-sort-value="name"]').click();
    await expect(cards.locator('.title')).toHaveText(['alpha.pdf', 'sample.pdf', 'zeta.pdf']);

    await expect(mainWindow.locator('#sort-popover [data-sort-value="recent"]')).toHaveText('Newest');
    await expect(mainWindow.locator('#sort-popover [data-sort-value="oldest"]')).toHaveText('Oldest');
    await mainWindow.locator('#sort-select').click();
    await mainWindow.locator('#sort-popover [data-sort-value="oldest"]').click();
    await expect(mainWindow.locator('#sort-select')).toHaveAttribute('data-sort-value', 'oldest');
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('newest and oldest sorts group files by date while type sort stays grouped by type', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'second.pdf'), '%PDF-1.4\n% second fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(2);
    await expect(mainWindow.locator('#sort-select')).toHaveAttribute('data-sort-value', 'recent');
    await expect(mainWindow.locator('#grid .date-group .type-group-title')).toHaveText(['Today']);

    await mainWindow.locator('#sort-select').click();
    await mainWindow.locator('#sort-popover [data-sort-value="oldest"]').click();
    await expect(mainWindow.locator('#grid .date-group .type-group-title')).toHaveText(['Today']);
    await expect(mainWindow.locator('#grid .date-group .card')).toHaveCount(2);

    await mainWindow.locator('#sort-select').click();
    await mainWindow.locator('#sort-popover [data-sort-value="type"]').click();
    await expect(mainWindow.locator('#grid .date-group')).toHaveCount(0);
    await expect(mainWindow.locator('#grid .type-group')).toHaveCount(1);
    await expect(mainWindow.locator('#grid .type-group-title')).toHaveText(['PDF']);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('type filters combine with search and clear independently', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'notes.txt'), 'notes', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['sample.pdf']);
    await mainWindow.locator('#filter-button').click();
    await expect(mainWindow.locator('input[name="file-type"][value="other"]')).not.toBeChecked();
    await mainWindow.locator('input[name="file-type"][value="other"]').check();
    await mainWindow.locator('input[name="file-type"][value="pdf"]').uncheck();

    await expect(cards).toHaveCount(2);
    await mainWindow.locator('#search-input').fill('sample');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['sample.docx']);
    await expect(mainWindow.locator('.filter-chip')).toContainText('Other');

    await mainWindow.locator('#clear-filters-button').click();
    await expect(cards).toHaveCount(1);
    await expect(mainWindow.locator('#search-input')).toHaveValue('sample');
    await expect(cards.locator('.title')).toHaveText(['sample.pdf']);
    await mainWindow.locator('#search-clear').click();
    await expect(cards).toHaveCount(1);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('legacy all-type preference restores the default filtered file list', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'notes.txt'), 'notes', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot, {
    filters: {
      favorites: 'all',
      types: ['image', 'pdf', 'tiff', 'other'],
      modified: 'any',
      size: 'any'
    }
  });

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['sample.pdf']);
    await mainWindow.locator('#filter-button').click();
    await expect(mainWindow.locator('input[name="file-type"][value="other"]')).not.toBeChecked();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('modified date and file size filters use file metadata', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'small.txt'), 'small', 'utf8');
  fs.writeFileSync(path.join(fixtureRoot, 'large.txt'), Buffer.alloc(11 * 1024 * 1024));
  const oldPath = path.join(fixtureRoot, 'old.txt');
  fs.writeFileSync(oldPath, 'old', 'utf8');
  const oldTime = Date.now() / 1000 - 45 * 24 * 60 * 60;
  fs.utimesSync(oldPath, oldTime, oldTime);
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(1);
    await mainWindow.locator('#filter-button').click();
    await mainWindow.locator('input[name="file-type"][value="other"]').check();
    await expect(cards).toHaveCount(5);
    await mainWindow.locator('#size-filter').selectOption('under-1mb');
    await expect(cards).toHaveCount(4);
    await mainWindow.locator('#modified-filter').selectOption('7d');
    await expect(cards).toHaveCount(3);
    await mainWindow.locator('#size-filter').selectOption('over-10mb');
    await expect(cards).toHaveCount(1);
    await expect(cards.locator('.title')).toHaveText(['large.txt']);

    await mainWindow.locator('#clear-filters-button').click();
    await expect(cards).toHaveCount(1);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('arrow keys move selection between visible cards', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  fs.writeFileSync(path.join(fixtureRoot, 'second.pdf'), '%PDF-1.4\n% second fixture\n', 'utf8');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot);

  try {
    const mainWindow = await electronApp.firstWindow();
    const cards = mainWindow.locator('#grid .card');
    await expect(cards).toHaveCount(2);
    await expect(mainWindow.locator('#grid .card.selected')).toHaveCount(1);
    await cards.first().click();
    const firstId = await mainWindow.locator('#grid .card.selected').getAttribute('data-item-id');
    await mainWindow.keyboard.press('ArrowRight');

    await expect.poll(() =>
      mainWindow.locator('#grid .card.selected').getAttribute('data-item-id')
    ).not.toBe(firstId);

    const navigatedId = await mainWindow.locator('#grid .card.selected').getAttribute('data-item-id');
    await mainWindow.locator('#search-input').focus();
    await mainWindow.keyboard.press('ArrowLeft');
    await expect(mainWindow.locator('#grid .card.selected')).toHaveAttribute('data-item-id', navigatedId);
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('duplicate review shows side-by-side previews, details, and file actions', async () => {
  const fixtureRoot = setupFixtureRoot(
    fs.mkdtempSync(path.join(os.tmpdir(), 'printaview-smoke-files-'))
  );
  const duplicateImage = await sharp({
    create: { width: 48, height: 32, channels: 3, background: '#146f91' }
  }).png().toBuffer();
  fs.writeFileSync(path.join(fixtureRoot, 'first.png'), duplicateImage);
  fs.writeFileSync(path.join(fixtureRoot, 'second.png'), duplicateImage);
  fs.writeFileSync(path.join(fixtureRoot, 'first.blend'), 'custom duplicate');
  fs.writeFileSync(path.join(fixtureRoot, 'second.blend'), 'custom duplicate');
  const { electronApp, cleanup } = await launchIsolatedApp(fixtureRoot, {
    customExtensions: ['.blend']
  });

  try {
    const mainWindow = await electronApp.firstWindow();
    await mainWindow.locator('#filter-button').click();
    await mainWindow.locator('#find-duplicates-button').click();

    const duplicateGroup = mainWindow.locator('.duplicate-group');
    await expect(duplicateGroup).toHaveCount(1);
    await expect(mainWindow.locator('#loading-state')).toBeHidden();
    const groupWidth = await duplicateGroup.evaluate((element) => element.getBoundingClientRect().width);
    const gridWidth = await mainWindow.locator('#grid').evaluate((element) => element.getBoundingClientRect().width);
    expect(groupWidth).toBeGreaterThan(gridWidth * 0.9);
    await expect(duplicateGroup.locator('.duplicate-file-details strong'))
      .toHaveText(['first.png', 'second.png']);
    await expect(duplicateGroup.locator('.duplicate-file')).toHaveCount(2);
    await expect(duplicateGroup.locator('.duplicate-file .preview img')).toHaveCount(2);
    const firstDuplicate = duplicateGroup.locator('.duplicate-file').first();
    await expect(firstDuplicate.locator('.duplicate-file-actions')).toHaveCSS('opacity', '0');
    await firstDuplicate.hover();
    await expect(firstDuplicate.locator('.duplicate-file-actions')).toHaveCSS('opacity', '1');
    await expect(firstDuplicate.locator('.duplicate-file-actions')).toHaveCSS('pointer-events', 'auto');
    await expect(duplicateGroup.locator('.duplicate-file-actions')
      .getByRole('button', { name: 'Open file' })).toHaveCount(2);
    await expect(duplicateGroup.locator('.duplicate-file-actions')
      .getByRole('button', { name: 'Show in folder' })).toHaveCount(2);
    await expect(duplicateGroup.locator('.duplicate-file-actions')
      .getByRole('button', { name: 'Move to Recycle Bin' })).toHaveCount(2);
    const firstPreviewLeft = await duplicateGroup.locator('.duplicate-file .preview').nth(0)
      .evaluate((preview) => preview.getBoundingClientRect().left);
    const secondPreviewLeft = await duplicateGroup.locator('.duplicate-file .preview').nth(1)
      .evaluate((preview) => preview.getBoundingClientRect().left);
    expect(secondPreviewLeft).toBeGreaterThan(firstPreviewLeft);
    await duplicateGroup.locator('.duplicate-file').first().click();
    await expect(mainWindow.locator('#detail-name')).toHaveText('first.png');
    await expect(mainWindow.locator('#detail-preview img')).toBeVisible();
    await expect(mainWindow.locator('#detail-preview img')).toHaveJSProperty('naturalWidth', 48);
    await expect(mainWindow.locator('#detail-dimensions')).toHaveText('48 × 32 pixels');

    await mainWindow.locator('#filter-button').click();
    await mainWindow.locator('input[name="file-type"][value="image"]').uncheck();
    await mainWindow.locator('input[name="file-type"][value="custom"]').check();
    await mainWindow.locator('#find-duplicates-button').click();
    await expect(mainWindow.locator('.duplicate-group')).toHaveCount(1);
    await expect(mainWindow.locator('.duplicate-file-details strong'))
      .toHaveText(['first.blend', 'second.blend']);

    await expect(mainWindow.locator('#duplicate-back-button svg')).toBeVisible();
    await expect(mainWindow.locator('#duplicate-back-button')).toContainText('Back to files');
    const changeFolderHeight = await mainWindow.locator('#browse-button').evaluate((button) =>
      button.getBoundingClientRect().height);
    const backToFilesHeight = await mainWindow.locator('#duplicate-back-button').evaluate((button) =>
      button.getBoundingClientRect().height);
    expect(backToFilesHeight).toBe(changeFolderHeight);
    await mainWindow.locator('#duplicate-back-button').click();
    await expect(mainWindow.locator('#grid .card')).toHaveCount(3);
    await expect(mainWindow.locator('#detail-preview')).toBeHidden();
  } finally {
    await cleanup();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
