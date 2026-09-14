/**
 * @jest-environment jsdom
 *
 * Daily-templates sidebar panel tests.
 */
const { renderDailyTemplatesPanel } = require('../src/sidebar/daily-templates-panel');

function mountPanel(deps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = renderDailyTemplatesPanel(container, {
    listTemplates: deps.listTemplates || jest.fn().mockResolvedValue([]),
    saveTemplate:
      deps.saveTemplate || jest.fn().mockResolvedValue({ name: 'x.md', label: 'X', content: '' }),
    deleteTemplate: deps.deleteTemplate || jest.fn().mockResolvedValue(true),
    applyTemplate:
      deps.applyTemplate ||
      jest.fn().mockResolvedValue({ path: '/d/2026-09-14.md', content: '', created: true }),
    onOpenFile: deps.onOpenFile || jest.fn(),
    ...deps,
  });
  return { container, api };
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('renderDailyTemplatesPanel — mounting', () => {
  test('mounts the panel structure', () => {
    const { container } = mountPanel();
    expect(container.querySelector('.daily-templates-panel')).not.toBeNull();
    expect(container.querySelector('#daily-templates-new')).not.toBeNull();
    expect(container.querySelector('#daily-templates-refresh')).not.toBeNull();
  });

  test('shows the empty state when there are no templates', async () => {
    const { container } = mountPanel({ listTemplates: jest.fn().mockResolvedValue([]) });
    await flush();
    expect(container.querySelector('.daily-templates-empty')).not.toBeNull();
  });

  test('renders one row per template', async () => {
    const { container } = mountPanel({
      listTemplates: jest.fn().mockResolvedValue([
        { name: 'morning-pages.md', label: 'Morning Pages', content: '# Morning' },
        { name: 'evening.md', label: 'Evening', content: '# Evening' },
      ]),
    });
    await flush();
    const items = container.querySelectorAll('.daily-templates-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Morning Pages');
    expect(items[1].textContent).toContain('Evening');
  });

  test('escapeHtml-style safety: a label with <script> does not produce a node', async () => {
    const { container } = mountPanel({
      listTemplates: jest
        .fn()
        .mockResolvedValue([{ name: 'evil.md', label: '<script>alert(1)</script>', content: '' }]),
    });
    await flush();
    expect(container.querySelector('script')).toBeNull();
    // The literal text survives in the row (textContent keeps it visible as
    // text rather than as a node — the safety we want).
    expect(container.querySelector('.daily-templates-item').textContent).toContain('<script>');
  });
});

describe('renderDailyTemplatesPanel — Use button', () => {
  test('clicking Use applies the template and opens the resulting file', async () => {
    const applyTemplate = jest.fn().mockResolvedValue({ path: '/d/2026-09-14.md', created: true });
    const onOpenFile = jest.fn();
    const { container } = mountPanel({
      applyTemplate,
      onOpenFile,
      listTemplates: jest
        .fn()
        .mockResolvedValue([{ name: 'morning.md', label: 'Morning', content: '# M' }]),
    });
    await flush();
    container.querySelector('[data-action="apply"]').click();
    await flush();
    expect(applyTemplate).toHaveBeenCalledWith({ templateName: 'morning.md' });
    expect(onOpenFile).toHaveBeenCalledWith('/d/2026-09-14.md');
  });

  test('reports an error when applyTemplate rejects', async () => {
    const applyTemplate = jest.fn().mockRejectedValue(new Error('write fail'));
    const listTemplates = jest
      .fn()
      .mockResolvedValue([{ name: 'morning.md', label: 'Morning', content: '' }]);
    const { container } = mountPanel({ applyTemplate, listTemplates });
    await flush();
    container.querySelector('[data-action="apply"]').click();
    await flush();
    expect(container.querySelector('#daily-templates-status').textContent).toMatch(/write fail/);
  });
});

describe('renderDailyTemplatesPanel — Delete button', () => {
  test('clicking Delete calls deleteTemplate and refreshes the list', async () => {
    const deleteTemplate = jest.fn().mockResolvedValue(true);
    const listTemplates = jest
      .fn()
      .mockResolvedValueOnce([
        { name: 'a.md', label: 'A', content: '' },
        { name: 'b.md', label: 'B', content: '' },
      ])
      .mockResolvedValueOnce([{ name: 'a.md', label: 'A', content: '' }]);
    const { container } = mountPanel({ deleteTemplate, listTemplates });
    await flush();
    // Click the SECOND delete button (b.md).
    const deleteButtons = container.querySelectorAll('[data-action="delete"]');
    deleteButtons[1].click();
    await flush();
    expect(deleteTemplate).toHaveBeenCalledWith({ name: 'b.md' });
    expect(container.querySelectorAll('.daily-templates-item')).toHaveLength(1);
  });

  test('refuses to delete the last template (would break the default)', async () => {
    const deleteTemplate = jest.fn();
    const { container } = mountPanel({
      deleteTemplate,
      listTemplates: jest.fn().mockResolvedValue([{ name: 'only.md', label: 'Only', content: '' }]),
    });
    await flush();
    container.querySelector('[data-action="delete"]').click();
    await flush();
    expect(deleteTemplate).not.toHaveBeenCalled();
    expect(container.querySelector('#daily-templates-status').textContent).toMatch(/at least one/);
  });
});

describe('renderDailyTemplatesPanel — New template', () => {
  test('clicking + New prompts for name + content, then saves', async () => {
    const saveTemplate = jest
      .fn()
      .mockResolvedValue({ name: 'custom.md', label: 'Custom', content: '# X' });
    window.prompt = jest.fn().mockReturnValueOnce('custom').mockReturnValueOnce('# X');

    const { container } = mountPanel({ saveTemplate });
    await flush();
    container.querySelector('#daily-templates-new').click();
    await flush();

    expect(saveTemplate).toHaveBeenCalledWith({ name: 'custom', content: '# X' });
    expect(container.querySelector('#daily-templates-status').textContent).toMatch(/Saved/);
  });

  test('cancelling the name prompt does nothing', async () => {
    const saveTemplate = jest.fn();
    window.prompt = jest.fn().mockReturnValueOnce(null);

    const { container } = mountPanel({ saveTemplate });
    await flush();
    container.querySelector('#daily-templates-new').click();
    await flush();

    expect(saveTemplate).not.toHaveBeenCalled();
  });
});

describe('renderDailyTemplatesPanel — refresh', () => {
  test('refresh button re-fetches the list', async () => {
    const listTemplates = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'a.md', label: 'A', content: '' }]);
    const { container, api } = mountPanel({ listTemplates });
    await flush();
    expect(container.querySelectorAll('.daily-templates-item')).toHaveLength(0);

    api.refresh();
    await flush();
    expect(container.querySelectorAll('.daily-templates-item')).toHaveLength(1);
    expect(listTemplates).toHaveBeenCalledTimes(2);
  });

  test('shows an error when listTemplates rejects', async () => {
    const { container } = mountPanel({
      listTemplates: jest.fn().mockRejectedValue(new Error('nope')),
    });
    await flush();
    expect(container.querySelector('#daily-templates-status').textContent).toMatch(/nope/);
  });
});
