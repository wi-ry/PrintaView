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

After the `Test on Main` workflow succeeds, semantic-release analyzes commits on `main`. When they require a release, it automatically updates the package version, creates a `vX.Y.Z` tag and GitHub release, then builds an unsigned MSIX and portable EXE. The portable EXE is attached to the GitHub release, while the MSIX is submitted directly to Microsoft Store and is not published as a release download. The Store signs the package; no signing certificate is needed.

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

The workflow commits the calculated version to `package.json` and `package-lock.json`. The MSIX version is derived from that release version and converted to the four-part format required by Windows.

To build the unsigned package locally after installing dependencies:

```powershell
npm run build:win
npx electron-builder --win dir
.github\scripts\package-msix.ps1 -Version (node -p "require('./package.json').version")
```

Set the three `MSIX_*` environment variables to the Partner Center identity values when producing a package intended for Store submission.

## Automatic Versioning and Releases (CI/CD)

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/) merged to `main`:

- `fix: ...` creates a patch release (for example, `1.0.5` → `1.0.6`).
- `feat: ...` creates a minor release (for example, `1.0.5` → `1.1.0`).
- Add `!` after the type or include `BREAKING CHANGE:` in the commit body to create a major release.
- Other commit types that do not indicate a feature, fix, or breaking change do not trigger a release.

Pull request titles and commit messages are checked for Conventional Commit formatting. Use a release-triggering title such as `fix: correct PDF preview` or `feat: add folder filtering` when the change should ship. When CI succeeds on `main`, semantic-release updates `package.json` and `package-lock.json`, creates the version tag and GitHub release, and triggers the Windows packaging and Store submission job. The GitHub release includes the portable EXE; the unsigned MSIX is submitted directly to Microsoft Store only. No manual version bump or tag is needed. See [.github/workflows/conventional-commits.yml](.github/workflows/conventional-commits.yml), [.github/workflows/release.yml](.github/workflows/release.yml), and [.releaserc.json](.releaserc.json).
