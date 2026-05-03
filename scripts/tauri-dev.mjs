import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const envLocalPath = path.join(root, '.env.local');

const env = { ...process.env };

if (fs.existsSync(envLocalPath)) {
  const contents = fs.readFileSync(envLocalPath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      env[key] = value;
    }
  }
}

let args = process.argv.slice(2);

if (env.TAURI_DEV_HOST && args.includes('dev') && !args.includes('--host')) {
  args.push('--host', env.TAURI_DEV_HOST);
}

const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm exec tauri ' + args.join(' ')], {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
    })
  : spawn('pnpm', ['exec', 'tauri', ...args], {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
    });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
