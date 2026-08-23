/**
 * Tests for the File-input path resolution helper (Electron 41 migration).
 * File.path was removed in Electron 32; getFilePath() routes through
 * window.electronAPI.getFilePath (webUtils.getPathForFile) when the bridge is
 * available and falls back to file.path otherwise (older Electron, jsdom).
 */

const { getFilePath } = require('../src/utils/file-path');

describe('getFilePath helper', () => {
  const originalAPI = window.electronAPI;

  afterEach(() => {
    window.electronAPI = originalAPI;
  });

  it('delegates to window.electronAPI.getFilePath when exposed', () => {
    const file = { path: '/stale/file.path' };
    window.electronAPI = { getFilePath: jest.fn(() => '/resolved/report.md') };

    expect(getFilePath(file)).toBe('/resolved/report.md');
    expect(window.electronAPI.getFilePath).toHaveBeenCalledWith(file);
  });

  it('falls back to file.path when the helper is absent', () => {
    const file = { path: '/legacy/electron/file.md' };
    window.electronAPI = { send: jest.fn() }; // no getFilePath on the surface

    expect(getFilePath(file)).toBe('/legacy/electron/file.md');
  });

  it('falls back to file.path when electronAPI is undefined', () => {
    const file = { path: '/no-bridge/file.md' };
    window.electronAPI = undefined;

    expect(getFilePath(file)).toBe('/no-bridge/file.md');
  });
});
