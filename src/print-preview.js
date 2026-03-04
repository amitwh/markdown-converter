class PrintPreview {
    constructor() {
        this.overlay = document.getElementById('print-preview-overlay');
        this._lastContent = '';
        this.setupEventListeners();
    }

    open(htmlContent) {
        this._lastContent = htmlContent;
        this.overlay.classList.remove('hidden');
        this.updatePreview(htmlContent);
        this.updateScaleLabel();
    }

    close() {
        this.overlay.classList.add('hidden');
    }

    setupEventListeners() {
        document.getElementById('print-preview-close')?.addEventListener('click', () => this.close());
        document.getElementById('print-cancel')?.addEventListener('click', () => this.close());
        document.getElementById('print-execute')?.addEventListener('click', () => this.executePrint());

        // Update preview on option changes
        ['print-paper-size', 'print-orientation', 'print-margins'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.refreshPreview());
        });

        // Scale slider
        const scaleSlider = document.getElementById('print-scale');
        scaleSlider?.addEventListener('input', () => this.updateScaleLabel());

        // Page range toggle
        document.getElementById('print-pages')?.addEventListener('change', (e) => {
            const rangeInput = document.getElementById('print-page-range');
            if (rangeInput) {
                rangeInput.classList.toggle('hidden', e.target.value !== 'custom');
            }
        });

        // Close on overlay click
        this.overlay?.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    updateScaleLabel() {
        const scale = document.getElementById('print-scale')?.value || 100;
        const label = document.getElementById('print-scale-value');
        if (label) label.textContent = `${scale}%`;
    }

    updatePreview(htmlContent) {
        const frame = document.getElementById('print-preview-frame');
        if (!frame) return;

        this._lastContent = htmlContent;

        const orientation = document.getElementById('print-orientation')?.value || 'portrait';
        const paperSize = document.getElementById('print-paper-size')?.value || 'A4';

        // Get dimensions for paper size
        const sizes = {
            'A3': { width: '297mm', height: '420mm' },
            'A4': { width: '210mm', height: '297mm' },
            'A5': { width: '148mm', height: '210mm' },
            'Letter': { width: '8.5in', height: '11in' },
            'Legal': { width: '8.5in', height: '14in' },
            'Tabloid': { width: '11in', height: '17in' },
        };

        const size = sizes[paperSize] || sizes['A4'];
        const width = orientation === 'landscape' ? size.height : size.width;
        const height = orientation === 'landscape' ? size.width : size.height;

        const previewHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        margin: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    @page { size: ${width} ${height}; }
                    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
                    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
                    pre code { background: none; padding: 0; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; }
                    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 16px; color: #666; }
                    img { max-width: 100%; }
                    h1, h2, h3 { margin-top: 1.5em; }
                </style>
            </head>
            <body>${htmlContent || ''}</body>
            </html>
        `;

        frame.srcdoc = previewHtml;
    }

    refreshPreview() {
        if (this._lastContent) {
            this.updatePreview(this._lastContent);
        }
    }

    getOptions() {
        return {
            paperSize: document.getElementById('print-paper-size')?.value || 'A4',
            orientation: document.getElementById('print-orientation')?.value || 'portrait',
            margins: document.getElementById('print-margins')?.value || 'default',
            scale: parseInt(document.getElementById('print-scale')?.value || '100'),
            headers: document.getElementById('print-headers')?.checked ?? true,
            background: document.getElementById('print-background')?.checked ?? true,
            pages: document.getElementById('print-pages')?.value || 'all',
            pageRange: document.getElementById('print-page-range')?.value || '',
        };
    }

    executePrint() {
        const options = this.getOptions();
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('do-print-with-options', options);
        this.close();
    }
}

module.exports = { PrintPreview };
