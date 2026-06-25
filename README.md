# PrintaView

PrintaView is a standalone Windows desktop app for browsing and previewing files from your Downloads folder in one unified view (including all subfolders).

![App](./images/app.jpg)

*Main application view*

![Right-click Menu](./images/rightclick.jpg)

*Right-click context menu with hide and favorite actions*

![Settings](./images/settings.png)

*Settings window, including hidden files toggle*

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

## Version Bumping and GitHub Releases (CI/CD)

This repo includes a GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml) that:

- Triggers on tags like `v1.2.3`
- Validates the tag version matches `package.json` version
- Builds the Windows portable EXE
- Creates a GitHub release and uploads the EXE

Use this flow when releasing:

1. Bump version (updates `package.json` and `package-lock.json`):

```powershell
npm version patch --no-git-tag-version
```

Use `minor` or `major` instead of `patch` when needed.

2. Commit and push:

```powershell
git add package.json package-lock.json
git commit -m "chore: bump version to x.y.z"
git push
```

3. Create and push matching release tag (must match `package.json`):

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

After the tag is pushed, GitHub Actions will build and publish the release artifact automatically.
