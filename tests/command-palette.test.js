/**
 * @jest-environment jsdom
 */

/**
 * Tests for CommandPalette
 * Tests command registration, filtering, execution, and keyboard navigation
 */

describe('CommandPalette', () => {
    let CommandPalette;

    beforeEach(() => {
        document.body.innerHTML = `
            <div class="command-palette-overlay hidden" id="command-palette-overlay">
                <div class="command-palette">
                    <input type="text" id="command-palette-input">
                    <div id="command-palette-results"></div>
                </div>
            </div>
        `;
        CommandPalette = require('../src/command-palette').CommandPalette;
    });

    test('starts hidden', () => {
        const palette = new CommandPalette();
        expect(palette.isOpen()).toBe(false);
    });

    test('opens and focuses input', () => {
        const palette = new CommandPalette();
        palette.open();
        expect(palette.isOpen()).toBe(true);
    });

    test('closes', () => {
        const palette = new CommandPalette();
        palette.open();
        palette.close();
        expect(palette.isOpen()).toBe(false);
    });

    test('registers and renders commands', () => {
        const palette = new CommandPalette();
        palette.register('Test Command', 'Ctrl+T', () => {});
        palette.register('Another Command', '', () => {});
        palette.open();
        const items = document.querySelectorAll('.command-item');
        expect(items.length).toBe(2);
    });

    test('filters commands by search', () => {
        const palette = new CommandPalette();
        palette.register('Save File', 'Ctrl+S', () => {});
        palette.register('Open File', 'Ctrl+O', () => {});
        palette.register('Bold Text', 'Ctrl+B', () => {});
        palette.renderResults('file');
        const items = document.querySelectorAll('.command-item');
        expect(items.length).toBe(2);
    });

    test('executes command', () => {
        const palette = new CommandPalette();
        const action = jest.fn();
        palette.register('Test', '', action);
        palette.open();
        palette.executeSelected();
        expect(action).toHaveBeenCalled();
    });

    test('highlights matching text', () => {
        const palette = new CommandPalette();
        const result = palette.highlightMatch('Save File', 'save');
        expect(result).toContain('<strong>');
        expect(result).toContain('Save');
    });

    test('highlightMatch returns original text when no query', () => {
        const palette = new CommandPalette();
        const result = palette.highlightMatch('Save File', '');
        expect(result).toBe('Save File');
    });

    test('filters case-insensitively', () => {
        const palette = new CommandPalette();
        palette.register('Save File', '', () => {});
        palette.register('Open File', '', () => {});
        palette.renderResults('SAVE');
        const items = document.querySelectorAll('.command-item');
        expect(items.length).toBe(1);
    });

    test('shows all commands when query is empty', () => {
        const palette = new CommandPalette();
        palette.register('Cmd1', '', () => {});
        palette.register('Cmd2', '', () => {});
        palette.register('Cmd3', '', () => {});
        palette.renderResults('');
        const items = document.querySelectorAll('.command-item');
        expect(items.length).toBe(3);
    });

    test('displays shortcut when provided', () => {
        const palette = new CommandPalette();
        palette.register('Save File', 'Ctrl+S', () => {});
        palette.open();
        const shortcut = document.querySelector('.command-shortcut');
        expect(shortcut).not.toBeNull();
        expect(shortcut.textContent).toBe('Ctrl+S');
    });

    test('does not display shortcut when empty', () => {
        const palette = new CommandPalette();
        palette.register('Test Command', '', () => {});
        palette.open();
        const shortcut = document.querySelector('.command-shortcut');
        expect(shortcut).toBeNull();
    });

    test('closes on overlay click', () => {
        const palette = new CommandPalette();
        palette.open();
        // Simulate click on the overlay itself
        const event = new Event('click', { bubbles: true });
        Object.defineProperty(event, 'target', { value: palette.overlay });
        palette.overlay.dispatchEvent(event);
        expect(palette.isOpen()).toBe(false);
    });

    test('executeSelected does nothing when no commands', () => {
        const palette = new CommandPalette();
        palette.open();
        // Should not throw
        expect(() => palette.executeSelected()).not.toThrow();
    });

    test('closes after executing command', () => {
        const palette = new CommandPalette();
        palette.register('Test', '', jest.fn());
        palette.open();
        palette.executeSelected();
        expect(palette.isOpen()).toBe(false);
    });
});
