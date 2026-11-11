function openExternalUrl(url, shell) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return;
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return;
  }

  shell.openExternal(parsedUrl.toString()).catch((error) => {
    console.error('Failed to open external URL:', error);
  });
}

function applyWindowSecurity(webContents, shell) {
  webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url, shell);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (url === webContents.getURL()) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url, shell);
  });
}

module.exports = { applyWindowSecurity };
