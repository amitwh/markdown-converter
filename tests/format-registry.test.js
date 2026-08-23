const { FormatRegistry } = require('../src/plugins/format-registry');

describe('FormatRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new FormatRegistry();
  });

  test('register — stores an entry retrievable by id', () => {
    const handler = jest.fn();
    registry.register('plugin-a:fmt', { label: 'Format A', extension: 'txt', handler });
    const entry = registry.get('plugin-a:fmt');
    expect(entry).toEqual({ label: 'Format A', extension: 'txt', handler });
  });

  test('get — returns undefined for unknown id', () => {
    expect(registry.get('nope')).toBeUndefined();
  });

  test('register — overwrites an existing id', () => {
    registry.register('plugin-a:fmt', { label: 'First' });
    registry.register('plugin-a:fmt', { label: 'Second' });
    expect(registry.get('plugin-a:fmt').label).toBe('Second');
  });

  test('getAll — returns all entries with id merged in', () => {
    registry.register('plugin-a:fmt', { label: 'Format A', extension: 'txt' });
    registry.register('plugin-b:fmt', { label: 'Format B', extension: 'csv' });
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ id: 'plugin-a:fmt', label: 'Format A', extension: 'txt' });
    expect(all).toContainEqual({ id: 'plugin-b:fmt', label: 'Format B', extension: 'csv' });
  });

  test('getAll — returns empty array when nothing registered', () => {
    expect(registry.getAll()).toEqual([]);
  });
});
