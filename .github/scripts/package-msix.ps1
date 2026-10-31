param(
    [Parameter(Mandatory = $true)][string] $Version,
    [string] $OutputDir = 'release/msix'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version '$Version' must contain three numeric components."
}
$msixVersion = "$Version.0"

function Get-OrDefault($value, $default) {
    if ([string]::IsNullOrWhiteSpace($value)) { $default } else { $value }
}

$identityName = Get-OrDefault $env:MSIX_IDENTITY_NAME 'PrintaView.Dev'
$publisher = Get-OrDefault $env:MSIX_PUBLISHER 'CN=PrintaView'
$publisherDisplayName = Get-OrDefault $env:MSIX_PUBLISHER_DISPLAY_NAME 'PrintaView'
if (-not $env:MSIX_IDENTITY_NAME) {
    Write-Warning 'MSIX identity variables are unset; this package uses placeholders and cannot be submitted to the Store.'
}

$appDir = Join-Path $repoRoot 'release/win-unpacked'
$stageDir = Join-Path $repoRoot 'release/msix-staging'
$outDir = Join-Path $repoRoot $OutputDir
if (-not (Test-Path (Join-Path $appDir 'PrintaView.exe'))) {
    throw "Electron app output not found at $appDir. Build it with electron-builder --win dir first."
}

Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageDir, $outDir | Out-Null
Copy-Item (Join-Path $appDir '*') $stageDir -Recurse -Force

$assetsDir = Join-Path $stageDir 'Assets'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Add-Type -AssemblyName System.Drawing
$sourceImage = [System.Drawing.Image]::FromFile((Join-Path $repoRoot 'images/icon.png'))
try {
    foreach ($asset in @(
        @{ Name = 'StoreLogo.png'; Size = 50 },
        @{ Name = 'Square44x44Logo.png'; Size = 44 },
        @{ Name = 'Square150x150Logo.png'; Size = 150 }
    )) {
        $bitmap = [System.Drawing.Bitmap]::new($asset.Size, $asset.Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.DrawImage($sourceImage, 0, 0, $asset.Size, $asset.Size)
            $bitmap.Save((Join-Path $assetsDir $asset.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $sourceImage.Dispose()
}

$escapeXml = { param($value) [System.Security.SecurityElement]::Escape($value) }
$manifest = Get-Content (Join-Path $PSScriptRoot 'AppxManifest.template.xml') -Raw
$manifest = $manifest.Replace('{{IDENTITY_NAME}}', (& $escapeXml $identityName))
$manifest = $manifest.Replace('{{PUBLISHER}}', (& $escapeXml $publisher))
$manifest = $manifest.Replace('{{PUBLISHER_DISPLAY_NAME}}', (& $escapeXml $publisherDisplayName))
$manifest = $manifest.Replace('{{VERSION}}', $msixVersion)
[System.IO.File]::WriteAllText(
    (Join-Path $stageDir 'AppxManifest.xml'),
    $manifest,
    [System.Text.UTF8Encoding]::new($false)
)

$sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeAppx = Get-ChildItem $sdkBin -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\10\.\d+\.\d+\.\d+\\x64\\' } |
    Sort-Object { [version]([regex]::Match($_.FullName, '10\.\d+\.\d+\.\d+').Value) } -Descending |
    Select-Object -First 1
if (-not $makeAppx) {
    throw "makeappx.exe not found under $sdkBin."
}

$msixPath = Join-Path $outDir "PrintaView_${msixVersion}_x64.msix"
& $makeAppx.FullName pack /d $stageDir /p $msixPath /o
if ($LASTEXITCODE -ne 0) {
    throw "makeappx pack failed with exit code $LASTEXITCODE."
}

Write-Host "Created $msixPath"
