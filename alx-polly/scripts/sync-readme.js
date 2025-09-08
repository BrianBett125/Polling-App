/*
  Sync the app-level README (alx-polly/README.md) into the repo root (README.md).
  Runs safely multiple times and only rewrites when content differs.
*/

const fs = require('fs');
const path = require('path');

function syncReadme() {
  try {
    const scriptDir = __dirname; // .../alx-polly/scripts
    const appDir = path.resolve(scriptDir, '..'); // .../alx-polly
    const repoRoot = path.resolve(appDir, '..'); // project root

    const src = path.resolve(appDir, 'README.md');
    const dest = path.resolve(repoRoot, 'README.md');

    if (!fs.existsSync(src)) {
      console.error(`[sync-readme] Source README not found at: ${src}`);
      process.exitCode = 1;
      return;
    }

    const srcContent = fs.readFileSync(src, 'utf8');
    const destExists = fs.existsSync(dest);
    const destContent = destExists ? fs.readFileSync(dest, 'utf8') : '';

    if (destExists && srcContent === destContent) {
      console.log('[sync-readme] Root README is already up-to-date.');
      return;
    }

    fs.writeFileSync(dest, srcContent, 'utf8');
    console.log(`[sync-readme] Root README updated from app README → ${path.relative(repoRoot, dest)}`);
  } catch (err) {
    console.error('[sync-readme] Failed to sync README:', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  syncReadme();
}

module.exports = { syncReadme };