# PrintaView

PrintaView is a standalone Windows desktop app for browsing and previewing files from your Downloads folder in one unified view (including all subfolders).

## Features

- Unified recursive view of items in `Downloads` and all nested folders.
- Previews for common image formats (`png`, `jpg`, `jpeg`, `bmp`, `gif`, `webp`, `tif`, `tiff`, `ico`) and PDFs.
- Generic tile preview for other file types.
- Right-click any file or folder to `Hide`/`Unhide` via app-managed hidden state (does not change Windows hidden attribute).
- `Show Hidden Files` setting in the Settings window.
- Favorites support with `Show: All` / `Show: Favorites` toolbar toggle.
- Sort by:
  - Name
  - Type
  - Most Recently Downloaded
- Adjustable preview/tile size slider.
- Double-click any tile to open with the Windows default application.

## Development

1. Install dependencies:

```powershell
npm install
```

2. Run the app:

```powershell
npm start
```

3. Run tests:

```powershell
npm test
```

## Build Standalone Portable EXE (Windows)

```powershell
npm run build:win
```

Build output is written to the `release` folder as a portable executable that can be run from anywhere.
