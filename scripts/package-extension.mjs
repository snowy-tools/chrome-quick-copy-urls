import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const manifestPath = path.join(rootDir, 'manifest.json');

// Chrome拡張の配布物として本当に必要なトップレベル要素だけを許可する。
// 開発用素材や公開用ドキュメントは dist に含めない。
const allowedDirectories = new Set([
  'src',
]);
const allowedFiles = new Set([
  'manifest.json',
]);

/**
 * manifest.json 上で参照されているアイコンだけを dist にコピーする。
 * 未使用のサイズや開発用リソースが誤って配布物に混入しないようにする。
 */
function copyRequiredAssetsFromManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const requiredAssetPaths = new Set();

  // manifest.icons は { size: file } の形式なので、実際に使うアイコンだけ抽出する。
  for (const iconPath of Object.values(manifest.icons ?? {})) {
    if (typeof iconPath !== 'string' || !iconPath.startsWith('assets/')) {
      continue;
    }

    requiredAssetPaths.add(path.resolve(rootDir, iconPath));
  }

  for (const sourcePath of requiredAssetPaths) {
    const sourceRelative = path.relative(rootDir, sourcePath);
    const targetPath = path.join(distDir, sourceRelative);

    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true, force: true });
  }
}

// 既存の dist を削除してから再構築し、古いファイルが残らないようにする。
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

mkdirSync(distDir, { recursive: true });

// 許可されたディレクトリとファイルだけを dist にコピーする。
for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
  const isAllowedDirectory = entry.isDirectory() && allowedDirectories.has(entry.name);
  const isAllowedFile = entry.isFile() && allowedFiles.has(entry.name);

  if (!isAllowedDirectory && !isAllowedFile) {
    continue;
  }

  const sourcePath = path.join(rootDir, entry.name);
  const targetPath = path.join(distDir, entry.name);

  cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

// manifest から実際に必要なアイコンだけを追加コピーする。
copyRequiredAssetsFromManifest();

console.log(`Prepared extension package in ${distDir}`);
