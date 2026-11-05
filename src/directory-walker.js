const fs = require('fs');
const path = require('path');

async function walkDirectoryRecursive(rootDir, fileSystem = fs.promises) {
  const foundEntries = [];
  const stack = [rootDir];
  const visitedDirectories = new Set();

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let realPath;
    let entries;

    try {
      realPath = await fileSystem.realpath(currentDir);
      entries = await fileSystem.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    const visitKey = process.platform === 'win32' ? realPath.toLowerCase() : realPath;
    if (visitedDirectories.has(visitKey)) {
      continue;
    }
    visitedDirectories.add(visitKey);

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      let stats;

      try {
        stats = await fileSystem.stat(absolutePath);
      } catch (error) {
        continue;
      }

      foundEntries.push({ absolutePath, parentPath: currentDir, stats });
      if (stats.isDirectory()) {
        stack.push(absolutePath);
      }
    }
  }

  return foundEntries;
}

module.exports = { walkDirectoryRecursive };
