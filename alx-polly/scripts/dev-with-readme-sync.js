/*
  Dev launcher that watches alx-polly/README.md and keeps the repo root README.md in sync
  while running Next.js dev server. Cross-platform, no extra deps.
*/

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');
const readmePath = path.resolve(appDir, 'README.md');

const { syncReadme } = require('./sync-readme');

function debounce(fn, delay = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function startNextDev() {
  // Resolve local next binary for Windows/Linux/Mac
  const bin = path.resolve(appDir, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
  const child = spawn(bin, ['dev'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
  });

  const shutdown = () => {
    try { child.kill('SIGINT'); } catch (_) {}
    process.exit();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);

  return child;
}

function watchReadme() {
  if (!fs.existsSync(readmePath)) {
    console.warn(`[dev-with-readme-sync] README not found at ${readmePath}`);
    return () => {};
  }

  const onChange = debounce(() => {
    try {
      syncReadme();
    } catch (e) {
      console.error('[dev-with-readme-sync] sync failed:', e);
    }
  }, 250);

  try {
    const watcher = fs.watch(readmePath, { persistent: true }, (event) => {
      if (event === 'change' || event === 'rename') onChange();
    });
    console.log('[dev-with-readme-sync] Watching README for changes...');
    return () => watcher.close();
  } catch (e) {
    console.warn('[dev-with-readme-sync] fs.watch not available, falling back to watchFile');
    fs.watchFile(readmePath, { interval: 500 }, onChange);
    return () => fs.unwatchFile(readmePath, onChange);
  }
}

(function main() {
  // Initial sync before starting dev server
  syncReadme();

  const stopWatching = watchReadme();
  const dev = startNextDev();

  dev.on('close', (code) => {
    try { stopWatching && stopWatching(); } catch (_) {}
    process.exit(code ?? 0);
  });
})();