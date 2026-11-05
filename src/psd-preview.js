const fs = require('node:fs/promises');

const PSD_HEADER_SIZE = 26;
const MAX_THUMBNAIL_SIZE = 32 * 1024 * 1024;

async function readAt(handle, length, position) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
}

async function readPsdPreviewData(filePath) {
  const handle = await fs.open(filePath, 'r');

  try {
    const fileSize = (await handle.stat()).size;
    const header = await readAt(handle, PSD_HEADER_SIZE, 0);
    if (!header || header.toString('ascii', 0, 4) !== '8BPS' || header.readUInt16BE(4) !== 1) {
      return null;
    }

    const width = header.readUInt32BE(18);
    const height = header.readUInt32BE(14);
    if (!width || !height) {
      return null;
    }

    let position = PSD_HEADER_SIZE;
    const colorModeLength = await readAt(handle, 4, position);
    if (!colorModeLength) return null;
    position += 4 + colorModeLength.readUInt32BE(0);

    const resourceLength = await readAt(handle, 4, position);
    if (!resourceLength) return null;
    position += 4;
    const resourcesEnd = position + resourceLength.readUInt32BE(0);
    if (resourcesEnd > fileSize) return null;

    while (position + 7 <= resourcesEnd) {
      const resourceHeader = await readAt(handle, 7, position);
      if (!resourceHeader) return null;
      if (resourceHeader.toString('ascii', 0, 4) !== '8BIM') return null;

      const resourceId = resourceHeader.readUInt16BE(4);
      const nameLength = resourceHeader[6];
      const paddedNameLength = Math.ceil((nameLength + 1) / 2) * 2;
      const dataLengthPosition = position + 7 + paddedNameLength - 1;
      const resourceLengthBuffer = await readAt(handle, 4, dataLengthPosition);
      if (!resourceLengthBuffer) return null;

      const dataLength = resourceLengthBuffer.readUInt32BE(0);
      const dataPosition = dataLengthPosition + 4;
      const resourceEnd = dataPosition + dataLength;
      if (resourceEnd > resourcesEnd) return null;

      if (resourceId === 1036 && dataLength >= 28) {
        const thumbnailHeader = await readAt(handle, 28, dataPosition);
        if (!thumbnailHeader) return null;

        const format = thumbnailHeader.readUInt32BE(0);
        const compressedSize = thumbnailHeader.readUInt32BE(20);
        if (format === 1 && compressedSize > 0 &&
            compressedSize <= MAX_THUMBNAIL_SIZE && compressedSize <= dataLength - 28) {
          const thumbnailBuffer = await readAt(handle, compressedSize, dataPosition + 28);
          if (!thumbnailBuffer) return null;
          return { width, height, thumbnailBuffer };
        }
      }

      position = resourceEnd + (dataLength % 2);
    }

    return { width, height, thumbnailBuffer: null };
  } finally {
    await handle.close();
  }
}

module.exports = { readPsdPreviewData };
