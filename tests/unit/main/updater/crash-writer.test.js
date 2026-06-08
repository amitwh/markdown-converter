const fs = require('fs');
const path = require('path');
const os = require('os');
const { CrashWriter } = require('../../../../src/main/updater/crash-writer');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crash-test-'));
}

describe('CrashWriter', () => {
  test('writes a JSON dump for an uncaught exception', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at test.js:1:1';
    writer.handleUncaught(err, 'uncaughtException');
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);
    const data = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8'));
    expect(data.kind).toBe('uncaughtException');
    expect(data.message).toBe('boom');
    expect(data.stack).toContain('test.js:1:1');
    fs.rmSync(dir, { recursive: true });
  });

  test('caps at 20 dumps, pruning oldest', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    for (let i = 0; i < 25; i++) {
      writer.handleUncaught(new Error(`e${i}`), 'unhandledRejection');
    }
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(20);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns the list of dumps', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    writer.handleUncaught(new Error('a'), 'uncaughtException');
    writer.handleUncaught(new Error('b'), 'uncaughtException');
    const list = writer.list();
    expect(list.length).toBe(2);
    fs.rmSync(dir, { recursive: true });
  });

  test('deletes a dump by filename', () => {
    const dir = tmpDir();
    const writer = new CrashWriter(dir);
    writer.handleUncaught(new Error('x'), 'uncaughtException');
    const list = writer.list();
    writer.delete(list[0].filename);
    expect(writer.list().length).toBe(0);
    fs.rmSync(dir, { recursive: true });
  });
});
