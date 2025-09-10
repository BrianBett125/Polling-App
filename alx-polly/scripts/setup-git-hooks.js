/*
  Setup script to install Git hooks for README syncing
  Cross-platform script that copies hooks and sets permissions
*/

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function setupGitHooks() {
  try {
    const scriptDir = __dirname;
    const appDir = path.resolve(scriptDir, '..');
    const hooksDir = path.resolve(appDir, '.git', 'hooks');

    // Check if .git directory exists
    if (!fs.existsSync(path.resolve(appDir, '.git'))) {
      console.error('[setup-git-hooks] ERROR: Not a Git repository. Run `git init` first.');
      process.exitCode = 1;
      return;
    }

    // Ensure hooks directory exists
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
      console.log('[setup-git-hooks] Created .git/hooks directory.');
    }

    const hooks = [
      {
        name: 'pre-commit',
        content: `#!/bin/sh
#
# Pre-commit hook to sync README from app to repo root
# Ensures the root README.md is always up-to-date before commits
#

echo "[pre-commit] Syncing README from app to repo root..."

# Run the sync script
node ./scripts/sync-readme.js

# Check if sync was successful
if [ $? -ne 0 ]; then
  echo "[pre-commit] ERROR: README sync failed. Commit aborted."
  exit 1
fi

# Check if root README was updated and needs to be staged
ROOT_README="../README.md"
if [ -f "$ROOT_README" ]; then
  # Check if the root README has changes
  if ! git diff --quiet HEAD -- "$ROOT_README" 2>/dev/null; then
    echo "[pre-commit] Root README was updated. Adding to commit..."
    git add "$ROOT_README"
  fi
fi

echo "[pre-commit] README sync completed successfully."
exit 0
`
      },
      {
        name: 'pre-push',
        content: `#!/bin/sh
#
# Pre-push hook to sync README from app to repo root
# Final safety net to ensure root README is current before pushing
#

echo "[pre-push] Verifying README sync before push..."

# Run the sync script
node ./scripts/sync-readme.js

# Check if sync was successful
if [ $? -ne 0 ]; then
  echo "[pre-push] ERROR: README sync failed. Push aborted."
  echo "[pre-push] Please fix the sync issue and try again."
  exit 1
fi

# Check if there are uncommitted changes to root README
ROOT_README="../README.md"
if [ -f "$ROOT_README" ]; then
  if ! git diff --quiet HEAD -- "$ROOT_README" 2>/dev/null; then
    echo "[pre-push] WARNING: Root README has uncommitted changes after sync."
    echo "[pre-push] Please commit the updated README and push again."
    exit 1
  fi
fi

echo "[pre-push] README sync verification completed successfully."
exit 0
`
      }
    ];

    let installed = 0;
    for (const hook of hooks) {
      const hookPath = path.resolve(hooksDir, hook.name);
      
      // Write hook file
      fs.writeFileSync(hookPath, hook.content, 'utf8');
      
      // Make executable (cross-platform)
      try {
        if (process.platform === 'win32') {
          // Windows: Set full permissions
          execSync(`icacls "${hookPath}" /grant Everyone:F`, { stdio: 'pipe' });
        } else {
          // Unix-like: Set executable permissions
          execSync(`chmod +x "${hookPath}"`, { stdio: 'pipe' });
        }
        console.log(`[setup-git-hooks] Installed ${hook.name} hook.`);
        installed++;
      } catch (err) {
        console.warn(`[setup-git-hooks] Warning: Could not set permissions for ${hook.name}:`, err.message);
        console.log(`[setup-git-hooks] Installed ${hook.name} hook (permissions may need manual setup).`);
        installed++;
      }
    }

    console.log(`[setup-git-hooks] Successfully installed ${installed} Git hooks.`);
    console.log('[setup-git-hooks] README will now sync automatically before commits and pushes.');
  } catch (err) {
    console.error('[setup-git-hooks] Failed to setup Git hooks:', err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  setupGitHooks();
}

module.exports = { setupGitHooks };