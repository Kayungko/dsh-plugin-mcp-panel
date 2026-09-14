// deploy.mjs — deploy dsh-plugin-mcp-panel into the DSH desktop profile.
// Copy-based install into the hoisted profile node_modules (the same physical
// layout as dsh-plugin-task-coordinator / @openviking/dsh-memory-plugin),
// mirroring plugin/install.ps1 but using Node JSON round-trips (safer than
// PowerShell ConvertTo-Json for the large .package-map.json).
//
// Usage: node deploy.mjs  (from the mcp-panel directory)

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = 'dsh-plugin-mcp-panel';
const profile = join(homedir(), '.dsh', 'profiles', 'desktop');
const target = join(profile, 'node_modules', PKG);
const manifestPath = join(profile, 'package.json');
const packageMapPath = join(profile, 'node_modules', '.package-map.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p, obj) => writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');

// --- backup -----------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(__dirname, 'backups', `deploy-${stamp}`);
mkdirSync(backupDir, { recursive: true });
copyFileSync(manifestPath, join(backupDir, 'profile-package.json'));
if (existsSync(packageMapPath)) copyFileSync(packageMapPath, join(backupDir, 'package-map.json'));
console.log(`backup -> ${backupDir}`);

// --- copy plugin files (real directory, hoisted layout) ---------------------
mkdirSync(target, { recursive: true });
const files = ['package.json', 'cordis.patch.yml', 'index.mjs', 'config.mjs', 'list.mjs', 'commands.mjs', 'client.js', 'README.md'];
for (const f of files) {
  const from = join(__dirname, f);
  if (existsSync(from)) copyFileSync(from, join(target, f));
}
console.log(`copied plugin -> ${target}`);

// --- profile manifest: dependency specifier + bundle entry ------------------
const manifest = readJson(manifestPath);
if (!manifest.dependencies || typeof manifest.dependencies !== 'object') manifest.dependencies = {};
manifest.dependencies[PKG] = `file:${__dirname.replace(/\\/g, '/')}`;
const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
if (!bundles.includes(PKG)) bundles.push(PKG);
manifest.dsh = manifest.dsh || {};
manifest.dsh.profile = manifest.dsh.profile || {};
manifest.dsh.profile.bundles = bundles;
writeJson(manifestPath, manifest);
console.log('profile package.json updated (dependencies + bundles)');

// --- pnpm bookkeeping (.package-map.json), additive only --------------------
if (existsSync(packageMapPath)) {
  const map = readJson(packageMapPath);
  map.packages = map.packages || {};
  if (!map.packages[PKG]) {
    map.packages[PKG] = {
      url: `./${PKG}`,
      dependencies: { [PKG]: PKG },
    };
  }
  const root = map.packages['.'] = map.packages['.'] || {};
  root.dependencies = root.dependencies || {};
  if (!(PKG in root.dependencies)) root.dependencies[PKG] = PKG;
  writeJson(packageMapPath, map);
  console.log('.package-map.json updated');
}

console.log('');
console.log('done. Restart DSH Desktop to load the new bundle.');
console.log('After restart: run /mcp in chat, or open Settings → MCP 连接.');
