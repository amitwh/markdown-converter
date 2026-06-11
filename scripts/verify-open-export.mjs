import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/home/amith/apps/markdown-converter';
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

const testMd = '/tmp/verify-test.md';
const outputDocx = '/tmp/verify-output.docx';
const outputHtml = '/tmp/verify-output.html';

// Cleanup previous outputs
if (fs.existsSync(testMd)) fs.unlinkSync(testMd);
if (fs.existsSync(outputDocx)) fs.unlinkSync(outputDocx);
if (fs.existsSync(outputHtml)) fs.unlinkSync(outputHtml);

// Write test Markdown file
fs.writeFileSync(
  testMd,
  '# Test Document\n\nThis is a verification test for opening and exporting.\n\n- Point A\n- Point B\n'
);

console.log('Launching Electron...');
const app = await electron.launch({
  executablePath: electronBin,
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-dev-shm-usage',
    '.',
  ],
  env: {
    ...process.env,
    DISPLAY: ':0',
    ELECTRON_DISABLE_SANDBOX: '1',
    VITE_DEV_SERVER_URL: 'http://localhost:5173',
  },
  cwd: APP_DIR,
});

app.process().stdout.on('data', (data) => console.log('[MAIN-OUT]', data.toString().trim()));
app.process().stderr.on('data', (data) => console.log('[MAIN-ERR]', data.toString().trim()));

const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await win.waitForSelector('.cm-editor, [role="toolbar"]', { timeout: 10000 });
console.log('App loaded.');

// Dismiss welcome wizard if present
const wizardCount = await win.locator('[data-testid="first-run-wizard"]').count();
if (wizardCount > 0) {
  console.log('Dismissing first run wizard...');
  await win.click('[data-testid="first-run-wizard"] >> text=Skip');
  await new Promise((r) => setTimeout(r, 300));
}

// Stub dialog.showSaveDialogSync in main process to automatically return output paths
await app.evaluate(({ dialog }, { outputDocx, outputHtml }) => {
  dialog.showSaveDialogSync = (window, options) => {
    const filters = options?.filters || [];
    if (filters.some(f => f.extensions.includes('docx'))) {
      return outputDocx;
    }
    return outputHtml;
  };
}, { outputDocx, outputHtml });

// Simulate opening the test Md file by sending IPC from main
console.log('Opening test markdown file...');
const fileContent = fs.readFileSync(testMd, 'utf-8');
await app.evaluate(({ BrowserWindow }, { filePath, content }) => {
  const wins = BrowserWindow.getAllWindows();
  const main = wins.find((w) => !w.isDestroyed());
  if (!main) throw new Error('No main window');
  main.webContents.send('file-opened', { path: filePath, content });
}, { filePath: testMd, content: fileContent });

// Wait for editor to display the content
await win.waitForFunction(
  (content) => {
    const editor = document.querySelector('.cm-content');
    return editor && editor.textContent.includes('Test Document');
  },
  fileContent,
  { timeout: 5000 }
);
console.log('File successfully opened in editor.');

// Let's wait a moment for currentFile synchronization to trigger in the main process
await new Promise((r) => setTimeout(r, 500));


// Trigger DOCX Export (calls performExportWithOptions under the hood)
console.log('Exporting to DOCX...');
await win.evaluate(() => {
  window.electronAPI.export.withOptions('docx', {});
});

// Wait for file to be written to disk
let docxExported = false;
for (let i = 0; i < 20; i++) {
  if (fs.existsSync(outputDocx) && fs.statSync(outputDocx).size > 0) {
    docxExported = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}

if (docxExported) {
  console.log('✅ DOCX exported successfully.');
} else {
  console.error('❌ DOCX export failed (file not created or empty).');
}

// Wait 2.5 seconds to bypass the conversion rate limiter (2000ms debounce)
console.log('Waiting for rate limiter...');
await new Promise((r) => setTimeout(r, 2500));

// Trigger HTML Export
console.log('Exporting to HTML...');
await win.evaluate(() => {
  window.electronAPI.export.withOptions('html', {});
});

let htmlExported = false;
for (let i = 0; i < 20; i++) {
  if (fs.existsSync(outputHtml) && fs.statSync(outputHtml).size > 0) {
    htmlExported = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}

if (htmlExported) {
  console.log('✅ HTML exported successfully.');
} else {
  console.error('❌ HTML export failed (file not created or empty).');
}

await app.close();
console.log('Verification completed.');

if (docxExported && htmlExported) {
  process.exit(0);
} else {
  process.exit(1);
}
