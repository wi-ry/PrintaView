# PrintaView

PrintaView is a standalone Windows desktop app for browsing and previewing files from your Downloads folder in one unified view (including all subfolders).

![App](./images/app.jpg)

*Main application view*

![Right-click Menu](./images/rightclick.jpg)

*Right-click context menu with hide and favorite actions*

![Settings](./images/settings.png)

*Settings window, including hidden files toggle*

## Features

- Recursive file browser for your configured root folder (defaults to `Downloads`, with `Browse` to switch).
- Shows supported files only: images (`png`, `jpg`, `jpeg`, `bmp`, `gif`, `webp`, `tif`, `tiff`, `ico`) and `pdf`.
- Image thumbnails and generated PDF first-page thumbnails (with page count).
- Generic type tiles for supported non-image/non-PDF files (for example `docx` and `pptx`).
- Right-click actions: `Open`, `Show in Windows Explorer`, `Favorite`/`Unfavorite`, and `Hide`/`Unhide`.
- Favorites workflow with toolbar filter toggle (`All` / `Favorites`).
- Hidden items are app-managed (do not change the Windows hidden attribute), with `Show Hidden Files`, per-item unhide, and `Clear All Hidden Items` in Settings.
- Sort options: `Most Recently Downloaded`, `Name`, and `Type` (with expandable type groups).
- Adjustable preview size slider.
- Optional details pane with file metadata and configurable left/right pane position.
- Theme selection (`Default`, `Pastel Pink`, `Baby Blue`) in Settings.

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

## Microsoft Store Release

Tagged releases build an unsigned MSIX, attach it alongside the portable EXE on GitHub Releases, and submit it to Microsoft Store. The Store signs the package; no signing certificate is needed.

Before the first release:

1. Create and reserve the PrintaView product in Partner Center. Set up its Store listing and pricing, then obtain the product identity values.
2. In the GitHub repository, add these Actions **variables** using the values from Partner Center's Product identity page:
   - `MSIX_IDENTITY_NAME`
   - `MSIX_PUBLISHER`
   - `MSIX_PUBLISHER_DISPLAY_NAME`
3. Add these Actions **secrets** for the Microsoft Store CLI service principal and product:
   - `STORE_ID`
   - `TENANT_ID`
   - `SELLER_ID`
   - `CLIENT_ID`
   - `SECRET_VALUE` (the service principal client secret)
4. Ensure the service principal has permission to manage the PrintaView product in Partner Center.

The workflow submits each tagged release and commits the Store submission automatically. The package version is derived from `package.json` and converted to the four-part MSIX version required by Windows.

To build the unsigned package locally after installing dependencies:

```powershell
npm run build:win
npx electron-builder --win dir
.github\scripts\package-msix.ps1 -Version (node -p "require('./package.json').version")
```

Set the three `MSIX_*` environment variables to the Partner Center identity values when producing a package intended for Store submission.

## Version Bumping and GitHub Releases (CI/CD)

This repo includes a GitHub Actions workflow at [.github/workflows/release.yml](.github/workflows/release.yml) that:

- Triggers on tags like `v1.2.3`
- Validates the tag version matches `package.json` version
- Builds the Windows portable EXE and unsigned MSIX
- Creates a GitHub release and uploads both packages
- Submits the MSIX to Microsoft Store

Use this flow when releasing (after completing the Microsoft Store setup above):

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
