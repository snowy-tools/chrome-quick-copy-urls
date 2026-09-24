import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const excludedEntries = new Set([
  '.git',
  '.github',
  '.idea',
  '.gitignore',
  '.gitattributes',
  'dist',
  'node_modules',
  'scripts',
  'package.json',
  'package-lock.json',
  'release-please-config.json',
  '.release-please-manifest.json',
  'CHANGELOG.md',
  'README.md',
  'quick-url-copy.iml',
]);

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

mkdirSync(distDir, { recursive: true });

for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
  if (excludedEntries.has(entry.name)) {
    continue;
  }

  const sourcePath = path.join(rootDir, entry.name);
  const targetPath = path.join(distDir, entry.name);

  cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

console.log(`Prepared extension package in ${distDir}`);
