import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyMonospaceClasses } from "../../../src/renderer/hooks/use-monospace-classes";

describe('applyMonospaceClasses', () => {
  beforeEach(() => {
    document.body.className = '';
  });
  afterEach(() => {
    document.body.className = '';
  });

  it('applies jetbrains-mono + ligatures-off for default settings', () => {
    applyMonospaceClasses({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(true);
    expect(document.body.classList.contains('mono-ligatures-off')).toBe(true);
  });

  it('applies fira-code + ligatures-on when enabled', () => {
    applyMonospaceClasses({ monospaceFont: 'fira-code', monospaceLigatures: true });
    expect(document.body.classList.contains('mono-fira-code')).toBe(true);
    expect(document.body.classList.contains('mono-ligatures-on')).toBe(true);
  });

  it('strips prior mono-* classes before applying new ones', () => {
    document.body.classList.add('mono-jetbrains-mono', 'mono-ligatures-off');
    applyMonospaceClasses({ monospaceFont: 'fira-code', monospaceLigatures: true });
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(false);
    expect(document.body.classList.contains('mono-ligatures-off')).toBe(false);
    expect(document.body.classList.contains('mono-fira-code')).toBe(true);
  });

  it('falls back to defaults when given null', () => {
    applyMonospaceClasses(null);
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(true);
    expect(document.body.classList.contains('mono-ligatures-off')).toBe(true);
  });
});
