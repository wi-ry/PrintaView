const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const iconPath = path.join(buildDir, 'icon.svg');
const sizes = [256, 128, 64, 48, 32, 16];

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

    console.log('✓ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
