/**
 * Starts the Firebase emulators, restores the app's Firestore data once they are
 * ready (npm run emulator:load) and saves it again on Ctrl+C (npm run emulator:save).
 * Auth data still uses the built-in --import / --export-on-exit.
 */
import { spawn, spawnSync } from 'child_process';

const DIR = './emulator-data/current';
const firebase = spawn(
  'npx',
  ['firebase', 'emulators:start', '--project', 'demo-lop-chung-minh', `--import=${DIR}`, `--export-on-exit=${DIR}`],
  { stdio: ['inherit', 'pipe', 'inherit'] }
);
const npm = (script) => spawnSync('npm', ['run', '--silent', script], { stdio: 'inherit' });

let loaded = false;
firebase.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (!loaded && chunk.toString().includes('All emulators ready')) {
    loaded = true;
    npm('emulator:load');
  }
});

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  if (loaded) npm('emulator:save');
  firebase.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
firebase.on('exit', (code) => process.exit(code ?? 0));
