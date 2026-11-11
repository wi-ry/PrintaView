const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const hashCache = new Map();

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function getCacheKey(filePath) {
  const resolvedPath = path.resolve(filePath);
  return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

async function findDuplicateGroups(entries, concurrency = 4) {
  const entriesBySize = new Map();
  for (const entry of entries) {
    if (entry.isDirectory || entry.stats?.isDirectory()) continue;
    const size = Number(entry.size ?? entry.stats?.size);
    if (!Number.isFinite(size)) continue;
    if (!entriesBySize.has(size)) entriesBySize.set(size, []);
    entriesBySize.get(size).push(entry);
  }

  const candidates = [...entriesBySize.values()].filter((group) => group.length > 1).flat();
  const hashes = new Map();
  const skippedFiles = [];
  const candidateCacheKeys = new Set(candidates.map((entry) =>
    getCacheKey(entry.path ?? entry.absolutePath)
  ));
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, candidates.length) },
    async () => {
      while (nextIndex < candidates.length) {
        const entry = candidates[nextIndex++];
        const filePath = entry.path ?? entry.absolutePath;
        const cacheKey = getCacheKey(filePath);
        const size = Number(entry.size ?? entry.stats?.size);
        const modifiedTimeMs = Number(entry.modifiedTimeMs ?? entry.stats?.mtimeMs) || 0;
        const cached = hashCache.get(cacheKey);
        let digest;
        try {
          digest = cached && cached.size === size && cached.modifiedTimeMs === modifiedTimeMs
            ? cached.digest
            : await hashFile(filePath);
        } catch (error) {
          hashCache.delete(cacheKey);
          skippedFiles.push({
            path: filePath,
            name: entry.name ?? path.basename(filePath),
            message: error.message
          });
          continue;
        }
        hashCache.set(cacheKey, { size, modifiedTimeMs, digest });
        if (!hashes.has(digest)) hashes.set(digest, []);
        hashes.get(digest).push(entry);
      }
    }
  );
  await Promise.all(workers);
  for (const cacheKey of hashCache.keys()) {
    if (!candidateCacheKeys.has(cacheKey)) hashCache.delete(cacheKey);
  }

  const groups = [...hashes.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      size: Number(group[0].size ?? group[0].stats?.size),
      files: group.map((entry) => ({
        path: entry.path ?? entry.absolutePath,
        name: entry.name ?? path.basename(entry.path ?? entry.absolutePath),
        createdTimeMs: entry.createdTimeMs ?? entry.stats?.birthtimeMs ?? null,
        modifiedTimeMs: entry.modifiedTimeMs ?? entry.stats?.mtimeMs ?? null
      })).sort((a, b) => a.path.localeCompare(b.path))
    }))
    .sort((a, b) => a.files[0].path.localeCompare(b.files[0].path));

  return { groups, skippedFiles };
}

module.exports = { findDuplicateGroups };
