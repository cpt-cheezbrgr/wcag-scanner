/**
 * Server launcher — restarts the server automatically on any exit.
 * Used by `npm start`. Enables the "Restart Server" button in the UI.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'src', 'server.js');

function start() {
  const child = spawn(process.execPath, [serverPath], { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (signal === 'SIGINT' || signal === 'SIGTERM') {
      // Ctrl+C or kill — don't restart
      process.exit(0);
    }
    setTimeout(start, 500);
  });

  // Forward Ctrl+C to child so it can shut down cleanly
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

start();
