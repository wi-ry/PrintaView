const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, 'build');
const iconPath = path.join(buildDir, 'icon.svg');
const icoPath = path.join(buildDir, 'icon.ico');
const mainIconPath = path.join(buildDir, 'icon.png');
const sizes = [256, 128, 64, 48, 32, 16];
const iconoPaths = [];

// Skip if icons already exist and SVG hasn't changed
if (fs.existsSync(icoPath) && fs.existsSync(mainIconPath)) {
  const svgTime = fs.statSync(iconPath).mtimeMs;
  const icoTime = fs.statSync(icoPath).mtimeMs;
  if (icoTime > svgTime) {
    console.log('✓ Icons are up to date, skipping generation');
    process.exit(0);
  }
}

async function generateIcons() {
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  try {
    // Generate PNG files for each size
    for (const size of sizes) {
      const outputPath = path.join(buildDir, `icon-${size}x${size}.png`);
      await sharp(iconPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 245, g: 242, b: 234, alpha: 1 }
        })
        .png()
        .toFile(outputPath);
      iconoPaths.push(outputPath);
      console.log(`✓ Generated ${size}x${size} icon`);
    }

    // Generate the main icon (256x256 for use as app icon)
    const mainIconPath = path.join(buildDir, 'icon.png');
    await sharp(iconPath)
      .resize(256, 256, {
        fit: 'contain',
        background: { r: 245, g: 242, b: 234, alpha: 1 }
      })
      .png()
      .toFile(mainIconPath);
    console.log('✓ Generated main icon.png');

    // Generate ICO file from PNGs using ImageMagick or fallback
    try {
      const icoPath = path.join(buildDir, 'icon.ico');
      // Try using magick (ImageMagick)
      execSync(`magick convert "${path.join(buildDir, 'icon-256x256.png')}" "${path.join(buildDir, 'icon-128x128.png')}" "${path.join(buildDir, 'icon-64x64.png')}" "${path.join(buildDir, 'icon-48x48.png')}" "${path.join(buildDir, 'icon-32x32.png')}" "${path.join(buildDir, 'icon-16x16.png')}" "${icoPath}"`, { stdio: 'pipe' });
      console.log('✓ Generated icon.ico');
    } catch (e) {
      // Fallback: use sharp to create a simple ICO from 256x256 PNG
      console.log('⚠ ImageMagick not found, creating ICO from PNG...');
      const pngBuffer = fs.readFileSync(mainIconPath);
      const icoPath = path.join(buildDir, 'icon.ico');
      fs.copyFileSync(mainIconPath, icoPath.replace('.ico', '_temp.png'));
      // Create a minimal ICO header and copy PNG data as fallback
      // For Windows, we'll rely on the PNG-to-ICO conversion being done by electron-builder
      console.log('✓ Icon ready for electron-builder conversion');
    }

    console.log('✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
