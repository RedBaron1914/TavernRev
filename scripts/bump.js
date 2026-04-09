import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const newVersion = process.argv[2];
// Ослабляем регулярку, чтобы она поддерживала SemVer с суффиксами (например, 1.0.0-beta.1 или 1.0.0+build.5)
if (!newVersion || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z\-]+(?:\.[0-9A-Za-z\-]+)*)?(?:\+[0-9A-Za-z\-]+)?$/.test(newVersion)) {
    console.error("❌ Please provide a valid SemVer version number (e.g. 1.0.0, 1.0.0-beta.1, 1.0.0+build.15)");
    process.exit(1);
}

const cleanVersion = newVersion.replace(/^v/, ''); // allow v1.0.0-beta or 1.0.0-beta

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\\]/g, '\\$&');

// package.json
const pkgPath = path.join(root, 'package.json');
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
pkg.version = cleanVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// src-tauri/tauri.conf.json
const tauriConfPath = path.join(root, 'src-tauri', 'tauri.conf.json');
let tauriConf = fs.readFileSync(tauriConfPath, 'utf8');
tauriConf = tauriConf.replace(/"version":\s*"[^"]+"/, `"version": "${cleanVersion}"`);
fs.writeFileSync(tauriConfPath, tauriConf, 'utf8');

// src-tauri/Cargo.toml
const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${cleanVersion}"`);
fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');

// src/Settings.tsx
const settingsPath = path.join(root, 'src', 'Settings.tsx');
let settings = fs.readFileSync(settingsPath, 'utf8');
settings = settings.replace(new RegExp(`TavernRev v${escapeRegExp(oldVersion)}`, 'g'), `TavernRev v${cleanVersion}`);
fs.writeFileSync(settingsPath, settings, 'utf8');

// src/components/character/CharacterSelect.tsx
const charSelectPath = path.join(root, 'src', 'components', 'character', 'CharacterSelect.tsx');
let charSelect = fs.readFileSync(charSelectPath, 'utf8');
charSelect = charSelect.replace(new RegExp(`TavernRev v${escapeRegExp(oldVersion)}`, 'g'), `TavernRev v${cleanVersion}`);
fs.writeFileSync(charSelectPath, charSelect, 'utf8');

console.log(`✅ Bumped version from ${oldVersion} to ${cleanVersion} across all files!`);
