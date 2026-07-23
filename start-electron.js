const { spawn } = require('child_process');
const http = require('http');

const MAX_RETRIES = 40;
let retries = 0;

function check(cb) {
  http.get('http://localhost:5173', () => cb()).on('error', () => {
    if (++retries >= MAX_RETRIES) { console.error('Vite timeout'); process.exit(1); }
    setTimeout(() => check(cb), 500);
  });
}

console.log('[launcher] Menunggu Vite...');
check(() => {
  console.log('[launcher] Membuka Electron...');
  const electron = require('electron');
  const proc = spawn(String(electron), ['.', '--dev'], { stdio: 'inherit' });
  proc.on('close', code => process.exit(code || 0));
});
