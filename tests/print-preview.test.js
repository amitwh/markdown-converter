/**
 * @jest-environment jsdom
 */

/**
 * Tests for PrintPreview
 * Tests print dialog options, open/close, and preview rendering
 */

describe('PrintPreview', () => {
    beforeEach(() => {
        // Mock electron require for executePrint
        jest.mock('electron', () => ({
            ipcRenderer: { send: jest.fn(), invoke: jest.fn() }
        }), { virtual: true });

        document.body.innerHTML = `
            <div class="dialog-overlay hidden" id="print-preview-overlay">
                <button id="print-preview-close"></button>
                <button id="print-cancel"></button>
                <button id="print-execute"></button>
                <select id="print-paper-size"><option value="A4">A4</option><option value="Letter">Letter</option></select>
                <select id="print-orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
                <select id="print-margins"><option value="default">Default</option></select>
                <input type="range" id="print-scale" value="100">
                <span id="print-scale-value">100%</span>
                <input type="checkbox" id="print-headers" checked>
                <input type="checkbox" id="print-background" checked>
                <select id="print-pages"><option value="all">All</option><option value="custom">Custom</option></select>
                <input type="text" id="print-page-range" class="hidden">
                <iframe id="print-preview-frame"></iframe>
            </div>
        `;
    });

    test('getOptions returns default values', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        const options = preview.getOptions();
        expect(options.paperSize).toBe('A4');
        expect(options.orientation).toBe('portrait');
        expect(options.scale).toBe(100);
        expect(options.headers).toBe(true);
        expect(options.background).toBe(true);
        expect(options.pages).toBe('all');
        expect(options.margins).toBe('default');
        expect(options.pageRange).toBe('');
    });

    test('opens and closes', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        preview.open('<p>Test</p>');
        expect(document.getElementById('print-preview-overlay').classList.contains('hidden')).toBe(false);
        preview.close();
        expect(document.getElementById('print-preview-overlay').classList.contains('hidden')).toBe(true);
    });

    test('updateScaleLabel reflects slider value', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        document.getElementById('print-scale').value = '75';
        preview.updateScaleLabel();
        expect(document.getElementById('print-scale-value').textContent).toBe('75%');
    });

    test('close button closes preview', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        preview.open('<p>Test</p>');
        document.getElementById('print-preview-close').click();
        expect(document.getElementById('print-preview-overlay').classList.contains('hidden')).toBe(true);
    });

    test('cancel button closes preview', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        preview.open('<p>Test</p>');
        document.getElementById('print-cancel').click();
        expect(document.getElementById('print-preview-overlay').classList.contains('hidden')).toBe(true);
    });

    test('getOptions reflects changed values', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();

        // Change paper size to Letter
        const paperSelect = document.getElementById('print-paper-size');
        paperSelect.value = 'Letter';

        // Change scale
        document.getElementById('print-scale').value = '50';

        // Uncheck headers
        document.getElementById('print-headers').checked = false;

        const options = preview.getOptions();
        expect(options.paperSize).toBe('Letter');
        expect(options.scale).toBe(50);
        expect(options.headers).toBe(false);
    });

    test('stores last content for refresh', () => {
        const { PrintPreview } = require('../src/print-preview');
        const preview = new PrintPreview();
        preview.open('<p>Hello World</p>');
        expect(preview._lastContent).toBe('<p>Hello World</p>');
    });
});
