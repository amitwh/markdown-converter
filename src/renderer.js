/**
 * MarkdownConverter Renderer Process
 * @version 3.0.0
 */

const { ipcRenderer } = require('electron');
const marked = require('marked');
const { markedHighlight } = require('marked-highlight');
const DOMPurify = require('dompurify');
const hljs = require('highlight.js');
const { createEditor } = require('./editor/codemirror-setup');
const { undo, redo } = require('@codemirror/commands');
const { ModalManager } = require('./utils/ModalManager');
// Lazy-loaded modules — defer heavy imports until first use
let _SidebarManager, _renderTemplatesPanel, _renderExplorerPanel, _renderGitPanel, _renderSnippetsPanel;
let _ReplPanel, _CommandPalette, _PrintPreview, _createWelcomeContent;

function getSidebarManager() { if (!_SidebarManager) _SidebarManager = require('./sidebar/sidebar-manager').SidebarManager; return _SidebarManager; }
function getRenderTemplatesPanel() { if (!_renderTemplatesPanel) _renderTemplatesPanel = require('./sidebar/templates-panel').renderTemplatesPanel; return _renderTemplatesPanel; }
function getRenderExplorerPanel() { if (!_renderExplorerPanel) _renderExplorerPanel = require('./sidebar/explorer-panel').renderExplorerPanel; return _renderExplorerPanel; }
function getRenderGitPanel() { if (!_renderGitPanel) _renderGitPanel = require('./sidebar/git-panel').renderGitPanel; return _renderGitPanel; }
function getRenderSnippetsPanel() { if (!_renderSnippetsPanel) _renderSnippetsPanel = require('./sidebar/snippets-panel').renderSnippetsPanel; return _renderSnippetsPanel; }
function getReplPanel() { if (!_ReplPanel) _ReplPanel = require('./repl/repl-panel').ReplPanel; return _ReplPanel; }
function getCommandPalette() { if (!_CommandPalette) _CommandPalette = require('./command-palette').CommandPalette; return _CommandPalette; }
function getPrintPreview() { if (!_PrintPreview) _PrintPreview = require('./print-preview').PrintPreview; return _PrintPreview; }
function getCreateWelcomeContent() { if (!_createWelcomeContent) _createWelcomeContent = require('./welcome').createWelcomeContent; return _createWelcomeContent; }

// Configure marked with highlight extension
marked.use(markedHighlight({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) {
                console.warn('Syntax highlighting failed for language:', lang, err.message);
            }
        }
        return hljs.highlightAuto(code).value;
    }
}));

marked.use({
    breaks: true,
    gfm: true
});

// Footnotes support
const markedFootnote = require('marked-footnote');
marked.use(markedFootnote());

// Admonitions support (:::note, :::warning, :::tip, :::danger, :::info)
marked.use({
    extensions: [{
        name: 'admonition',
        level: 'block',
        start(src) { return src.match(/^:::(note|warning|tip|danger|info)/m)?.index; },
        tokenizer(src) {
            const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
            if (match) {
                return {
                    type: 'admonition',
                    raw: match[0],
                    admonitionType: match[1],
                    text: match[2].trim()
                };
            }
        },
        renderer(token) {
            const icons = { note: '\u2139', warning: '\u26A0', tip: '\uD83D\uDCA1', danger: '\uD83D\uDD34', info: '\u2139' };
            const icon = icons[token.admonitionType] || '\u2139';
            const inner = this.parser.parse(token.text);
            return `<div class="admonition admonition-${token.admonitionType}">
                <div class="admonition-title">${icon} ${token.admonitionType.charAt(0).toUpperCase() + token.admonitionType.slice(1)}</div>
                <div class="admonition-content">${inner}</div>
            </div>`;
        }
    }]
});

// PlantUML hex encoding for server rendering
function plantumlEncode(text) {
    const hex = Array.from(new TextEncoder().encode(text))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return '~h' + hex;
}

// Tab Management
class TabManager {
    constructor() {
        this.tabs = new Map();
        this.activeTabId = 1;
        this.nextTabId = 2;
        this.isPreviewVisible = true;
        this.showLineNumbers = false;
        this.autoSaveInterval = null;
        this.autoSaveDelay = 30000; // 30 seconds
        this.recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        this.previewDebounceTimers = new Map(); // Debounce timers per tab
        this.previewDebounceDelay = 300; // 300ms debounce

        // Initialize first tab
        this.tabs.set(1, {
            id: 1,
            title: 'Untitled',
            content: '',
            filePath: null,
            isDirty: false,
            editorView: null,
            findMatches: [],
            currentMatchIndex: -1,
            type: 'markdown', // 'markdown' or 'pdf'
            // PDF-specific state
            pdfDoc: null,
            pdfCurrentPage: 1,
            pdfZoomLevel: 1.0,
            pdfRotation: 0
        });

        this.setupEventListeners();
        this.updateUI();
    }
    
    setupEventListeners() {
        // Tab bar events
        document.getElementById('new-tab-btn').addEventListener('click', () => this.createNewTab());
        document.getElementById('tab-bar').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) {
                e.stopPropagation();
                const tabId = parseInt(e.target.closest('.tab').dataset.tabId);
                this.closeTab(tabId);
            } else if (e.target.closest('.tab')) {
                const tabId = parseInt(e.target.closest('.tab').dataset.tabId);
                this.switchToTab(tabId);
            }
        });
        
        // Editor events for active tab
        this.setupEditorEvents();
        
        // Toolbar events
        this.setupToolbarEvents();
        
        // Find dialog events
        this.setupFindEvents();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'n':
                    case 't':
                        e.preventDefault();
                        this.createNewTab();
                        break;
                    case 'w':
                        if (this.tabs.size > 1) {
                            e.preventDefault();
                            this.closeTab(this.activeTabId);
                        }
                        break;
                    case 'Tab':
                        if (this.tabs.size > 1) {
                            e.preventDefault();
                            this.switchToNextTab();
                        }
                        break;
                }
            }
        });
    }
    
    createNewTab(type = 'markdown') {
        const newTabId = this.nextTabId++;
        const tab = {
            id: newTabId,
            title: type === 'pdf' ? 'PDF Document' : 'Untitled',
            content: '',
            filePath: null,
            isDirty: false,
            editorView: null,
            findMatches: [],
            currentMatchIndex: -1,
            type: type,
            // PDF-specific state
            pdfDoc: null,
            pdfCurrentPage: 1,
            pdfZoomLevel: 1.0,
            pdfRotation: 0
        };

        this.tabs.set(newTabId, tab);
        this.createTabElements(tab);
        this.switchToTab(newTabId);
        this.startAutoSave();
        this.updateTabBar();
    }

    createPdfTab(filePath) {
        const newTabId = this.nextTabId++;
        const fileName = require('path').basename(filePath);
        const tab = {
            id: newTabId,
            title: fileName,
            content: '',
            filePath: filePath,
            isDirty: false,
            editorView: null,
            findMatches: [],
            currentMatchIndex: -1,
            type: 'pdf',
            // PDF-specific state
            pdfDoc: null,
            pdfCurrentPage: 1,
            pdfZoomLevel: 1.0,
            pdfRotation: 0
        };

        this.tabs.set(newTabId, tab);
        this.createPdfTabElements(tab);
        this.switchToTab(newTabId);
        this.loadPdfInTab(tab.id, filePath);
        this.updateTabBar();
        return tab.id;
    }

    createPdfTabElements(tab) {
        // Create PDF tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.id = `tab-content-${tab.id}`;
        tabContent.dataset.tabId = tab.id;
        tabContent.dataset.tabType = 'pdf';

        tabContent.innerHTML = `
            <div class="pdf-tab-container" id="pdf-container-${tab.id}">
                <div class="pdf-controls">
                    <button class="pdf-nav-btn" data-action="prev" title="Previous Page">◀</button>
                    <input type="number" class="pdf-page-input" id="pdf-page-${tab.id}" value="1" min="1">
                    <span class="pdf-page-info">/ <span id="pdf-total-${tab.id}">1</span></span>
                    <button class="pdf-nav-btn" data-action="next" title="Next Page">▶</button>
                    <button class="pdf-zoom-btn" data-action="zoom-out" title="Zoom Out">−</button>
                    <span class="pdf-zoom-level" id="pdf-zoom-${tab.id}">100%</span>
                    <button class="pdf-zoom-btn" data-action="zoom-in" title="Zoom In">+</button>
                    <button class="pdf-zoom-btn" data-action="fit-width" title="Fit Width">↔</button>
                    <button class="pdf-rotate-btn" data-action="rotate-left" title="Rotate Left">↺</button>
                    <button class="pdf-rotate-btn" data-action="rotate-right" title="Rotate Right">↻</button>
                </div>
                <div class="pdf-canvas-container">
                    <canvas id="pdf-canvas-${tab.id}"></canvas>
                </div>
            </div>
        `;

        document.querySelector('.editor-container').appendChild(tabContent);

        // Add event listeners for PDF controls
        this.setupPdfTabEvents(tab.id);
    }

    setupPdfTabEvents(tabId) {
        const container = document.getElementById(`pdf-container-${tabId}`);
        if (!container) return;

        container.addEventListener('click', async (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            const tab = this.tabs.get(tabId);
            if (!tab || !tab.pdfDoc) return;

            switch (action) {
                case 'prev':
                    if (tab.pdfCurrentPage > 1) {
                        tab.pdfCurrentPage--;
                        await this.renderPdfPageInTab(tabId);
                    }
                    break;
                case 'next':
                    if (tab.pdfCurrentPage < tab.pdfDoc.numPages) {
                        tab.pdfCurrentPage++;
                        await this.renderPdfPageInTab(tabId);
                    }
                    break;
                case 'zoom-out':
                    if (tab.pdfZoomLevel > 0.25) {
                        tab.pdfZoomLevel -= 0.25;
                        await this.renderPdfPageInTab(tabId);
                    }
                    break;
                case 'zoom-in':
                    if (tab.pdfZoomLevel < 4.0) {
                        tab.pdfZoomLevel += 0.25;
                        await this.renderPdfPageInTab(tabId);
                    }
                    break;
                case 'fit-width':
                    const page = await tab.pdfDoc.getPage(tab.pdfCurrentPage);
                    const viewport = page.getViewport({ scale: 1, rotation: tab.pdfRotation });
                    const containerWidth = container.querySelector('.pdf-canvas-container').clientWidth - 40;
                    tab.pdfZoomLevel = containerWidth / viewport.width;
                    await this.renderPdfPageInTab(tabId);
                    break;
                case 'rotate-left':
                    tab.pdfRotation = (tab.pdfRotation - 90 + 360) % 360;
                    await this.renderPdfPageInTab(tabId);
                    break;
                case 'rotate-right':
                    tab.pdfRotation = (tab.pdfRotation + 90) % 360;
                    await this.renderPdfPageInTab(tabId);
                    break;
            }
        });

        // Page input handler
        const pageInput = document.getElementById(`pdf-page-${tabId}`);
        if (pageInput) {
            pageInput.addEventListener('change', async (e) => {
                const tab = this.tabs.get(tabId);
                const pageNum = parseInt(e.target.value);
                if (tab && tab.pdfDoc && pageNum >= 1 && pageNum <= tab.pdfDoc.numPages) {
                    tab.pdfCurrentPage = pageNum;
                    await this.renderPdfPageInTab(tabId);
                }
            });
        }
    }

    async loadPdfInTab(tabId, filePath) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            document.getElementById('status-text').textContent = 'Loading PDF...';

            const loadingTask = getPdfjsLib().getDocument(filePath);
            tab.pdfDoc = await loadingTask.promise;
            tab.pdfCurrentPage = 1;
            tab.pdfZoomLevel = 1.0;
            tab.pdfRotation = 0;

            // Update UI
            document.getElementById(`pdf-total-${tabId}`).textContent = tab.pdfDoc.numPages;
            document.getElementById(`pdf-page-${tabId}`).value = 1;
            document.getElementById(`pdf-page-${tabId}`).max = tab.pdfDoc.numPages;
            document.getElementById(`pdf-zoom-${tabId}`).textContent = '100%';

            await this.renderPdfPageInTab(tabId);

            document.getElementById('status-text').textContent = `PDF: ${tab.title} (${tab.pdfDoc.numPages} pages)`;
        } catch (error) {
            console.error('Error loading PDF:', error);
            document.getElementById('status-text').textContent = 'Error loading PDF';
            alert('Error loading PDF: ' + error.message);
        }
    }

    async renderPdfPageInTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.pdfDoc) return;

        try {
            const page = await tab.pdfDoc.getPage(tab.pdfCurrentPage);
            const canvas = document.getElementById(`pdf-canvas-${tabId}`);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: tab.pdfZoomLevel, rotation: tab.pdfRotation });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            // Update UI
            document.getElementById(`pdf-page-${tabId}`).value = tab.pdfCurrentPage;
            document.getElementById(`pdf-zoom-${tabId}`).textContent = Math.round(tab.pdfZoomLevel * 100) + '%';
        } catch (error) {
            console.error('Error rendering PDF page:', error);
        }
    }
    
    createTabElements(tab) {
        // Create tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.id = `tab-content-${tab.id}`;
        tabContent.dataset.tabId = tab.id;

        tabContent.innerHTML = `
            <div id="editor-pane-${tab.id}" class="pane">
                <div class="editor-wrapper">
                    <div id="editor-cm-${tab.id}" class="codemirror-container"></div>
                </div>
            </div>
            <div class="pane-resizer" id="pane-resizer-${tab.id}" title="Drag to resize"></div>
            <div id="preview-pane-${tab.id}" class="pane">
                <div id="preview-${tab.id}" class="preview-content"></div>
            </div>
        `;

        document.querySelector('.editor-container').appendChild(tabContent);

        // Initialize CodeMirror editor
        const editorContainer = document.getElementById(`editor-cm-${tab.id}`);
        if (editorContainer) {
            const isDark = document.body.className.includes('dark');
            tab.editorView = createEditor(editorContainer, {
                content: tab.content,
                onChange: (newContent) => {
                    tab.content = newContent;
                    tab.isDirty = true;
                    this.updatePreview(tab.id);
                    this.updateWordCount();
                    this.updateTabBar();
                },
                onUpdate: (view) => {
                    this.updateCursorPosition(view);
                },
                isDark,
                showLineNumbers: this.showLineNumbers,
            });
        }
    }
    
    switchToTab(tabId) {
        if (!this.tabs.has(tabId)) return;
        
        // Save current tab state before switching
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            this.saveCurrentTabState();
        }
        
        this.activeTabId = tabId;
        this.updateUI();
        this.restoreTabState(tabId);
        this.focusActiveEditor();
        this.updateFilePath();
        this.updateBreadcrumb();

        // Update cursor position for the newly active tab
        const tabForCursor = this.tabs.get(tabId);
        if (tabForCursor?.editorView) {
            this.updateCursorPosition(tabForCursor.editorView);
        }

        // Notify main process about current file for exports
        const tab = this.tabs.get(tabId);
        if (tab?.filePath) {
            ipcRenderer.send('set-current-file', tab.filePath);
        }
    }
    
    switchToNextTab() {
        const tabIds = Array.from(this.tabs.keys());
        const currentIndex = tabIds.indexOf(this.activeTabId);
        const nextIndex = (currentIndex + 1) % tabIds.length;
        this.switchToTab(tabIds[nextIndex]);
    }
    
    closeTab(tabId) {
        if (this.tabs.size === 1) return; // Don't close the last tab

        const tab = this.tabs.get(tabId);
        if (!tab) return;

        if (tab.isDirty && tab.type === 'markdown') {
            // Show confirmation dialog for unsaved changes (only for markdown)
            const result = confirm('You have unsaved changes. Do you want to close this tab without saving?');
            if (!result) return;
        }

        // Destroy CodeMirror view (for markdown tabs)
        if (tab?.editorView) {
            tab.editorView.destroy();
        }

        // Destroy PDF document (for PDF tabs)
        if (tab?.pdfDoc) {
            try {
                tab.pdfDoc.destroy();
            } catch (e) {
                console.warn('Error destroying PDF:', e);
            }
        }

        // Remove tab elements
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        const tabContent = document.getElementById(`tab-content-${tabId}`);

        if (tabElement?.classList.contains('tab')) {
            tabElement.remove();
        }
        if (tabContent) {
            tabContent.remove();
        }

        this.tabs.delete(tabId);
        
        // Switch to another tab if this was active
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            this.switchToTab(remainingTabs[0]);
        }
        
        this.updateTabBar();
    }
    
    updateTabBar() {
        const tabBar = document.getElementById('tab-bar');
        const existingTabs = tabBar.querySelectorAll('.tab');
        
        // Remove all existing tab elements except the new tab button
        existingTabs.forEach(tab => tab.remove());
        
        // Add tabs in order
        const sortedTabs = Array.from(this.tabs.values()).sort((a, b) => a.id - b.id);
        const newTabBtn = document.getElementById('new-tab-btn');
        
        sortedTabs.forEach(tab => {
            const tabElement = document.createElement('div');
            const typeClass = tab.type === 'pdf' ? 'pdf-tab' : 'markdown-tab';
            tabElement.className = `tab ${typeClass} ${tab.id === this.activeTabId ? 'active' : ''}`;
            tabElement.dataset.tabId = tab.id;
            tabElement.dataset.tabType = tab.type || 'markdown';

            const title = tab.filePath ?
                tab.filePath.split('/').pop() :
                tab.title;

            const dirtyIndicator = tab.isDirty ? ' •' : '';
            const typeIndicator = tab.type === 'pdf' ? '📄 ' : '';

            tabElement.innerHTML = `
                <span class="tab-title">${typeIndicator}${title}${dirtyIndicator}</span>
                <button class="tab-close" title="Close tab">×</button>
            `;

            tabBar.insertBefore(tabElement, newTabBtn);
        });
    }

    updateUI() {
        // Show/hide tab contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const activeContent = document.getElementById(`tab-content-${this.activeTabId}`);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        // Get active tab to check type
        const activeTab = this.tabs.get(this.activeTabId);

        // Show/hide toolbar based on tab type
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            if (activeTab?.type === 'pdf') {
                toolbar.classList.add('hidden');
            } else {
                toolbar.classList.remove('hidden');
            }
        }

        // Update preview visibility (only for markdown tabs)
        if (activeTab?.type !== 'pdf') {
            this.updatePreviewVisibility();
            this.updateLineNumbers();
        }

        this.updateTabBar();
    }
    
    saveCurrentTabState() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;

        if (tab.editorView) {
            tab.content = tab.editorView.state.doc.toString();
            tab.isDirty = tab.content !== (tab.originalContent || '');
        }
    }
    
    restoreTabState(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        if (tab.editorView) {
            this.setEditorContent(tabId, tab.content);
            this.updatePreview(tabId, true); // immediate=true for tab switches
            this.updateWordCount();
        }
    }
    
    focusActiveEditor() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab?.editorView) {
            tab.editorView.focus();
        }
    }
    
    updatePreview(tabId = this.activeTabId, immediate = false) {
        const tab = this.tabs.get(tabId);
        if (!tab || tab.type === 'pdf') return;

        // Clear existing debounce timer for this tab
        if (this.previewDebounceTimers.has(tabId)) {
            clearTimeout(this.previewDebounceTimers.get(tabId));
        }

        // If immediate, render right away (for tab switches, file loads)
        if (immediate) {
            this._renderPreview(tabId);
            return;
        }

        // Debounce preview rendering for typing performance
        this.previewDebounceTimers.set(tabId, setTimeout(() => {
            this._renderPreview(tabId);
            this.previewDebounceTimers.delete(tabId);
        }, this.previewDebounceDelay));
    }

    _renderPreview(tabId) {
        const tab = this.tabs.get(tabId);
        const preview = document.getElementById(`preview-${tabId}`);

        if (!tab || !preview) return;

        try {
            // Check if libraries are available
            if (!marked || !DOMPurify) {
                preview.innerHTML = '<div class="preview-error"><div class="preview-error-icon">⚠️</div><div class="preview-error-title">Libraries Not Loaded</div><div class="preview-error-message">Required libraries (marked/DOMPurify) could not be loaded. Please check your installation.</div></div>';
                return;
            }
            const html = marked.parse(tab.content);
            let sanitizedHtml = DOMPurify.sanitize(html);

            // TOC generation
            if (sanitizedHtml.includes('[[toc]]') || sanitizedHtml.includes('[TOC]')) {
                const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
                let tocMatch;
                const toc = [];
                const tempHtml = sanitizedHtml;
                while ((tocMatch = headingRegex.exec(tempHtml)) !== null) {
                    const level = parseInt(tocMatch[1]);
                    const text = tocMatch[2].replace(/<[^>]+>/g, '');
                    const id = text.toLowerCase().replace(/[^\w]+/g, '-');
                    toc.push({ level, text, id });
                }

                if (toc.length > 0) {
                    const tocHtml = '<nav class="toc"><h2>Table of Contents</h2><ul>' +
                        toc.map(h => `<li class="toc-h${h.level}"><a href="#${h.id}">${h.text}</a></li>`).join('') +
                        '</ul></nav>';
                    sanitizedHtml = sanitizedHtml.replace(/\[\[toc\]\]|\[TOC\]/gi, tocHtml);

                    // Add IDs to headings for anchor links
                    toc.forEach(h => {
                        sanitizedHtml = sanitizedHtml.replace(
                            new RegExp(`(<h${h.level}[^>]*)>`, 'i'),
                            `$1 id="${h.id}">`
                        );
                    });
                }
            }

            preview.innerHTML = sanitizedHtml;

            // Render math expressions if KaTeX is available
            if (window.katex && window.renderMathInElement) {
                try {
                    window.renderMathInElement(preview, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ]
                    });
                } catch (mathError) {
                    console.warn('Math rendering error:', mathError);
                }
            }

            // Render Mermaid diagrams — lazy-load mermaid only when needed
            const mermaidBlocks = preview.querySelectorAll('pre code.language-mermaid');
            if (mermaidBlocks.length > 0) {
                try {
                    // Lazy-load mermaid on first use
                    if (!window.mermaid) {
                        const mermaidModule = require('mermaid');
                        window.mermaid = mermaidModule.default || mermaidModule;
                    }

                    mermaidBlocks.forEach((block) => {
                        const code = block.textContent;
                        const pre = block.parentElement;
                        const mermaidDiv = document.createElement('div');
                        mermaidDiv.className = 'mermaid';
                        mermaidDiv.setAttribute('data-processed', 'true');
                        mermaidDiv.textContent = code;
                        pre.parentElement.replaceChild(mermaidDiv, pre);
                    });

                    const theme = document.body.className.includes('theme-dark') ? 'dark' : 'default';
                    window.mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'loose' });
                    window.mermaid.run({ querySelector: '.mermaid:not([data-rendered])' }).then(() => {
                        preview.querySelectorAll('.mermaid').forEach(el => {
                            el.setAttribute('data-rendered', 'true');
                        });
                    });
                } catch (mermaidError) {
                    console.warn('Mermaid rendering error:', mermaidError);
                }
            }

            // Render PlantUML diagrams
            const plantumlBlocks = preview.querySelectorAll('pre code.language-plantuml');
            plantumlBlocks.forEach((block) => {
                const code = block.textContent;
                const pre = block.parentElement;

                // Encode for PlantUML server using hex encoding
                const encoded = plantumlEncode(code);

                const img = document.createElement('img');
                img.src = `https://www.plantuml.com/plantuml/svg/${encoded}`;
                img.alt = 'PlantUML diagram';
                img.style.maxWidth = '100%';
                img.onerror = () => {
                    img.replaceWith(pre); // Fallback to code block on error
                };

                pre.parentElement.replaceChild(img, pre);
            });

            // Add Run buttons to executable code blocks (REPL)
            const codeBlocks = preview.querySelectorAll('pre code[class*="language-"]');
            codeBlocks.forEach(block => {
                const lang = block.className.match(/language-(\w+)/)?.[1];
                if (['javascript', 'js', 'python', 'py', 'bash', 'sh'].includes(lang)) {
                    const runBtn = document.createElement('button');
                    runBtn.className = 'code-run-btn';
                    runBtn.textContent = '\u25B6 Run';
                    runBtn.addEventListener('click', async () => {
                        if (replPanel) {
                            replPanel.show();
                            const result = await ipcRenderer.invoke('execute-code', { code: block.textContent, language: lang });
                            replPanel.appendOutput(`[${lang}]`, result);
                        }
                    });
                    block.parentElement.style.position = 'relative';
                    block.parentElement.appendChild(runBtn);
                }
            });
        } catch (error) {
            console.error('Error rendering preview:', error);
            preview.innerHTML = '<p class="error">Error rendering preview. Please check your markdown syntax.</p>';
        }
    }
    
    updatePreviewVisibility() {
        document.querySelectorAll('.tab-content').forEach(content => {
            const previewPane = content.querySelector('.pane:last-child');
            const editorPane = content.querySelector('.pane:first-child');
            
            if (this.isPreviewVisible) {
                previewPane.classList.remove('hidden');
                editorPane.classList.remove('full-width');
            } else {
                previewPane.classList.add('hidden');
                editorPane.classList.add('full-width');
            }
        });
    }
    
    updateLineNumbers() {
        // CodeMirror handles line numbers natively — this is now a no-op.
        // Line number visibility is controlled via the showLineNumbers option
        // passed to createEditor().
    }
    
    updateWordCount() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab) return;

        const content = tab.content;
        const words = content.trim() ? content.trim().split(/\s+/).filter(word => word.length > 0).length : 0;
        const chars = content.length;

        const wordEl = document.getElementById('word-count');
        const charEl = document.getElementById('char-count');
        if (wordEl) wordEl.textContent = `Words: ${words}`;
        if (charEl) charEl.textContent = `Chars: ${chars}`;
    }

    updateCursorPosition(view) {
        if (!view) return;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const lineCol = document.getElementById('line-col');
        if (lineCol) lineCol.textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
    }

    updateFilePath() {
        const tab = this.tabs.get(this.activeTabId);
        const el = document.getElementById('status-file-path');
        if (el && tab) {
            el.textContent = tab.filePath || 'Untitled';
            el.title = tab.filePath || '';
        }
    }

    updateBreadcrumb() {
        const tab = this.tabs.get(this.activeTabId);
        const el = document.getElementById('breadcrumb-path');
        if (el && tab) {
            el.textContent = tab.filePath || 'Untitled';
            el.title = tab.filePath || '';
        }
    }
    
    setupEditorEvents() {
        // CodeMirror handles editor events via the onChange callback
        // passed to createEditor(). No additional event delegation needed.
    }
    
    handleEditorInput(tabId) {
        // CodeMirror's onChange callback handles content syncing.
        // This method is kept for any remaining callers but is largely a no-op now.
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        if (tab.editorView) {
            tab.content = tab.editorView.state.doc.toString();
        }
        tab.isDirty = true;

        this.updatePreview(tabId);
        this.updateWordCount();
        this.updateTabBar();
    }
    
    // Auto-save functionality
    startAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(() => {
            this.performAutoSave();
        }, this.autoSaveDelay);
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    performAutoSave() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || !tab.filePath || !tab.content) return;

        // Only auto-save if content has changed since last save
        if (tab.lastSavedContent !== tab.content) {
            ipcRenderer.send('save-file', { path: tab.filePath, content: tab.content });
            tab.lastSavedContent = tab.content;

            // Show brief auto-save indicator
            this.showAutoSaveIndicator();
        }
    }

    showAutoSaveIndicator() {
        const indicator = document.createElement('div');
        indicator.textContent = 'Auto-saved';
        indicator.className = 'auto-save-indicator';
        document.body.appendChild(indicator);

        setTimeout(() => {
            indicator.classList.add('fade-out');
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 1500);
    }

    // Recent files functionality
    addToRecentFiles(filePath) {
        if (!filePath) return;

        // Remove if already exists
        this.recentFiles = this.recentFiles.filter(f => f !== filePath);

        // Add to beginning
        this.recentFiles.unshift(filePath);

        // Keep only last 10 files
        this.recentFiles = this.recentFiles.slice(0, 10);

        // Save to localStorage and sync with main process
        localStorage.setItem('recentFiles', JSON.stringify(this.recentFiles));
        ipcRenderer.send('save-recent-files', this.recentFiles);
    }

    getRecentFiles() {
        return this.recentFiles.filter(file => {
            // Check if file still exists (basic check by trying to access it)
            try {
                return file && file.length > 0;
            } catch (e) {
                return false;
            }
        });
    }

    setupToolbarEvents() {
        // Bold
        document.getElementById('btn-bold').addEventListener('click', () => {
            this.wrapSelection('**', '**');
        });

        // Italic
        document.getElementById('btn-italic').addEventListener('click', () => {
            this.wrapSelection('*', '*');
        });

        // Heading
        document.getElementById('btn-heading').addEventListener('click', () => {
            this.insertAtLineStart('## ');
        });

        // Link
        document.getElementById('btn-link').addEventListener('click', () => {
            this.wrapSelection('[', '](url)');
        });

        // Code
        document.getElementById('btn-code').addEventListener('click', () => {
            this.wrapSelection('`', '`');
        });

        // List
        document.getElementById('btn-list').addEventListener('click', () => {
            this.insertAtLineStart('- ');
        });

        // Quote
        document.getElementById('btn-quote').addEventListener('click', () => {
            this.insertAtLineStart('> ');
        });

        // Table
        document.getElementById('btn-table').addEventListener('click', () => {
            this.insertTable();
        });

        // Strikethrough
        document.getElementById('btn-strikethrough').addEventListener('click', () => {
            this.wrapSelection('~~', '~~');
        });

        // Code Block
        document.getElementById('btn-code-block').addEventListener('click', () => {
            this.insertCodeBlock();
        });

        // Horizontal Rule
        document.getElementById('btn-horizontal-rule').addEventListener('click', () => {
            this.insertHorizontalRule();
        });

        // Preview toggle
        document.getElementById('btn-preview-toggle').addEventListener('click', () => {
            this.isPreviewVisible = !this.isPreviewVisible;
            this.updatePreviewVisibility();
        });

        // Line numbers
        document.getElementById('btn-line-numbers').addEventListener('click', () => {
            this.showLineNumbers = !this.showLineNumbers;
            this.updateLineNumbers();
        });
    }

    // Helper function to wrap selected text
    wrapSelection(before, after) {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return;

        const view = tab.editorView;
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);
        const replacement = before + (selectedText || 'text') + after;

        view.dispatch({
            changes: { from, to, insert: replacement }
        });
        view.focus();
    }

    // Helper function to insert text at the start of current line
    insertAtLineStart(prefix) {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return;

        const view = tab.editorView;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);

        view.dispatch({
            changes: { from: line.from, insert: prefix }
        });
        view.focus();
    }

    // Insert a markdown table
    insertTable() {
        const table = '\n| Column 1 | Column 2 | Column 3 |\n' +
                     '|----------|----------|----------|\n' +
                     '| Cell 1   | Cell 2   | Cell 3   |\n' +
                     '| Cell 4   | Cell 5   | Cell 6   |\n';

        this.insertAtCursor(table);
    }

    // Insert a code block
    insertCodeBlock() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return;

        const view = tab.editorView;
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);
        const codeBlock = '\n```\n' + (selectedText || 'code here') + '\n```\n';

        view.dispatch({
            changes: { from, to, insert: codeBlock }
        });
        view.focus();
    }

    // Insert a horizontal rule
    insertHorizontalRule() {
        this.insertAtCursor('\n\n---\n\n');
    }
    
    setupFindEvents() {
        const btnFind = document.getElementById('btn-find');
        const btnFindClose = document.getElementById('btn-find-close');
        const findInput = document.getElementById('find-input');
        const btnFindNext = document.getElementById('btn-find-next');
        const btnFindPrev = document.getElementById('btn-find-prev');
        const btnReplace = document.getElementById('btn-replace');
        const btnReplaceAll = document.getElementById('btn-replace-all');

        if (!btnFind || !btnFindClose || !findInput || !btnFindNext || !btnFindPrev || !btnReplace || !btnReplaceAll) {
            console.error('Find dialog elements not found');
            return;
        }

        // Show find dialog
        btnFind.addEventListener('click', () => {
            window.modals.findModal.open();
            findInput.focus();
        });

        // Close find dialog
        btnFindClose.addEventListener('click', () => {
            window.modals.findModal.close();
            this.clearFindHighlights();
        });

        // Find input change - update matches
        findInput.addEventListener('input', () => {
            this.performFind();
        });

        // Find next
        btnFindNext.addEventListener('click', () => {
            this.findNext();
        });

        // Find previous
        btnFindPrev.addEventListener('click', () => {
            this.findPrevious();
        });

        // Replace
        btnReplace.addEventListener('click', () => {
            this.replaceOne();
        });

        // Replace all
        btnReplaceAll.addEventListener('click', () => {
            this.replaceAll();
        });

        // Enter key in find input - find next
        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.findPrevious();
                } else {
                    this.findNext();
                }
            }
        });

    }

    performFind() {
        const findText = document.getElementById('find-input').value;
        const tab = this.tabs.get(this.activeTabId);

        if (!findText || !tab) {
            this.clearFindHighlights();
            const findCount = document.getElementById('find-count');
            if (findCount) {
                findCount.textContent = '0 matches';
            }
            return;
        }

        const content = this.getEditorContent();
        const matches = [];
        let index = 0;

        // Find all matches
        while ((index = content.indexOf(findText, index)) !== -1) {
            matches.push(index);
            index += findText.length;
        }

        tab.findMatches = matches;
        tab.currentMatchIndex = matches.length > 0 ? 0 : -1;

        // Update match count
        const findCount = document.getElementById('find-count');
        if (findCount) {
            findCount.textContent = `${matches.length} match${matches.length !== 1 ? 'es' : ''}`;
        }

        // Highlight first match
        if (matches.length > 0) {
            this.highlightMatch(0);
        }
    }

    findNext() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.findMatches.length === 0) return;

        tab.currentMatchIndex = (tab.currentMatchIndex + 1) % tab.findMatches.length;
        this.highlightMatch(tab.currentMatchIndex);
    }

    findPrevious() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab || tab.findMatches.length === 0) return;

        tab.currentMatchIndex = tab.currentMatchIndex - 1;
        if (tab.currentMatchIndex < 0) {
            tab.currentMatchIndex = tab.findMatches.length - 1;
        }
        this.highlightMatch(tab.currentMatchIndex);
    }

    highlightMatch(matchIndex) {
        const tab = this.tabs.get(this.activeTabId);
        const findText = document.getElementById('find-input').value;

        if (!tab || !tab.editorView || matchIndex < 0 || matchIndex >= tab.findMatches.length) return;

        const position = tab.findMatches[matchIndex];
        const view = tab.editorView;

        // Select the match in CodeMirror
        view.dispatch({
            selection: { anchor: position, head: position + findText.length },
            scrollIntoView: true,
        });

        // Restore focus to find input
        const findInput = document.getElementById('find-input');
        if (findInput) {
            setTimeout(() => {
                findInput.focus();
                findInput.setSelectionRange(findInput.value.length, findInput.value.length);
            }, 10);
        }

        // Update match counter
        const findCount = document.getElementById('find-count');
        if (findCount) {
            findCount.textContent = `Match ${matchIndex + 1} of ${tab.findMatches.length}`;
        }
    }

    replaceOne() {
        const tab = this.tabs.get(this.activeTabId);
        const findText = document.getElementById('find-input').value;
        const replaceText = document.getElementById('replace-input').value;

        if (!tab || !tab.editorView || tab.findMatches.length === 0 || tab.currentMatchIndex < 0) return;

        const position = tab.findMatches[tab.currentMatchIndex];
        const view = tab.editorView;

        view.dispatch({
            changes: { from: position, to: position + findText.length, insert: replaceText }
        });

        tab.content = view.state.doc.toString();
        tab.isDirty = true;

        this.updatePreview(this.activeTabId);
        this.updateWordCount();
        this.updateTabBar();

        // Re-perform find to update matches
        this.performFind();
    }

    replaceAll() {
        const tab = this.tabs.get(this.activeTabId);
        const findText = document.getElementById('find-input').value;
        const replaceText = document.getElementById('replace-input').value;

        if (!tab || !tab.editorView || !findText || tab.findMatches.length === 0) return;

        const view = tab.editorView;
        const replacedCount = tab.findMatches.length;

        // Build all changes as a single transaction for proper undo support.
        // Changes must be provided in document order; findMatches is already sorted.
        const changes = tab.findMatches.map(pos => ({
            from: pos,
            to: pos + findText.length,
            insert: replaceText,
        }));

        view.dispatch({ changes });

        tab.content = view.state.doc.toString();
        tab.isDirty = true;

        this.updatePreview(this.activeTabId);
        this.updateWordCount();
        this.updateTabBar();

        // Update match count
        document.getElementById('find-count').textContent = `Replaced ${replacedCount} match${replacedCount !== 1 ? 'es' : ''}`;

        // Re-perform find
        this.performFind();
    }

    clearFindHighlights() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab) {
            tab.findMatches = [];
            tab.currentMatchIndex = -1;
        }
    }
    
    // File operations
    openFile(filePath, content) {
        console.log('openFile called with:', filePath, 'content length:', content.length);
        let tab = this.tabs.get(this.activeTabId);

        // Handle both forward and back slashes for cross-platform compatibility
        const fileName = filePath.split(/[\\/]/).pop();

        // If current tab is empty and untitled, reuse it
        if (!tab.filePath && !tab.isDirty && tab.content === '') {
            console.log('Reusing current tab');
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;

            // Update the editor and preview
            this.setEditorContent(this.activeTabId, content);
            this.updatePreview(this.activeTabId);
            this.updateWordCount();
        } else {
            // Create new tab for the file
            console.log('Creating new tab for file');
            this.createNewTab();
            tab = this.tabs.get(this.activeTabId);
            tab.filePath = filePath;
            tab.title = fileName;
            tab.content = content;
            tab.originalContent = content;
            tab.isDirty = false;

            // Set content in the CodeMirror editor
            this.setEditorContent(this.activeTabId, content);
            this.updatePreview(this.activeTabId);
            this.updateWordCount();
        }
        this.startAutoSave();
        this.addToRecentFiles(filePath);
        this.updateTabBar();
        this.updateFilePath();
        this.updateBreadcrumb();

        // Notify main process about current file for exports
        ipcRenderer.send('set-current-file', filePath);

        console.log('File opened successfully');
    }
    
    // Get content from active editor
    getEditorContent(tabId = this.activeTabId) {
        const tab = this.tabs.get(tabId);
        if (tab?.editorView) {
            return tab.editorView.state.doc.toString();
        }
        return tab?.content || '';
    }

    // Set content in editor
    setEditorContent(tabId, content) {
        const tab = this.tabs.get(tabId);
        if (tab?.editorView) {
            tab.editorView.dispatch({
                changes: { from: 0, to: tab.editorView.state.doc.length, insert: content }
            });
        }
        tab.content = content;
    }

    // Insert text at cursor position
    insertAtCursor(text) {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return;
        const view = tab.editorView;
        const pos = view.state.selection.main.head;
        view.dispatch({
            changes: { from: pos, insert: text }
        });
        view.focus();
    }

    // Get selected text
    getSelection() {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return '';
        const state = tab.editorView.state;
        return state.sliceDoc(state.selection.main.from, state.selection.main.to);
    }

    // Replace selection
    replaceSelection(text) {
        const tab = this.tabs.get(this.activeTabId);
        if (!tab?.editorView) return;
        const view = tab.editorView;
        const { from, to } = view.state.selection.main;
        view.dispatch({
            changes: { from, to, insert: text }
        });
        view.focus();
    }

    getCurrentContent() {
        const tab = this.tabs.get(this.activeTabId);
        return tab ? tab.content : '';
    }
    
    getCurrentFilePath() {
        const tab = this.tabs.get(this.activeTabId);
        return tab ? tab.filePath : null;
    }
}

// Initialize tab manager
let tabManager;
let replPanel;

document.addEventListener('DOMContentLoaded', () => {
    tabManager = new TabManager();
    const ReplPanel = getReplPanel();
    replPanel = new ReplPanel();

    // Initialize ModalManager for all dialogs
    const findModal = new ModalManager('#find-dialog');
    const exportModal = new ModalManager('#export-dialog');
    const printPreviewModal = new ModalManager('#print-preview-overlay');
    const tableModal = new ModalManager('#table-generator-dialog');
    const asciiModal = new ModalManager('#ascii-art-dialog');
    const converterModal = new ModalManager('#universal-converter-dialog');
    const batchModal = new ModalManager('#batch-dialog');
    const pdfEditorModal = new ModalManager('#pdf-editor-dialog');
    const headerFooterModal = new ModalManager('#header-footer-dialog');
    const fieldPickerModal = new ModalManager('#field-picker-dialog');

    // Make modals globally accessible for functions outside this scope
    window.modals = {
        findModal,
        exportModal,
        printPreviewModal,
        tableModal,
        asciiModal,
        converterModal,
        batchModal,
        pdfEditorModal,
        headerFooterModal,
        fieldPickerModal
    };

    // Initialize sidebar
    const SidebarManager = getSidebarManager();
    const sidebarManager = new SidebarManager();
    let explorerCurrentDir = null;

    sidebarManager.registerPanel('explorer', {
        title: 'Explorer',
        render: (container) => getRenderExplorerPanel()(container, {
            listDirectory: (dir) => ipcRenderer.invoke('list-directory', dir),
            onFileOpen: (filePath) => ipcRenderer.send('open-file-path', filePath),
            currentDir: explorerCurrentDir,
        })
    });
    sidebarManager.registerPanel('git', {
        title: 'Git',
        render: (container) => getRenderGitPanel()(container, {
            gitStatus: () => ipcRenderer.invoke('git-status'),
            gitDiff: (file) => ipcRenderer.invoke('git-diff', { file }),
            gitStage: (files) => ipcRenderer.invoke('git-stage', { files }),
            gitCommit: (message) => ipcRenderer.invoke('git-commit', { message }),
            gitLog: () => ipcRenderer.invoke('git-log'),
        })
    });
    sidebarManager.registerPanel('snippets', {
        title: 'Snippets',
        render: (container) => getRenderSnippetsPanel()(container, {
            getSnippets: () => ipcRenderer.invoke('get-snippets'),
            saveSnippet: (s) => ipcRenderer.invoke('save-snippet', s),
            deleteSnippet: (id) => ipcRenderer.invoke('delete-snippet', id),
            onInsert: (code) => tabManager.insertAtCursor(code),
        })
    });
    sidebarManager.registerPanel('templates', {
        title: 'Templates',
        render: (container) => getRenderTemplatesPanel()(container, async (file) => {
            const templateContent = await ipcRenderer.invoke('load-template', file);
            if (templateContent) {
                const content = templateContent.replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
                tabManager.createNewTab();
                const tab = tabManager.tabs.get(tabManager.activeTabId);
                tabManager.setEditorContent(tab.id, content);
            }
        })
    });

    // Welcome tab on startup
    const hasLaunched = localStorage.getItem('hasLaunchedBefore');
    const showWelcome = localStorage.getItem('showWelcomeOnStartup') !== 'false';

    if (!hasLaunched || showWelcome) {
        localStorage.setItem('hasLaunchedBefore', 'true');

        // Set welcome content in the first tab's preview
        const recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        const welcomeHtml = getCreateWelcomeContent()(recentFiles);

        const tab = tabManager.tabs.get(tabManager.activeTabId);
        if (tab) {
            tab.title = 'Welcome';
            tab.content = '';
            const preview = document.getElementById(`preview-${tab.id}`);
            if (preview) {
                preview.innerHTML = welcomeHtml;
                // Wire up card actions
                preview.querySelectorAll('.welcome-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const action = card.dataset.action;
                        if (action === 'new-file') tabManager.createNewTab();
                        else if (action === 'open-file') ipcRenderer.send('menu-open');
                        else if (action === 'open-template') sidebarManager.togglePanel('templates');
                        else if (action === 'command-palette') {
                            if (typeof commandPalette !== 'undefined') commandPalette.open();
                        }
                    });
                });
                // Wire up recent files
                preview.querySelectorAll('.welcome-recent-item').forEach(item => {
                    item.addEventListener('click', () => ipcRenderer.send('open-file-path', item.dataset.path));
                });
                // Wire up show-on-startup checkbox
                const checkbox = document.getElementById('show-welcome-startup');
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        localStorage.setItem('showWelcomeOnStartup', checkbox.checked);
                    });
                }
            }
            tabManager.updateTabBar();
        }
    }

    // Image paste handler
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    const ext = item.type.split('/')[1] === 'png' ? 'png' : 'jpg';
                    const result = await ipcRenderer.invoke('save-pasted-image', { base64, ext });
                    if (result?.relativePath) {
                        tabManager.insertAtCursor(`![image](${result.relativePath})\n`);
                    }
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
    });

    // Drag and drop images
    const editorContainer = document.querySelector('.editor-container');
    editorContainer?.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    editorContainer?.addEventListener('drop', async (e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
                const ext = file.name.split('.').pop() || 'png';
                const result = await ipcRenderer.invoke('save-pasted-image', { base64, ext });
                if (result?.relativePath) {
                    tabManager.insertAtCursor(`![${file.name}](${result.relativePath})\n`);
                }
            };
            reader.readAsDataURL(file);
        }
    });

    // Initialize command palette
    const CommandPalette = getCommandPalette();
    const commandPalette = new CommandPalette();

    // Initialize print preview
    const PrintPreview = getPrintPreview();
    const printPreview = new PrintPreview();

    // Register commands
    commandPalette.register('New File', 'Ctrl+N', () => tabManager.createNewTab());
    commandPalette.register('Open File', 'Ctrl+O', () => ipcRenderer.send('menu-open'));
    commandPalette.register('Save', 'Ctrl+S', () => {
        const content = tabManager.getCurrentContent();
        ipcRenderer.send('save-current-file', content);
    });
    commandPalette.register('Toggle Preview', '', () => {
        tabManager.isPreviewVisible = !tabManager.isPreviewVisible;
        tabManager.updatePreviewVisibility();
    });
    commandPalette.register('Toggle Line Numbers', '', () => {
        tabManager.showLineNumbers = !tabManager.showLineNumbers;
        tabManager.updateLineNumbers();
    });
    commandPalette.register('Bold', 'Ctrl+B', () => tabManager.wrapSelection('**', '**'));
    commandPalette.register('Italic', 'Ctrl+I', () => tabManager.wrapSelection('*', '*'));
    commandPalette.register('Insert Table', '', () => tabManager.insertTable());
    commandPalette.register('Insert Code Block', '', () => tabManager.insertCodeBlock());
    commandPalette.register('Insert Horizontal Rule', '', () => tabManager.insertHorizontalRule());
    commandPalette.register('Find & Replace', 'Ctrl+F', () => {
        const findDialog = document.getElementById('find-dialog');
        if (findDialog) {
            findDialog.classList.toggle('hidden');
            if (!findDialog.classList.contains('hidden')) {
                document.getElementById('find-input').focus();
            }
        }
    });
    commandPalette.register('Toggle Sidebar: Explorer', 'Ctrl+Shift+E', () => sidebarManager.togglePanel('explorer'));
    commandPalette.register('Toggle Sidebar: Git', 'Ctrl+Shift+G', () => sidebarManager.togglePanel('git'));
    commandPalette.register('Toggle Sidebar: Snippets', '', () => sidebarManager.togglePanel('snippets'));
    commandPalette.register('Toggle Sidebar: Templates', '', () => sidebarManager.togglePanel('templates'));
    commandPalette.register('Print Preview', 'Ctrl+P', () => {
        const tab = tabManager.tabs.get(tabManager.activeTabId);
        const preview = document.getElementById(`preview-${tab.id}`);
        printPreview.open(preview?.innerHTML || '');
    });
    commandPalette.register('Export to PDF', '', () => ipcRenderer.send('export', 'pdf'));
    commandPalette.register('Export to DOCX', '', () => ipcRenderer.send('export', 'docx'));
    commandPalette.register('Export to HTML', '', () => ipcRenderer.send('export', 'html'));
    commandPalette.register('New Tab', 'Ctrl+T', () => tabManager.createNewTab());
    commandPalette.register('Close Tab', 'Ctrl+W', () => tabManager.closeTab(tabManager.activeTabId));
    commandPalette.register('Undo', 'Ctrl+Z', () => { const tab = tabManager.tabs.get(tabManager.activeTabId); if (tab?.editorView) undo(tab.editorView); });
    commandPalette.register('Redo', 'Ctrl+Shift+Z', () => { const tab = tabManager.tabs.get(tabManager.activeTabId); if (tab?.editorView) redo(tab.editorView); });
    commandPalette.register('Heading 1', '', () => tabManager.insertAtLineStart('# '));
    commandPalette.register('Heading 2', '', () => tabManager.insertAtLineStart('## '));
    commandPalette.register('Heading 3', '', () => tabManager.insertAtLineStart('### '));
    commandPalette.register('Insert Link', '', () => tabManager.wrapSelection('[', '](url)'));
    commandPalette.register('Insert Image', '', () => tabManager.wrapSelection('![', '](image.jpg)'));

    // Ctrl+Shift+P keyboard shortcut for command palette
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            commandPalette.open();
        }
    });

    // Initialize CodeMirror for the initial tab (tab 1)
    const initialEditorContainer = document.getElementById('editor-cm-1');
    if (initialEditorContainer) {
        const tab = tabManager.tabs.get(1);
        const isDark = document.body.className.includes('dark');
        tab.editorView = createEditor(initialEditorContainer, {
            content: tab.content,
            onChange: (newContent) => {
                tab.content = newContent;
                tab.isDirty = true;
                tabManager.updatePreview(tab.id);
                tabManager.updateWordCount();
                tabManager.updateTabBar();
            },
            onUpdate: (view) => {
                tabManager.updateCursorPosition(view);
            },
            isDark,
            showLineNumbers: tabManager.showLineNumbers,
        });
    }

    // Request current theme
    ipcRenderer.send('get-theme');

    // Also send renderer-ready immediately as backup
    // This ensures we don't get stuck waiting for theme-changed
    setTimeout(() => {
        console.log('Backup renderer-ready timeout triggered');
        ipcRenderer.send('renderer-ready');
    }, 100);

    // Set up auto-save interval
    setInterval(() => {
        // Auto-save logic for all tabs
        tabManager.tabs.forEach(tab => {
            if (tab.isDirty && tab.filePath) {
                ipcRenderer.send('save-current-file', tab.content);
            }
        });
    }, 30000);
});

// IPC event listeners
ipcRenderer.on('file-new', () => {
    tabManager.createNewTab();
});

ipcRenderer.on('file-opened', (event, data) => {
    console.log('[RENDERER] file-opened received:', data.path, 'content length:', data.content.length);
    if (tabManager) {
        tabManager.openFile(data.path, data.content);
    } else {
        console.error('[RENDERER] tabManager not initialized!');
    }
});

ipcRenderer.on('file-save', () => {
    const currentContent = tabManager.getCurrentContent();
    const currentFilePath = tabManager.getCurrentFilePath();
    // send to main process which will save or trigger save-as dialog
    ipcRenderer.send('save-current-file', currentContent);
});

ipcRenderer.on('get-content-for-save', (event, filePath) => {
    const currentContent = tabManager.getCurrentContent();
    ipcRenderer.send('save-file', { path: filePath, content: currentContent });
    // Update the active tab's file path and title after save-as
    const tab = tabManager.tabs.get(tabManager.activeTabId);
    if (tab) {
        tab.filePath = filePath;
        tab.originalContent = currentContent;
        tab.isDirty = false;
        tab.title = filePath.split(/[/\\]/).pop();
        tabManager.updateTabBar();
        tabManager.updateFilePath();
        tabManager.updateBreadcrumb();
    }
});

ipcRenderer.on('get-content-for-spreadsheet', (event, format) => {
    const currentContent = tabManager.getCurrentContent();
    ipcRenderer.send('export-spreadsheet', { content: currentContent, format });
});

ipcRenderer.on('toggle-preview', () => {
    tabManager.isPreviewVisible = !tabManager.isPreviewVisible;
    tabManager.updatePreviewVisibility();
});

ipcRenderer.on('toggle-find', () => {
    if (window.modals.findModal.isOpen()) {
        window.modals.findModal.close();
    } else {
        window.modals.findModal.open();
        document.getElementById('find-input').focus();
    }
});

ipcRenderer.on('theme-changed', (event, theme) => {
    console.log('[RENDERER] Theme changed to:', theme);
    document.body.className = `theme-${theme}`;

    // After theme is applied, wait for next frame then signal renderer is ready
    // This ensures complete UI initialization before files are opened
    requestAnimationFrame(() => {
        console.log('[RENDERER] Sending renderer-ready from theme-changed');
        ipcRenderer.send('renderer-ready');
    });
});

// Undo/Redo handlers — delegate to CodeMirror's built-in history
ipcRenderer.on('undo', () => {
    if (tabManager) {
        const tab = tabManager.tabs.get(tabManager.activeTabId);
        if (tab?.editorView) {
            undo(tab.editorView);
        }
    }
});

ipcRenderer.on('redo', () => {
    if (tabManager) {
        const tab = tabManager.tabs.get(tabManager.activeTabId);
        if (tab?.editorView) {
            redo(tab.editorView);
        }
    }
});

// Font size adjustment
let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 15;

function updateFontSizes(size) {
    const editors = document.querySelectorAll('.cm-editor');
    const previews = document.querySelectorAll('#preview, .preview-content');

    editors.forEach(editor => {
        editor.style.fontSize = `${size}px`;
    });

    previews.forEach(preview => {
        preview.style.fontSize = `${size}px`;
    });

    localStorage.setItem('fontSize', size);
}

// Apply saved font size on load
updateFontSizes(currentFontSize);

ipcRenderer.on('adjust-font-size', (event, action) => {
    if (action === 'increase' && currentFontSize < 24) {
        currentFontSize++;
    } else if (action === 'decrease' && currentFontSize > 10) {
        currentFontSize--;
    } else if (action === 'reset') {
        currentFontSize = 15;
    }
    updateFontSizes(currentFontSize);
});

// Print preview request handlers - open print preview dialog
ipcRenderer.on('print-preview', () => {
    console.log('[RENDERER] print-preview received');
    openPrintPreviewDialog();
});

ipcRenderer.on('print-preview-styled', () => {
    console.log('[RENDERER] print-preview-styled received');
    openPrintPreviewDialog();
});

function openPrintPreviewDialog() {
    const activeTabId = tabManager ? tabManager.activeTabId : 1;
    const previewContent = document.getElementById(`preview-${activeTabId}`);

    if (!previewContent || !previewContent.innerHTML.trim()) {
        alert('Nothing to print. Please create or open a document and ensure the preview is visible.');
        return;
    }

    const PrintPreviewClass = getPrintPreview();
    const printPreviewInstance = new PrintPreviewClass();
    printPreviewInstance.open(previewContent.innerHTML);
}

// Export Dialog functionality
let currentExportFormat = null;

ipcRenderer.on('show-export-dialog', (event, format) => {
    currentExportFormat = format;
    showExportDialog(format);
});

function showExportDialog(format) {
    console.log('showExportDialog called with format:', format);
    const dialog = document.getElementById('export-dialog');
    const title = document.getElementById('export-dialog-title');

    if (!dialog) {
        console.error('Export dialog element not found!');
        return;
    }

    console.log('Dialog found, showing export options for:', format);
    title.textContent = `Export as ${format.toUpperCase()}`;
    dialog.setAttribute('data-format', format);
    window.modals.exportModal.open();

    // Initialize form values
    initializeExportForm(format);
    console.log('Export dialog should now be visible');
}

function hideExportDialog() {
    window.modals.exportModal.close();
    currentExportFormat = null;
}

function initializeExportForm(format) {
    // Reset advanced export toggle to unchecked
    const advancedToggle = document.getElementById('advanced-export-toggle');
    const advancedOptions = document.getElementById('advanced-export-options');

    advancedToggle.checked = false;
    advancedOptions.classList.add('hidden');

    // Reset form to defaults
    document.getElementById('export-template').value = 'default';
    document.getElementById('custom-template-path').style.display = 'none';

    // Clear metadata fields
    const metadataFields = document.querySelectorAll('.metadata-field');
    metadataFields.forEach((field, index) => {
        if (index < 4) { // Keep first 4 default fields
            field.querySelector('.metadata-key').value = ['title', 'author', 'date', 'subject'][index] || '';
            field.querySelector('.metadata-value').value = '';
        } else {
            field.remove(); // Remove additional fields
        }
    });

    // Reset checkboxes and other fields
    document.getElementById('export-toc').checked = false;
    document.getElementById('export-number-sections').checked = false;
    document.getElementById('export-citeproc').checked = false;
    document.getElementById('export-toc-depth').value = 3;

    // PDF-specific fields
    if (format === 'pdf') {
        document.getElementById('pdf-engine').value = 'xelatex';
        document.getElementById('pdf-geometry').value = 'margin=1in';
        document.getElementById('custom-geometry').style.display = 'none';
    }

    // Clear bibliography fields
    document.getElementById('bibliography-file').value = '';
    document.getElementById('csl-file').value = '';

    // Request current page settings from main process and apply them
    ipcRenderer.send('get-page-settings');
}

function collectExportOptions() {
    const advancedMode = document.getElementById('advanced-export-toggle').checked;
    const options = {};

    if (advancedMode) {
        // Collect advanced options
        options.template = document.getElementById('export-template').value;
        options.metadata = {};
        options.variables = {};
        options.toc = document.getElementById('export-toc').checked;
        options.tocDepth = document.getElementById('export-toc-depth').value;
        options.numberSections = document.getElementById('export-number-sections').checked;
        options.citeproc = document.getElementById('export-citeproc').checked;
    } else {
        // Collect basic options only
        options.template = 'default';
        options.metadata = {};
        options.variables = {};
        options.toc = document.getElementById('basic-toc').checked;
        options.tocDepth = 3;
        options.numberSections = document.getElementById('basic-number-sections').checked;
        options.citeproc = false;
    }

    if (advancedMode) {
        // Collect custom template path
        if (options.template === 'custom') {
            options.template = document.getElementById('custom-template-path').value.trim();
        }

        // Collect metadata
        const metadataFields = document.querySelectorAll('.metadata-field');
        metadataFields.forEach(field => {
            const key = field.querySelector('.metadata-key').value.trim();
            const value = field.querySelector('.metadata-value').value.trim();
            if (key && value) {
                options.metadata[key] = value;
            }
        });

        // PDF-specific options
        if (currentExportFormat === 'pdf') {
            options.pdfEngine = document.getElementById('pdf-engine').value;
            const geometrySelect = document.getElementById('pdf-geometry');
            if (geometrySelect.value === 'custom') {
                options.geometry = document.getElementById('custom-geometry').value.trim() || 'margin=1in';
            } else {
                options.geometry = geometrySelect.value;
            }
        }

        // Bibliography
        const bibFile = document.getElementById('bibliography-file').value.trim();
        const cslFile = document.getElementById('csl-file').value.trim();
        if (bibFile) options.bibliography = bibFile;
        if (cslFile) options.csl = cslFile;
    } else {
        // Basic mode - set default PDF options if needed
        if (currentExportFormat === 'pdf') {
            options.pdfEngine = 'xelatex';
            options.geometry = 'margin=1in';
        }
    }

    // Collect page size and orientation (always collected, from basic options)
    const pageSize = document.getElementById('page-size').value;
    const pageOrientation = document.getElementById('page-orientation').value;
    const customWidth = document.getElementById('custom-width').value.trim();
    const customHeight = document.getElementById('custom-height').value.trim();

    // Send page settings to main process
    ipcRenderer.send('update-page-settings', {
        size: pageSize,
        orientation: pageOrientation,
        customWidth: customWidth || null,
        customHeight: customHeight || null
    });

    return options;
}

// Export Profiles Management
let exportProfiles = {};

function loadExportProfiles() {
    const saved = localStorage.getItem('exportProfiles');
    if (saved) {
        try {
            exportProfiles = JSON.parse(saved);
            populateProfileDropdown();
        } catch (e) {
            console.error('Failed to load export profiles:', e);
            exportProfiles = {};
        }
    }
}

function saveExportProfiles() {
    localStorage.setItem('exportProfiles', JSON.stringify(exportProfiles));
}

function populateProfileDropdown() {
    const select = document.getElementById('export-profile-select');
    if (!select) return;

    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Add saved profiles
    Object.keys(exportProfiles).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

function saveCurrentProfile() {
    const name = prompt('Enter a name for this export profile:', 'My Profile');
    if (!name || name.trim() === '') return;

    const profileName = name.trim();

    // Collect current settings
    const profile = {
        format: currentExportFormat,
        advancedMode: document.getElementById('advanced-export-toggle').checked,
        pageSize: document.getElementById('page-size').value,
        pageOrientation: document.getElementById('page-orientation').value,
        basicToc: document.getElementById('basic-toc').checked,
        basicNumberSections: document.getElementById('basic-number-sections').checked
    };

    // Add advanced options if enabled
    if (profile.advancedMode) {
        profile.template = document.getElementById('export-template').value;
        profile.toc = document.getElementById('export-toc').checked;
        profile.tocDepth = document.getElementById('export-toc-depth').value;
        profile.numberSections = document.getElementById('export-number-sections').checked;
        profile.citeproc = document.getElementById('export-citeproc').checked;

        if (currentExportFormat === 'pdf') {
            profile.pdfEngine = document.getElementById('pdf-engine').value;
            profile.pdfGeometry = document.getElementById('pdf-geometry').value;
        }
    }

    exportProfiles[profileName] = profile;
    saveExportProfiles();
    populateProfileDropdown();

    // Select the newly created profile
    document.getElementById('export-profile-select').value = profileName;

    alert(`Profile "${profileName}" saved successfully!`);
}

function loadProfile(profileName) {
    if (!profileName || !exportProfiles[profileName]) return;

    const profile = exportProfiles[profileName];

    // Apply settings
    if (profile.advancedMode !== undefined) {
        document.getElementById('advanced-export-toggle').checked = profile.advancedMode;
        const advancedOptions = document.getElementById('advanced-export-options');
        if (profile.advancedMode) {
            advancedOptions.classList.remove('hidden');
        } else {
            advancedOptions.classList.add('hidden');
        }
    }

    if (profile.pageSize) document.getElementById('page-size').value = profile.pageSize;
    if (profile.pageOrientation) document.getElementById('page-orientation').value = profile.pageOrientation;
    if (profile.basicToc !== undefined) document.getElementById('basic-toc').checked = profile.basicToc;
    if (profile.basicNumberSections !== undefined) document.getElementById('basic-number-sections').checked = profile.basicNumberSections;

    // Advanced options
    if (profile.advancedMode && profile.template) document.getElementById('export-template').value = profile.template;
    if (profile.toc !== undefined) document.getElementById('export-toc').checked = profile.toc;
    if (profile.tocDepth) document.getElementById('export-toc-depth').value = profile.tocDepth;
    if (profile.numberSections !== undefined) document.getElementById('export-number-sections').checked = profile.numberSections;
    if (profile.citeproc !== undefined) document.getElementById('export-citeproc').checked = profile.citeproc;

    if (profile.pdfEngine) document.getElementById('pdf-engine').value = profile.pdfEngine;
    if (profile.pdfGeometry) document.getElementById('pdf-geometry').value = profile.pdfGeometry;
}

function deleteSelectedProfile() {
    const select = document.getElementById('export-profile-select');
    const profileName = select.value;

    if (!profileName) {
        alert('Please select a profile to delete.');
        return;
    }

    if (confirm(`Are you sure you want to delete the profile "${profileName}"?`)) {
        delete exportProfiles[profileName];
        saveExportProfiles();
        populateProfileDropdown();
        select.value = '';
        alert(`Profile "${profileName}" deleted successfully!`);
    }
}

// Event listeners for export dialog
document.addEventListener('DOMContentLoaded', () => {
    // Load export profiles on startup
    loadExportProfiles();
    // Template selection
    document.getElementById('export-template').addEventListener('change', (e) => {
        const customPath = document.getElementById('custom-template-path');
        const fileInput = document.getElementById('template-file-input');

        if (e.target.value === 'custom') {
            customPath.style.display = 'block';
            fileInput.style.display = 'block';
        } else {
            customPath.style.display = 'none';
            fileInput.style.display = 'none';
            customPath.value = '';
        }
    });

    // Advanced export toggle
    document.getElementById('advanced-export-toggle').addEventListener('change', (e) => {
        const advancedOptions = document.getElementById('advanced-export-options');
        if (e.target.checked) {
            advancedOptions.classList.remove('hidden');
            // Scroll the advanced options into view after they become visible
            setTimeout(() => {
                advancedOptions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } else {
            advancedOptions.classList.add('hidden');
        }
    });

    // Template file input
    document.getElementById('template-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('custom-template-path').value = file.path;
        }
    });

    // PDF geometry selection
    document.getElementById('pdf-geometry').addEventListener('change', (e) => {
        const customGeometry = document.getElementById('custom-geometry');
        if (e.target.value === 'custom') {
            customGeometry.style.display = 'block';
        } else {
            customGeometry.style.display = 'none';
        }
    });

    // Page size selection - show/hide custom size inputs
    document.getElementById('page-size').addEventListener('change', (e) => {
        const customPageSize = document.getElementById('custom-page-size');
        if (e.target.value === 'custom') {
            customPageSize.style.display = 'block';
        } else {
            customPageSize.style.display = 'none';
        }
    });

    // Load saved page settings on startup
    ipcRenderer.send('get-page-settings');

    // Handle page settings data (can be called multiple times)
    ipcRenderer.on('page-settings-data', (event, settings) => {
        console.log('Received page settings:', settings);
        if (settings) {
            const pageSizeEl = document.getElementById('page-size');
            const pageOrientationEl = document.getElementById('page-orientation');
            const customPageSizeEl = document.getElementById('custom-page-size');
            const customWidthEl = document.getElementById('custom-width');
            const customHeightEl = document.getElementById('custom-height');

            if (pageSizeEl) pageSizeEl.value = settings.size || 'a4';
            if (pageOrientationEl) pageOrientationEl.value = settings.orientation || 'portrait';

            if (customWidthEl && settings.customWidth) {
                customWidthEl.value = settings.customWidth;
            }
            if (customHeightEl && settings.customHeight) {
                customHeightEl.value = settings.customHeight;
            }

            // Show custom inputs if size is custom
            if (customPageSizeEl) {
                if (settings.size === 'custom') {
                    customPageSizeEl.style.display = 'block';
                } else {
                    customPageSizeEl.style.display = 'none';
                }
            }
        }
    });

    // Export Profile buttons
    document.getElementById('save-profile-btn').addEventListener('click', saveCurrentProfile);
    document.getElementById('delete-profile-btn').addEventListener('click', deleteSelectedProfile);
    document.getElementById('export-profile-select').addEventListener('change', (e) => {
        loadProfile(e.target.value);
    });

    // Add metadata field
    document.getElementById('add-metadata-field').addEventListener('click', () => {
        const container = document.querySelector('.metadata-container');
        const newField = document.createElement('div');
        newField.className = 'metadata-field';
        newField.innerHTML = `
            <input type="text" placeholder="key" class="metadata-key">
            <input type="text" placeholder="value" class="metadata-value">
        `;
        container.appendChild(newField);
    });

    // Browse bibliography
    document.getElementById('browse-bibliography').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bib,.yaml,.yml,.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('bibliography-file').value = file.path;
            }
        };
        input.click();
    });

    // Browse CSL
    document.getElementById('browse-csl').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csl';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('csl-file').value = file.path;
            }
        };
        input.click();
    });

    // Dialog close buttons
    document.getElementById('export-dialog-close').addEventListener('click', hideExportDialog);
    document.getElementById('export-cancel').addEventListener('click', hideExportDialog);

    // Export confirm
    document.getElementById('export-confirm').addEventListener('click', () => {
        const options = collectExportOptions();
        ipcRenderer.send('export-with-options', {
            format: currentExportFormat,
            options: options
        });
        hideExportDialog();
    });
});

// Batch Conversion Dialog functionality
let currentBatchOptions = {};

ipcRenderer.on('show-batch-dialog', () => {
    showBatchDialog();
});

// Universal Converter dialog handlers
ipcRenderer.on('show-universal-converter-dialog', () => {
    showUniversalConverterDialog();
});

// Batch converter menu items - open universal converter with batch mode and correct tool
ipcRenderer.on('show-batch-converter', (event, type) => {
    showUniversalConverterDialog();
    // Map batch type to the appropriate tool
    const toolMap = { image: 'imagemagick', audio: 'ffmpeg', video: 'ffmpeg', pdf: 'libreoffice' };
    const tool = toolMap[type] || 'libreoffice';
    const toolSelect = document.getElementById('converter-tool');
    if (toolSelect) {
        toolSelect.value = tool;
        updateConverterFormats(tool);
    }
    // Enable batch mode
    const batchToggle = document.getElementById('converter-batch-mode');
    if (batchToggle) {
        batchToggle.checked = true;
        batchToggle.dispatchEvent(new Event('change'));
    }
});

ipcRenderer.on('conversion-status', (event, status) => {
    document.getElementById('converter-status').textContent = status;
});

ipcRenderer.on('conversion-complete', (event, result) => {
    document.getElementById('converter-progress').classList.add('hidden');
    if (result.success) {
        window.modals.converterModal.close();
    }
});

ipcRenderer.on('batch-progress', (event, progress) => {
    updateBatchProgress(progress);
});

ipcRenderer.on('folder-selected', (event, { type, path }) => {
    if (type === 'input') {
        document.getElementById('batch-input-folder').value = path;
        validateBatchForm();
    } else if (type === 'output') {
        document.getElementById('batch-output-folder').value = path;
        validateBatchForm();
    } else if (type === 'converter-batch-input') {
        document.getElementById('converter-batch-input-folder').value = path;
    } else if (type === 'converter-batch-output') {
        document.getElementById('converter-batch-output-folder').value = path;
    }
});

function showBatchDialog() {
    window.modals.batchModal.open();

    // Reset form
    document.getElementById('batch-input-folder').value = '';
    document.getElementById('batch-output-folder').value = '';
    document.getElementById('batch-format').value = 'html';
    document.getElementById('batch-include-subfolders').checked = true;
    document.getElementById('batch-progress').classList.add('hidden');
    document.getElementById('batch-start').disabled = true;

    currentBatchOptions = {
        template: 'default',
        metadata: {},
        variables: {},
        toc: false,
        tocDepth: 3,
        numberSections: false,
        citeproc: false
    };
}

function hideBatchDialog() {
    window.modals.batchModal.close();
}

function updateBatchProgress(progress) {
    const progressSection = document.getElementById('batch-progress');
    const progressFill = document.getElementById('batch-progress-fill');
    const progressText = document.getElementById('batch-progress-text');
    const progressCount = document.getElementById('batch-progress-count');

    progressSection.classList.remove('hidden');

    const percentage = Math.round((progress.completed / progress.total) * 100);
    progressFill.style.width = `${percentage}%`;

    if (progress.completed === progress.total) {
        progressText.textContent = 'Conversion complete!';
    } else {
        progressText.textContent = `Processing: ${progress.currentFile}`;
    }

    progressCount.textContent = `${progress.completed} / ${progress.total}`;
}

function validateBatchForm() {
    const inputFolder = document.getElementById('batch-input-folder').value.trim();
    const outputFolder = document.getElementById('batch-output-folder').value.trim();
    const startButton = document.getElementById('batch-start');

    startButton.disabled = !inputFolder || !outputFolder;
}

// Event listeners for batch dialog
document.addEventListener('DOMContentLoaded', () => {
    // Browse input folder
    document.getElementById('browse-input-folder').addEventListener('click', () => {
        ipcRenderer.send('select-folder', 'input');
    });

    // Browse output folder
    document.getElementById('browse-output-folder').addEventListener('click', () => {
        ipcRenderer.send('select-folder', 'output');
    });

    // Show advanced options
    document.getElementById('batch-show-options').addEventListener('click', () => {
        const format = document.getElementById('batch-format').value;
        currentExportFormat = format;
        showExportDialog(format);
    });

    // Dialog close buttons
    document.getElementById('batch-dialog-close').addEventListener('click', hideBatchDialog);
    document.getElementById('batch-cancel').addEventListener('click', hideBatchDialog);

    // Start batch conversion
    document.getElementById('batch-start').addEventListener('click', () => {
        const inputFolder = document.getElementById('batch-input-folder').value.trim();
        const outputFolder = document.getElementById('batch-output-folder').value.trim();
        const format = document.getElementById('batch-format').value;

        if (!inputFolder || !outputFolder) {
            return;
        }

        // Use current export options from advanced dialog if they were set
        const options = currentBatchOptions;

        // Start batch conversion
        ipcRenderer.send('batch-convert', {
            inputFolder,
            outputFolder,
            format,
            options
        });

        // Show progress
        document.getElementById('batch-progress').classList.remove('hidden');
        document.getElementById('batch-start').disabled = true;
    });

    // Input validation
    document.getElementById('batch-input-folder').addEventListener('input', validateBatchForm);
    document.getElementById('batch-output-folder').addEventListener('input', validateBatchForm);
});

// Override the export dialog confirm to also save batch options
const originalExportConfirm = document.getElementById('export-confirm');
if (originalExportConfirm) {
    originalExportConfirm.addEventListener('click', () => {
        // If batch dialog is open, save options for batch conversion
        if (window.modals.batchModal.isOpen()) {
            currentBatchOptions = collectExportOptions();
        }
    });
}

// Universal File Converter Dialog Functions
let converterFilePath = '';

// Format definitions for each converter
const converterFormats = {
    libreoffice: {
        input: [
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'doc', label: 'Word 97-2003 (DOC)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'txt', label: 'Plain Text (TXT)' },
            { value: 'html', label: 'HTML Document' },
            { value: 'htm', label: 'HTM Document' },
            { value: 'xlsx', label: 'Excel Spreadsheet (XLSX)' },
            { value: 'xls', label: 'Excel 97-2003 (XLS)' },
            { value: 'ods', label: 'OpenDocument Spreadsheet (ODS)' },
            { value: 'csv', label: 'Comma Separated Values (CSV)' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' },
            { value: 'ppt', label: 'PowerPoint 97-2003 (PPT)' },
            { value: 'odp', label: 'OpenDocument Presentation (ODP)' }
        ],
        output: [
            { value: 'pdf', label: 'PDF Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'doc', label: 'Word 97-2003 (DOC)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'txt', label: 'Plain Text (TXT)' },
            { value: 'html', label: 'HTML Document' },
            { value: 'xlsx', label: 'Excel Spreadsheet (XLSX)' },
            { value: 'xls', label: 'Excel 97-2003 (XLS)' },
            { value: 'ods', label: 'OpenDocument Spreadsheet (ODS)' },
            { value: 'csv', label: 'CSV' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' },
            { value: 'ppt', label: 'PowerPoint 97-2003 (PPT)' },
            { value: 'odp', label: 'OpenDocument Presentation (ODP)' }
        ]
    },
    imagemagick: {
        input: [
            { value: 'jpg', label: 'JPEG Image (JPG)' },
            { value: 'jpeg', label: 'JPEG Image (JPEG)' },
            { value: 'png', label: 'PNG Image' },
            { value: 'gif', label: 'GIF Image' },
            { value: 'bmp', label: 'Bitmap Image (BMP)' },
            { value: 'tiff', label: 'TIFF Image' },
            { value: 'tif', label: 'TIF Image' },
            { value: 'webp', label: 'WebP Image' },
            { value: 'svg', label: 'SVG Vector Image' },
            { value: 'ico', label: 'Icon File (ICO)' },
            { value: 'psd', label: 'Photoshop (PSD)' },
            { value: 'raw', label: 'RAW Image' },
            { value: 'cr2', label: 'Canon RAW (CR2)' },
            { value: 'nef', label: 'Nikon RAW (NEF)' },
            { value: 'heic', label: 'HEIC Image' },
            { value: 'avif', label: 'AVIF Image' }
        ],
        output: [
            { value: 'jpg', label: 'JPEG Image (JPG)' },
            { value: 'png', label: 'PNG Image' },
            { value: 'gif', label: 'GIF Image' },
            { value: 'bmp', label: 'Bitmap Image (BMP)' },
            { value: 'tiff', label: 'TIFF Image' },
            { value: 'webp', label: 'WebP Image' },
            { value: 'svg', label: 'SVG Vector Image' },
            { value: 'ico', label: 'Icon File (ICO)' },
            { value: 'pdf', label: 'PDF Document' },
            { value: 'eps', label: 'EPS Vector' },
            { value: 'ps', label: 'PostScript' },
            { value: 'avif', label: 'AVIF Image' }
        ]
    },
    ffmpeg: {
        input: [
            { value: 'mp4', label: 'MP4 Video' },
            { value: 'avi', label: 'AVI Video' },
            { value: 'mov', label: 'MOV Video (QuickTime)' },
            { value: 'mkv', label: 'MKV Video (Matroska)' },
            { value: 'wmv', label: 'WMV Video (Windows Media)' },
            { value: 'flv', label: 'FLV Video (Flash)' },
            { value: 'webm', label: 'WebM Video' },
            { value: 'mpeg', label: 'MPEG Video' },
            { value: 'mpg', label: 'MPG Video' },
            { value: 'm4v', label: 'M4V Video' },
            { value: 'mp3', label: 'MP3 Audio' },
            { value: 'wav', label: 'WAV Audio' },
            { value: 'ogg', label: 'OGG Audio' },
            { value: 'flac', label: 'FLAC Audio' },
            { value: 'aac', label: 'AAC Audio' },
            { value: 'm4a', label: 'M4A Audio' },
            { value: 'wma', label: 'WMA Audio' }
        ],
        output: [
            { value: 'mp4', label: 'MP4 Video' },
            { value: 'avi', label: 'AVI Video' },
            { value: 'mov', label: 'MOV Video (QuickTime)' },
            { value: 'mkv', label: 'MKV Video (Matroska)' },
            { value: 'webm', label: 'WebM Video' },
            { value: 'mpeg', label: 'MPEG Video' },
            { value: 'gif', label: 'Animated GIF' },
            { value: 'mp3', label: 'MP3 Audio' },
            { value: 'wav', label: 'WAV Audio' },
            { value: 'ogg', label: 'OGG Audio' },
            { value: 'flac', label: 'FLAC Audio' },
            { value: 'aac', label: 'AAC Audio' },
            { value: 'm4a', label: 'M4A Audio' }
        ]
    },
    pandoc: {
        input: [
            { value: 'md', label: 'Markdown (MD)' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'tex', label: 'LaTeX Document' },
            { value: 'latex', label: 'LaTeX' },
            { value: 'epub', label: 'EPUB eBook' },
            { value: 'rst', label: 'reStructuredText (RST)' },
            { value: 'textile', label: 'Textile' },
            { value: 'org', label: 'Org Mode' },
            { value: 'mediawiki', label: 'MediaWiki' },
            { value: 'docbook', label: 'DocBook XML' }
        ],
        output: [
            { value: 'html', label: 'HTML Document' },
            { value: 'pdf', label: 'PDF Document' },
            { value: 'docx', label: 'Word Document (DOCX)' },
            { value: 'odt', label: 'OpenDocument Text (ODT)' },
            { value: 'rtf', label: 'Rich Text Format (RTF)' },
            { value: 'epub', label: 'EPUB eBook' },
            { value: 'latex', label: 'LaTeX Document' },
            { value: 'md', label: 'Markdown (MD)' },
            { value: 'rst', label: 'reStructuredText (RST)' },
            { value: 'textile', label: 'Textile' },
            { value: 'org', label: 'Org Mode' },
            { value: 'mediawiki', label: 'MediaWiki' },
            { value: 'docbook', label: 'DocBook XML' },
            { value: 'pptx', label: 'PowerPoint (PPTX)' }
        ]
    }
};

function showUniversalConverterDialog() {
    window.modals.converterModal.open();
    converterFilePath = '';
    document.getElementById('converter-file-path').value = '';
    document.getElementById('converter-tool').value = 'libreoffice';
    document.getElementById('converter-progress').classList.add('hidden');
    updateConverterFormats('libreoffice');
}

function updateConverterFormats(tool) {
    const fromSelect = document.getElementById('converter-from');
    const toSelect = document.getElementById('converter-to');
    const helpText = document.getElementById('converter-tool-help');

    // Clear existing options
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    // Get formats for selected tool
    const formats = converterFormats[tool];

    if (formats) {
        // Populate input formats
        formats.input.forEach(format => {
            const option = document.createElement('option');
            option.value = format.value;
            option.textContent = format.label;
            fromSelect.appendChild(option);
        });

        // Populate output formats
        formats.output.forEach(format => {
            const option = document.createElement('option');
            option.value = format.value;
            option.textContent = format.label;
            toSelect.appendChild(option);
        });

        // Update help text
        if (tool === 'libreoffice') {
            helpText.textContent = 'Documents, Spreadsheets, Presentations - Office file conversions';
        } else if (tool === 'imagemagick') {
            helpText.textContent = 'Image format conversions - JPG, PNG, GIF, TIFF, WebP, SVG, and more';
        } else if (tool === 'ffmpeg') {
            helpText.textContent = 'Video and audio conversions - MP4, AVI, MOV, MP3, WAV, and more';
        } else if (tool === 'pandoc') {
            helpText.textContent = 'Document markup conversions - Markdown, HTML, LaTeX, EPUB, and more';
        }
    }
}

function updateConverterAdvancedOptions(tool) {
    // Hide all tool-specific options
    const allOptions = document.querySelectorAll('.converter-options');
    allOptions.forEach(opt => opt.classList.add('hidden'));

    // Show options for selected tool
    const toolOptions = document.querySelector(`.${tool}-options`);
    if (toolOptions) {
        toolOptions.classList.remove('hidden');
    }
}

function collectConverterAdvancedOptions(tool) {
    const options = {};
    const advancedMode = document.getElementById('converter-advanced-toggle').checked;

    if (!advancedMode) {
        return options;
    }

    // Tool-specific options
    if (tool === 'imagemagick') {
        options.quality = document.getElementById('imagemagick-quality').value;
        options.dpi = document.getElementById('imagemagick-dpi').value || null;
        options.resize = document.getElementById('imagemagick-resize').value || null;
        options.compression = document.getElementById('imagemagick-compression').value || null;
    } else if (tool === 'ffmpeg') {
        options.videoCodec = document.getElementById('ffmpeg-video-codec').value || null;
        options.audioCodec = document.getElementById('ffmpeg-audio-codec').value || null;
        options.bitrate = document.getElementById('ffmpeg-bitrate').value || null;
        options.preset = document.getElementById('ffmpeg-preset').value || null;
        options.framerate = document.getElementById('ffmpeg-framerate').value || null;
    } else if (tool === 'libreoffice') {
        options.quality = document.getElementById('libreoffice-quality').value || null;
        options.pageRange = document.getElementById('libreoffice-page-range').value || null;
        options.exportBookmarks = document.getElementById('libreoffice-export-bookmarks').checked;
    }

    return options;
}

document.addEventListener('DOMContentLoaded', () => {
    // Universal Converter tool change
    const converterTool = document.getElementById('converter-tool');
    if (converterTool) {
        converterTool.addEventListener('change', (e) => {
            updateConverterFormats(e.target.value);
            updateConverterAdvancedOptions(e.target.value);
        });
    }

    // Batch mode toggle
    const converterBatchMode = document.getElementById('converter-batch-mode');
    if (converterBatchMode) {
        converterBatchMode.addEventListener('change', (e) => {
            const batchOptions = document.getElementById('converter-batch-options');
            const singleFileSection = document.getElementById('converter-file-path').closest('.export-section');

            if (e.target.checked) {
                batchOptions.classList.remove('hidden');
                singleFileSection.style.display = 'none';
            } else {
                batchOptions.classList.add('hidden');
                singleFileSection.style.display = 'block';
            }
        });
    }

    // Advanced options toggle
    const converterAdvancedToggle = document.getElementById('converter-advanced-toggle');
    if (converterAdvancedToggle) {
        converterAdvancedToggle.addEventListener('change', (e) => {
            const advancedOptions = document.getElementById('converter-advanced-options');
            if (e.target.checked) {
                advancedOptions.classList.remove('hidden');
                // Update which tool-specific options to show
                updateConverterAdvancedOptions(document.getElementById('converter-tool').value);
            } else {
                advancedOptions.classList.add('hidden');
            }
        });
    }

    // ImageMagick quality slider
    const imagemagickQuality = document.getElementById('imagemagick-quality');
    if (imagemagickQuality) {
        imagemagickQuality.addEventListener('input', (e) => {
            document.getElementById('imagemagick-quality-value').textContent = e.target.value;
        });
    }

    // Browse batch input folder
    const browseBatchInput = document.getElementById('browse-converter-batch-input');
    if (browseBatchInput) {
        browseBatchInput.addEventListener('click', () => {
            ipcRenderer.send('select-folder', 'converter-batch-input');
        });
    }

    // Browse batch output folder
    const browseBatchOutput = document.getElementById('browse-converter-batch-output');
    if (browseBatchOutput) {
        browseBatchOutput.addEventListener('click', () => {
            ipcRenderer.send('select-folder', 'converter-batch-output');
        });
    }

    // Browse for file to convert
    const browseConverterFile = document.getElementById('browse-converter-file');
    if (browseConverterFile) {
        browseConverterFile.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    converterFilePath = file.path;
                    document.getElementById('converter-file-path').value = file.path;
                }
            };
            input.click();
        });
    }

    // Universal Converter dialog close
    const converterDialogClose = document.getElementById('converter-dialog-close');
    if (converterDialogClose) {
        converterDialogClose.addEventListener('click', () => {
            window.modals.converterModal.close();
        });
    }

    // Universal Converter cancel
    const converterCancel = document.getElementById('converter-cancel');
    if (converterCancel) {
        converterCancel.addEventListener('click', () => {
            window.modals.converterModal.close();
        });
    }

    // Universal Converter convert
    const converterConvert = document.getElementById('converter-convert');
    if (converterConvert) {
        converterConvert.addEventListener('click', () => {
            const tool = document.getElementById('converter-tool').value;
            const fromFormat = document.getElementById('converter-from').value;
            const toFormat = document.getElementById('converter-to').value;
            const batchMode = document.getElementById('converter-batch-mode').checked;
            const advancedOptions = collectConverterAdvancedOptions(tool);

            if (batchMode) {
                // Batch conversion
                const inputFolder = document.getElementById('converter-batch-input-folder').value.trim();
                const outputFolder = document.getElementById('converter-batch-output-folder').value.trim();
                const includeSubfolders = document.getElementById('converter-batch-subfolders').checked;

                if (!inputFolder || !outputFolder) {
                    alert('Please select both input and output folders for batch conversion');
                    return;
                }

                // Show progress
                document.getElementById('converter-progress').classList.remove('hidden');

                // Send batch conversion request
                ipcRenderer.send('universal-convert-batch', {
                    tool,
                    fromFormat,
                    toFormat,
                    inputFolder,
                    outputFolder,
                    includeSubfolders,
                    advancedOptions
                });
            } else {
                // Single file conversion
                const filePath = converterFilePath;

                if (!filePath) {
                    alert('Please select a file to convert');
                    return;
                }

                // Show progress
                document.getElementById('converter-progress').classList.remove('hidden');

                // Send single file conversion request
                ipcRenderer.send('universal-convert', {
                    tool,
                    fromFormat,
                    toFormat,
                    filePath,
                    advancedOptions
                });
            }
        });
    }
});

// IPC event listeners for recent files functionality
ipcRenderer.on('recent-files-cleared', () => {
    if (tabManager) {
        tabManager.recentFiles = [];
        localStorage.setItem('recentFiles', JSON.stringify([]));
        console.log('Recent files cleared');
    }
});

// ========================================
// PDF Editor Dialog Functionality
// ========================================

let currentPDFOperation = null;
let mergeFilePaths = [];

// Show Table Generator Dialog
ipcRenderer.on('show-table-generator', () => {
    showTableGenerator();
});

// Show PDF Editor Dialog
ipcRenderer.on('show-pdf-editor-dialog', (event, operation, openedFilePath) => {
    currentPDFOperation = operation;
    showPDFEditorDialog(operation, openedFilePath);
});

function showPDFEditorDialog(operation, openedFilePath = null) {
    const title = document.getElementById('pdf-editor-title');

    // Hide all operation sections
    document.querySelectorAll('.pdf-operation-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show the appropriate section and set title
    let sectionId, titleText;
    switch (operation) {
        case 'merge':
            sectionId = 'pdf-merge-section';
            titleText = 'Merge PDFs';
            mergeFilePaths = [];
            // If we have an opened file, add it as the first file to merge
            if (openedFilePath) {
                mergeFilePaths.push(openedFilePath);
            }
            updateMergeFilesList();
            break;
        case 'split':
            sectionId = 'pdf-split-section';
            titleText = 'Split PDF';
            // Pre-fill input path if we have an opened file
            if (openedFilePath) {
                document.getElementById('split-input-path').value = openedFilePath;
            }
            break;
        case 'compress':
            sectionId = 'pdf-compress-section';
            titleText = 'Compress PDF';
            if (openedFilePath) {
                document.getElementById('compress-input-path').value = openedFilePath;
            }
            break;
        case 'rotate':
            sectionId = 'pdf-rotate-section';
            titleText = 'Rotate Pages';
            if (openedFilePath) {
                const rotateInput = document.getElementById('rotate-input-path');
                if (rotateInput) rotateInput.value = openedFilePath;
            }
            break;
        case 'delete':
            sectionId = 'pdf-delete-section';
            titleText = 'Delete Pages';
            if (openedFilePath) {
                const deleteInput = document.getElementById('delete-input-path');
                if (deleteInput) deleteInput.value = openedFilePath;
            }
            break;
        case 'reorder':
            sectionId = 'pdf-reorder-section';
            titleText = 'Reorder Pages';
            if (openedFilePath) {
                const reorderInput = document.getElementById('reorder-input-path');
                if (reorderInput) reorderInput.value = openedFilePath;
            }
            break;
        case 'watermark':
            sectionId = 'pdf-watermark-section';
            titleText = 'Add Watermark';
            if (openedFilePath) {
                const watermarkInput = document.getElementById('watermark-input-path');
                if (watermarkInput) watermarkInput.value = openedFilePath;
            }
            break;
        case 'encrypt':
            sectionId = 'pdf-encrypt-section';
            titleText = 'Password Protection';
            if (openedFilePath) {
                const encryptInput = document.getElementById('encrypt-input-path');
                if (encryptInput) encryptInput.value = openedFilePath;
            }
            break;
        case 'decrypt':
            sectionId = 'pdf-decrypt-section';
            titleText = 'Remove Password';
            if (openedFilePath) {
                const decryptInput = document.getElementById('decrypt-input-path');
                if (decryptInput) decryptInput.value = openedFilePath;
            }
            break;
        case 'permissions':
            sectionId = 'pdf-permissions-section';
            titleText = 'Set Permissions';
            if (openedFilePath) {
                const permInput = document.getElementById('permissions-input-path');
                if (permInput) permInput.value = openedFilePath;
            }
            break;
    }

    title.textContent = titleText;
    document.getElementById(sectionId).classList.remove('hidden');
    window.modals.pdfEditorModal.open();
}

function hidePDFEditorDialog() {
    window.modals.pdfEditorModal.close();
    document.getElementById('pdf-progress').classList.add('hidden');
    currentPDFOperation = null;
}

function updateMergeFilesList() {
    const listContainer = document.getElementById('merge-files-list');
    listContainer.innerHTML = '';

    mergeFilePaths.forEach((filePath, index) => {
        const fileEntry = document.createElement('div');
        fileEntry.className = 'file-entry';
        fileEntry.innerHTML = `
            <span class="file-name">${filePath.split(/[\\/]/).pop()}</span>
            <button class="remove-file" data-index="${index}">Remove</button>
        `;
        listContainer.appendChild(fileEntry);
    });
}

// PDF Editor Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Close PDF Editor Dialog
    const pdfEditorClose = document.getElementById('pdf-editor-dialog-close');
    if (pdfEditorClose) {
        pdfEditorClose.addEventListener('click', hidePDFEditorDialog);
    }

    const pdfEditorCancel = document.getElementById('pdf-editor-cancel');
    if (pdfEditorCancel) {
        pdfEditorCancel.addEventListener('click', hidePDFEditorDialog);
    }

    // Process button
    const pdfEditorProcess = document.getElementById('pdf-editor-process');
    if (pdfEditorProcess) {
        pdfEditorProcess.addEventListener('click', processPDFOperation);
    }

    // Merge PDFs - Add file button
    const addMergeFile = document.getElementById('add-merge-file');
    if (addMergeFile) {
        addMergeFile.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.multiple = true;
            input.onchange = (e) => {
                const files = Array.from(e.target.files);
                files.forEach(file => {
                    if (!mergeFilePaths.includes(file.path)) {
                        mergeFilePaths.push(file.path);
                    }
                });
                updateMergeFilesList();
            };
            input.click();
        });
    }

    // Remove file from merge list (using event delegation)
    const mergeFilesList = document.getElementById('merge-files-list');
    if (mergeFilesList) {
        mergeFilesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-file')) {
                const index = parseInt(e.target.dataset.index);
                mergeFilePaths.splice(index, 1);
                updateMergeFilesList();
            }
        });
    }

    // Browse buttons for all operations
    const browseButtons = [
        { id: 'browse-merge-output', inputId: 'merge-output-path', saveDialog: true },
        { id: 'browse-split-input', inputId: 'split-input-path', saveDialog: false },
        { id: 'browse-split-output', inputId: 'split-output-folder', folder: true },
        { id: 'browse-compress-input', inputId: 'compress-input-path', saveDialog: false },
        { id: 'browse-compress-output', inputId: 'compress-output-path', saveDialog: true },
        { id: 'browse-rotate-input', inputId: 'rotate-input-path', saveDialog: false },
        { id: 'browse-rotate-output', inputId: 'rotate-output-path', saveDialog: true },
        { id: 'browse-delete-input', inputId: 'delete-input-path', saveDialog: false },
        { id: 'browse-delete-output', inputId: 'delete-output-path', saveDialog: true },
        { id: 'browse-reorder-input', inputId: 'reorder-input-path', saveDialog: false },
        { id: 'browse-reorder-output', inputId: 'reorder-output-path', saveDialog: true },
        { id: 'browse-watermark-input', inputId: 'watermark-input-path', saveDialog: false },
        { id: 'browse-watermark-output', inputId: 'watermark-output-path', saveDialog: true },
        { id: 'browse-encrypt-input', inputId: 'encrypt-input-path', saveDialog: false },
        { id: 'browse-encrypt-output', inputId: 'encrypt-output-path', saveDialog: true },
        { id: 'browse-decrypt-input', inputId: 'decrypt-input-path', saveDialog: false },
        { id: 'browse-decrypt-output', inputId: 'decrypt-output-path', saveDialog: true },
        { id: 'browse-permissions-input', inputId: 'permissions-input-path', saveDialog: false },
        { id: 'browse-permissions-output', inputId: 'permissions-output-path', saveDialog: true }
    ];

    browseButtons.forEach(button => {
        const btn = document.getElementById(button.id);
        if (btn) {
            btn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';

                if (button.folder) {
                    // Request folder selection via IPC
                    ipcRenderer.send('select-pdf-folder', button.inputId);
                } else if (button.saveDialog) {
                    input.nwsaveas = true;
                    input.accept = '.pdf';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            document.getElementById(button.inputId).value = file.path;
                        }
                    };
                    input.click();
                } else {
                    input.accept = '.pdf';
                    input.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            document.getElementById(button.inputId).value = file.path;
                        }
                    };
                    input.click();
                }
            });
        }
    });

    // Split mode change handler
    const splitMode = document.getElementById('split-mode');
    if (splitMode) {
        splitMode.addEventListener('change', (e) => {
            // Hide all split options
            document.getElementById('split-pages-options').classList.add('hidden');
            document.getElementById('split-interval-options').classList.add('hidden');
            document.getElementById('split-size-options').classList.add('hidden');

            // Show selected split option
            if (e.target.value === 'pages') {
                document.getElementById('split-pages-options').classList.remove('hidden');
            } else if (e.target.value === 'interval') {
                document.getElementById('split-interval-options').classList.remove('hidden');
            } else if (e.target.value === 'size') {
                document.getElementById('split-size-options').classList.remove('hidden');
            }
        });
    }

    // Watermark opacity slider
    const watermarkOpacity = document.getElementById('watermark-opacity');
    if (watermarkOpacity) {
        watermarkOpacity.addEventListener('input', (e) => {
            document.getElementById('watermark-opacity-value').textContent = e.target.value;
        });
    }

    // Watermark pages selection
    const watermarkPages = document.getElementById('watermark-pages');
    if (watermarkPages) {
        watermarkPages.addEventListener('change', (e) => {
            const customPages = document.getElementById('watermark-custom-pages');
            if (e.target.value === 'custom') {
                customPages.classList.remove('hidden');
            } else {
                customPages.classList.add('hidden');
            }
        });
    }

    // Overwrite checkbox handlers - toggle Save As section visibility
    const overwriteCheckboxes = [
        { checkbox: 'compress-overwrite', section: 'compress-saveas-section' },
        { checkbox: 'rotate-overwrite', section: 'rotate-saveas-section' },
        { checkbox: 'delete-overwrite', section: 'delete-saveas-section' },
        { checkbox: 'reorder-overwrite', section: 'reorder-saveas-section' },
        { checkbox: 'watermark-overwrite', section: 'watermark-saveas-section' },
        { checkbox: 'encrypt-overwrite', section: 'encrypt-saveas-section' },
        { checkbox: 'decrypt-overwrite', section: 'decrypt-saveas-section' },
        { checkbox: 'permissions-overwrite', section: 'permissions-saveas-section' }
    ];

    overwriteCheckboxes.forEach(item => {
        const checkbox = document.getElementById(item.checkbox);
        const section = document.getElementById(item.section);
        if (checkbox && section) {
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    section.classList.add('hidden');
                } else {
                    section.classList.remove('hidden');
                }
            });
        }
    });

    // Load current page order button
    const loadCurrentOrder = document.getElementById('load-current-order');
    if (loadCurrentOrder) {
        loadCurrentOrder.addEventListener('click', () => {
            const inputPath = document.getElementById('reorder-input-path').value;
            if (!inputPath) {
                alert('Please select a PDF file first');
                return;
            }
            // Request page count from main process
            ipcRenderer.send('get-pdf-page-count', inputPath);
        });
    }
});

// Handle folder selection response
ipcRenderer.on('pdf-folder-selected', (event, { inputId, path }) => {
    document.getElementById(inputId).value = path;
});

// Handle PDF page count response
ipcRenderer.on('pdf-page-count', (event, { count, error }) => {
    if (error) {
        alert('Error reading PDF: ' + error);
        return;
    }

    const currentOrder = Array.from({ length: count }, (_, i) => i + 1).join(', ');
    document.getElementById('current-order-display').textContent = currentOrder;
    document.getElementById('current-page-order').classList.remove('hidden');
    document.getElementById('reorder-pages').value = currentOrder;
});

// Process PDF Operation
function processPDFOperation() {
    const operation = currentPDFOperation;
    let operationData = { operation };

    try {
        switch (operation) {
            case 'merge':
                if (mergeFilePaths.length < 2) {
                    alert('Please add at least 2 PDF files to merge');
                    return;
                }
                operationData.inputFiles = mergeFilePaths;
                operationData.outputPath = document.getElementById('merge-output-path').value.trim();
                if (!operationData.outputPath) {
                    alert('Please select an output file path');
                    return;
                }
                break;

            case 'split':
                operationData.inputPath = document.getElementById('split-input-path').value.trim();
                operationData.outputFolder = document.getElementById('split-output-folder').value.trim();
                operationData.splitMode = document.getElementById('split-mode').value;

                if (!operationData.inputPath || !operationData.outputFolder) {
                    alert('Please select input file and output folder');
                    return;
                }

                if (operationData.splitMode === 'pages') {
                    operationData.pageRanges = document.getElementById('split-page-ranges').value.trim();
                } else if (operationData.splitMode === 'interval') {
                    operationData.interval = parseInt(document.getElementById('split-interval').value);
                } else if (operationData.splitMode === 'size') {
                    operationData.maxSize = parseInt(document.getElementById('split-size').value);
                }
                break;

            case 'compress':
                operationData.inputPath = document.getElementById('compress-input-path').value.trim();
                operationData.overwrite = document.getElementById('compress-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('compress-output-path').value.trim();
                operationData.compressionLevel = document.getElementById('compress-level').value;
                operationData.compressImages = document.getElementById('compress-images').checked;
                operationData.removeDuplicates = document.getElementById('compress-remove-duplicates').checked;
                operationData.optimizeFonts = document.getElementById('compress-optimize-fonts').checked;

                if (!operationData.inputPath || !operationData.outputPath) {
                    alert('Please select input file' + (operationData.overwrite ? '' : ' and output file paths'));
                    return;
                }
                break;

            case 'rotate':
                operationData.inputPath = document.getElementById('rotate-input-path').value.trim();
                operationData.overwrite = document.getElementById('rotate-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('rotate-output-path').value.trim();
                operationData.pages = document.getElementById('rotate-pages').value.trim();
                operationData.angle = parseInt(document.getElementById('rotate-angle').value);

                if (!operationData.inputPath || !operationData.outputPath) {
                    alert('Please select input file' + (operationData.overwrite ? '' : ' and output file'));
                    return;
                }
                break;

            case 'delete':
                operationData.inputPath = document.getElementById('delete-input-path').value.trim();
                operationData.overwrite = document.getElementById('delete-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('delete-output-path').value.trim();
                operationData.pages = document.getElementById('delete-pages').value.trim();

                if (!operationData.inputPath || !operationData.outputPath || !operationData.pages) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'reorder':
                operationData.inputPath = document.getElementById('reorder-input-path').value.trim();
                operationData.overwrite = document.getElementById('reorder-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('reorder-output-path').value.trim();
                operationData.newOrder = document.getElementById('reorder-pages').value.trim();

                if (!operationData.inputPath || !operationData.outputPath || !operationData.newOrder) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'watermark':
                operationData.inputPath = document.getElementById('watermark-input-path').value.trim();
                operationData.overwrite = document.getElementById('watermark-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('watermark-output-path').value.trim();
                operationData.text = document.getElementById('watermark-text').value.trim();
                operationData.fontSize = parseInt(document.getElementById('watermark-font-size').value);
                operationData.opacity = parseInt(document.getElementById('watermark-opacity').value) / 100;
                operationData.position = document.getElementById('watermark-position').value;
                operationData.color = document.getElementById('watermark-color').value;
                operationData.pages = document.getElementById('watermark-pages').value;

                if (operationData.pages === 'custom') {
                    operationData.customPages = document.getElementById('watermark-custom-pages').value.trim();
                }

                if (!operationData.inputPath || !operationData.outputPath || !operationData.text) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'encrypt':
                operationData.inputPath = document.getElementById('encrypt-input-path').value.trim();
                operationData.overwrite = document.getElementById('encrypt-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('encrypt-output-path').value.trim();
                operationData.userPassword = document.getElementById('encrypt-user-password').value;
                operationData.ownerPassword = document.getElementById('encrypt-owner-password').value;
                operationData.encryptionLevel = parseInt(document.getElementById('encrypt-level').value);

                operationData.permissions = {
                    printing: document.getElementById('encrypt-allow-printing').checked,
                    modifying: document.getElementById('encrypt-allow-modify').checked,
                    copying: document.getElementById('encrypt-allow-copy').checked,
                    annotating: document.getElementById('encrypt-allow-annotate').checked,
                    fillingForms: document.getElementById('encrypt-allow-forms').checked,
                    contentAccessibility: document.getElementById('encrypt-allow-extract').checked,
                    documentAssembly: document.getElementById('encrypt-allow-assemble').checked,
                    printingQuality: document.getElementById('encrypt-allow-print-high').checked
                };

                if (!operationData.inputPath || !operationData.outputPath || !operationData.userPassword) {
                    alert('Please select file and enter a user password');
                    return;
                }
                break;

            case 'decrypt':
                operationData.inputPath = document.getElementById('decrypt-input-path').value.trim();
                operationData.overwrite = document.getElementById('decrypt-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('decrypt-output-path').value.trim();
                operationData.password = document.getElementById('decrypt-password').value;

                if (!operationData.inputPath || !operationData.outputPath || !operationData.password) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;

            case 'permissions':
                operationData.inputPath = document.getElementById('permissions-input-path').value.trim();
                operationData.overwrite = document.getElementById('permissions-overwrite').checked;
                operationData.outputPath = operationData.overwrite ? operationData.inputPath : document.getElementById('permissions-output-path').value.trim();
                operationData.currentPassword = document.getElementById('permissions-current-password').value;
                operationData.ownerPassword = document.getElementById('permissions-owner-password').value;

                operationData.permissions = {
                    printing: document.getElementById('permissions-allow-printing').checked,
                    modifying: document.getElementById('permissions-allow-modify').checked,
                    copying: document.getElementById('permissions-allow-copy').checked,
                    annotating: document.getElementById('permissions-allow-annotate').checked,
                    fillingForms: document.getElementById('permissions-allow-forms').checked,
                    contentAccessibility: document.getElementById('permissions-allow-extract').checked,
                    documentAssembly: document.getElementById('permissions-allow-assemble').checked,
                    printingQuality: document.getElementById('permissions-allow-print-high').checked
                };

                if (!operationData.inputPath || !operationData.outputPath || !operationData.ownerPassword) {
                    alert('Please fill in all required fields');
                    return;
                }
                break;
        }

        // Show progress
        document.getElementById('pdf-progress').classList.remove('hidden');
        document.getElementById('pdf-progress-text').textContent = 'Processing PDF...';

        // Send to main process
        ipcRenderer.send('process-pdf-operation', operationData);

    } catch (error) {
        alert('Error: ' + error.message);
        console.error('PDF operation error:', error);
    }
}

// Handle PDF operation completion
ipcRenderer.on('pdf-operation-complete', (event, { success, error, message }) => {
    document.getElementById('pdf-progress').classList.add('hidden');

    if (success) {
        alert(message || 'PDF operation completed successfully!');
        hidePDFEditorDialog();
    } else {
        alert('Error: ' + (error || 'PDF operation failed'));
    }
});

// Handle PDF operation progress
ipcRenderer.on('pdf-operation-progress', (event, { message, progress }) => {
    document.getElementById('pdf-progress-text').textContent = message;
    if (progress !== undefined) {
        const progressFill = document.getElementById('pdf-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }
});

// Add math rendering support using KaTeX for enhanced preview
function initMathSupport() {
    // Add KaTeX CSS
    const katexCSS = document.createElement('link');
    katexCSS.rel = 'stylesheet';
    katexCSS.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
    katexCSS.crossOrigin = 'anonymous';
    document.head.appendChild(katexCSS);

    // Add KaTeX JS
    const katexJS = document.createElement('script');
    katexJS.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
    katexJS.crossOrigin = 'anonymous';
    katexJS.onload = () => {
        // Add auto-render extension
        const autoRenderJS = document.createElement('script');
        autoRenderJS.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js';
        autoRenderJS.crossOrigin = 'anonymous';
        autoRenderJS.onload = () => {
            console.log('Math support (KaTeX) initialized');
            // Re-render current preview to include math
            if (tabManager) {
                tabManager.updatePreview();
            }
        };
        document.head.appendChild(autoRenderJS);
    };
    document.head.appendChild(katexJS);
}

// Initialize math support on load
initMathSupport();

// ================================
// Header & Footer Dialog Management
// ================================

let currentFieldTarget = null; // Track which input field is being edited

// Open header/footer settings dialog
function openHeaderFooterDialog() {
    window.modals.headerFooterModal.open();

    // Request current settings from main process
    ipcRenderer.send('get-header-footer-settings');
}

// Close header/footer settings dialog
function closeHeaderFooterDialog() {
    window.modals.headerFooterModal.close();
}

// Open field picker dialog
function openFieldPickerDialog(targetInputId) {
    currentFieldTarget = targetInputId;
    window.modals.fieldPickerModal.open();
}

// Close field picker dialog
function closeFieldPickerDialog() {
    window.modals.fieldPickerModal.close();
    currentFieldTarget = null;
}

// Load settings into dialog
ipcRenderer.on('header-footer-settings-data', (event, settings) => {
    // Enable/disable checkbox
    document.getElementById('hf-enabled').checked = settings.enabled;

    // Header fields
    document.getElementById('header-left').value = settings.header.left || '';
    document.getElementById('header-center').value = settings.header.center || '';
    document.getElementById('header-right').value = settings.header.right || '';

    // Footer fields
    document.getElementById('footer-left').value = settings.footer.left || '';
    document.getElementById('footer-center').value = settings.footer.center || '';
    document.getElementById('footer-right').value = settings.footer.right || '';

    // Logo previews
    if (settings.header.logo) {
        document.getElementById('header-logo-preview').textContent = settings.header.logo.split(/[\\/]/).pop();
    } else {
        document.getElementById('header-logo-preview').textContent = '';
    }

    if (settings.footer.logo) {
        document.getElementById('footer-logo-preview').textContent = settings.footer.logo.split(/[\\/]/).pop();
    } else {
        document.getElementById('footer-logo-preview').textContent = '';
    }

    // Update config content visibility
    toggleConfigContent();
});

// Toggle config content based on enabled checkbox
function toggleConfigContent() {
    const enabled = document.getElementById('hf-enabled').checked;
    const configContent = document.getElementById('hf-config-content');

    if (enabled) {
        configContent.classList.remove('disabled');
    } else {
        configContent.classList.add('disabled');
    }
}

// Save header/footer settings
function saveHeaderFooterSettings() {
    const settings = {
        enabled: document.getElementById('hf-enabled').checked,
        header: {
            left: document.getElementById('header-left').value || '',
            center: document.getElementById('header-center').value || '',
            right: document.getElementById('header-right').value || '',
            logo: null // Logo paths are managed separately
        },
        footer: {
            left: document.getElementById('footer-left').value || '',
            center: document.getElementById('footer-center').value || '',
            right: document.getElementById('footer-right').value || '',
            logo: null
        }
    };

    ipcRenderer.send('save-header-footer-settings', settings);
    closeHeaderFooterDialog();
}

// Handle logo browsing - ask main process to show open dialog
function browseForLogo(position) {
    ipcRenderer.send('browse-header-footer-logo', position);
}

// Handle logo saved confirmation
ipcRenderer.on('header-footer-logo-saved', (event, { position, path }) => {
    document.getElementById(`${position}-logo-preview`).textContent = path.split(/[\\/]/).pop();
});

// Clear logo
function clearLogo(position) {
    ipcRenderer.send('clear-header-footer-logo', position);
    document.getElementById(`${position}-logo-preview`).textContent = '';
}

// Handle logo cleared confirmation
ipcRenderer.on('header-footer-logo-cleared', (event, position) => {
    console.log(`${position} logo cleared`);
});

// Insert dynamic field into input
function insertDynamicField(field) {
    if (currentFieldTarget) {
        const input = document.getElementById(currentFieldTarget);
        const cursorPos = input.selectionStart;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);

        input.value = textBefore + field + textAfter;
        input.focus();
        input.setSelectionRange(cursorPos + field.length, cursorPos + field.length);
    }

    closeFieldPickerDialog();
}

// Event Listeners for Header/Footer Dialog

// Close buttons
document.getElementById('header-footer-close').addEventListener('click', closeHeaderFooterDialog);
document.getElementById('header-footer-cancel').addEventListener('click', closeHeaderFooterDialog);
document.getElementById('header-footer-save').addEventListener('click', saveHeaderFooterSettings);

// Enable/disable checkbox
document.getElementById('hf-enabled').addEventListener('change', toggleConfigContent);

// Field insert buttons
document.querySelectorAll('.field-insert-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        openFieldPickerDialog(target);
    });
});

// Logo browse buttons
document.getElementById('header-logo-browse').addEventListener('click', () => browseForLogo('header'));
document.getElementById('footer-logo-browse').addEventListener('click', () => browseForLogo('footer'));

// Logo clear buttons
document.getElementById('header-logo-clear').addEventListener('click', () => clearLogo('header'));
document.getElementById('footer-logo-clear').addEventListener('click', () => clearLogo('footer'));

// Field picker dialog
document.getElementById('field-picker-close').addEventListener('click', closeFieldPickerDialog);
document.querySelectorAll('.field-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.getAttribute('data-field');
        insertDynamicField(field);
    });
});

// Export function to make openHeaderFooterDialog accessible globally
window.openHeaderFooterDialog = openHeaderFooterDialog;

// Listen for menu command to open dialog
ipcRenderer.on('open-header-footer-dialog', () => {
    openHeaderFooterDialog();
});
// Command Palette - initialized via CommandPalette class
// (see DOMContentLoaded handler for registration of commands)

// ============================================================================
// TABLE GENERATOR
// ============================================================================

function showTableGenerator() {
    window.modals.tableModal.open();

    // Generate initial preview
    generateTablePreview();

    // Focus on rows input
    setTimeout(() => {
        document.getElementById('table-rows').focus();
    }, 100);
}

function hideTableGenerator() {
    window.modals.tableModal.close();
}

function generateTablePreview() {
    const rows = parseInt(document.getElementById('table-rows').value) || 3;
    const cols = parseInt(document.getElementById('table-cols').value) || 3;
    const hasHeader = document.getElementById('table-has-header').checked;
    const alignment = document.getElementById('table-alignment').value;

    const table = generateMarkdownTable(rows, cols, hasHeader, alignment);
    document.getElementById('table-preview').textContent = table;
}

function generateMarkdownTable(rows, cols, hasHeader, alignment) {
    let table = '';

    // Generate alignment string
    let alignChar = '-';
    if (alignment === 'center') {
        alignChar = ':' + '-'.repeat(Math.max(8, 10)) + ':';
    } else if (alignment === 'right') {
        alignChar = '-'.repeat(Math.max(8, 10)) + ':';
    } else {
        alignChar = '-'.repeat(Math.max(8, 10));
    }

    // Generate header row
    if (hasHeader) {
        table += '| ';
        for (let c = 1; c <= cols; c++) {
            table += `Header ${c}`;
            if (c < cols) table += ' | ';
        }
        table += ' |\n';

        // Separator row
        table += '| ';
        for (let c = 1; c <= cols; c++) {
            table += alignChar;
            if (c < cols) table += ' | ';
        }
        table += ' |\n';

        // Data rows (excluding header)
        for (let r = 1; r < rows; r++) {
            table += '| ';
            for (let c = 1; c <= cols; c++) {
                table += `Cell ${r},${c}`;
                if (c < cols) table += ' | ';
            }
            table += ' |\n';
        }
    } else {
        // No header - all rows are data rows
        // First row (acts as separator position)
        table += '| ';
        for (let c = 1; c <= cols; c++) {
            table += `Cell 1,${c}`;
            if (c < cols) table += ' | ';
        }
        table += ' |\n';

        // Separator row
        table += '| ';
        for (let c = 1; c <= cols; c++) {
            table += alignChar;
            if (c < cols) table += ' | ';
        }
        table += ' |\n';

        // Remaining data rows
        for (let r = 2; r <= rows; r++) {
            table += '| ';
            for (let c = 1; c <= cols; c++) {
                table += `Cell ${r},${c}`;
                if (c < cols) table += ' | ';
            }
            table += ' |\n';
        }
    }

    return table;
}

function insertGeneratedTable() {
    const table = document.getElementById('table-preview').textContent;

    if (!table) {
        alert('Please generate a table preview first');
        return;
    }

    // Insert table using CodeMirror
    if (!tabManager) {
        alert('No active editor found');
        return;
    }

    // Add newlines for spacing
    const tableWithSpacing = '\n' + table + '\n';
    tabManager.insertAtCursor(tableWithSpacing);

    // Trigger update
    if (tabManager) {
        tabManager.handleEditorInput(tabManager.activeTabId);
    }

    // Close dialog
    hideTableGenerator();
}

// Table Generator Event Listeners
document.getElementById('table-dialog-close').addEventListener('click', hideTableGenerator);
document.getElementById('table-cancel').addEventListener('click', hideTableGenerator);
document.getElementById('table-generate-preview').addEventListener('click', generateTablePreview);
document.getElementById('table-insert').addEventListener('click', insertGeneratedTable);

// Auto-update preview when inputs change
document.getElementById('table-rows').addEventListener('input', generateTablePreview);
document.getElementById('table-cols').addEventListener('input', generateTablePreview);
document.getElementById('table-has-header').addEventListener('change', generateTablePreview);
document.getElementById('table-alignment').addEventListener('change', generateTablePreview);

// Handle Enter key in inputs
document.getElementById('table-rows').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        insertGeneratedTable();
    }
});

document.getElementById('table-cols').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        insertGeneratedTable();
    }
});

// ============================================================================
// ASCII ART GENERATOR
// ============================================================================

let currentASCIIMode = 'text';

function showASCIIGenerator() {
    window.modals.asciiModal.open();

    // Initialize with text mode
    switchASCIIMode('text');

    // Generate initial preview
    setTimeout(() => {
        generateASCIIPreview();
    }, 100);
}

function hideASCIIGenerator() {
    window.modals.asciiModal.close();
}

function switchASCIIMode(mode) {
    currentASCIIMode = mode;

    // Update button states
    document.querySelectorAll('.ascii-mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Hide all mode sections
    document.querySelectorAll('.ascii-mode-section').forEach(section => {
        section.classList.add('hidden');
    });

    // Show selected mode
    if (mode === 'text') {
        document.getElementById('ascii-mode-text').classList.add('active');
        document.getElementById('ascii-text-mode').classList.remove('hidden');
    } else if (mode === 'box') {
        document.getElementById('ascii-mode-box').classList.add('active');
        document.getElementById('ascii-box-mode').classList.remove('hidden');
    } else if (mode === 'templates') {
        document.getElementById('ascii-mode-templates').classList.add('active');
        document.getElementById('ascii-templates-mode').classList.remove('hidden');
    }

    // Generate preview
    generateASCIIPreview();
}

function generateASCIIPreview() {
    let result = '';

    if (currentASCIIMode === 'text') {
        const text = document.getElementById('ascii-text-input').value || 'Sample';
        const style = document.getElementById('ascii-font-style').value;
        result = textToASCII(text, style);
    } else if (currentASCIIMode === 'box') {
        const text = document.getElementById('ascii-box-text').value || 'Sample Text';
        const style = document.getElementById('ascii-box-style').value;
        const padding = parseInt(document.getElementById('ascii-box-padding').value) || 2;
        result = createASCIIBox(text, style, padding);
    } else if (currentASCIIMode === 'templates') {
        result = 'Select a template from the buttons above';
    }

    document.getElementById('ascii-preview').textContent = result;
}

// Simple ASCII art text generator
function textToASCII(text, style) {
    const fonts = {
        standard: {
            height: 5,
            chars: {
                'A': ['  _  ', ' / \\ ', '/___\\', '|   |', '|   |'],
                'B': ['____ ', '|   \\', '|___/', '|   \\', '|___/'],
                'C': [' ___ ', '/  _/', '|   \\', '|    ', '\\___/'],
                'D': ['____ ', '|   \\', '|    |', '|    |', '|___/'],
                'E': ['_____', '|    ', '|___ ', '|    ', '|____'],
                'F': ['_____', '|    ', '|___ ', '|    ', '|    '],
                'G': [' ___ ', '/   _', '|  ||', '|   |', '\\___/'],
                'H': ['|   |', '|   |', '|___|', '|   |', '|   |'],
                'I': ['_____', '  |  ', '  |  ', '  |  ', '_____'],
                'J': ['_____', '   | ', '   | ', '|  | ', '\\__/ '],
                'K': ['|   |', '|  / ', '|_/  ', '| \\  ', '|  \\ '],
                'L': ['|    ', '|    ', '|    ', '|    ', '|____'],
                'M': ['|   |', '|\\ /|', '| V |', '|   |', '|   |'],
                'N': ['|   |', '|\\  |', '| \\ |', '|  \\|', '|   |'],
                'O': [' ___ ', '/   \\', '|   |', '|   |', '\\___/'],
                'P': ['____ ', '|   \\', '|___/', '|    ', '|    '],
                'Q': [' ___ ', '/   \\', '|   |', '| |\\ ', '\\__\\|'],
                'R': ['____ ', '|   \\', '|___/', '| \\  ', '|  \\ '],
                'S': [' ___ ', '/  _/', '\\_  \\', '   \\ ', '\\___/'],
                'T': ['_____', '  |  ', '  |  ', '  |  ', '  |  '],
                'U': ['|   |', '|   |', '|   |', '|   |', '\\___/'],
                'V': ['|   |', '|   |', '|   |', ' \\ / ', '  V  '],
                'W': ['|   |', '|   |', '| W |', '|/ \\|', '|   |'],
                'X': ['|   |', ' \\ / ', '  X  ', ' / \\ ', '|   |'],
                'Y': ['|   |', ' \\ / ', '  Y  ', '  |  ', '  |  '],
                'Z': ['_____', '   / ', '  /  ', ' /   ', '/___ '],
                ' ': ['     ', '     ', '     ', '     ', '     '],
                '0': [' ___ ', '/   \\', '| | |', '|   |', '\\___/'],
                '1': ['  |  ', ' ||  ', '  |  ', '  |  ', ' _|_ '],
                '2': [' ___ ', '\\   /', ' __/ ', '/    ', '\\____'],
                '3': [' ___ ', '\\   /', ' __/ ', '   / ', '\\___/'],
                '4': ['|   |', '|   |', '|___|', '    |', '    |'],
                '5': [' ___ ', '|    ', '|___ ', '   / ', '\\___/'],
                '6': [' ___ ', '/    ', '|___ ', '|   |', '\\___/'],
                '7': ['_____', '   / ', '  /  ', ' /   ', '/    '],
                '8': [' ___ ', '|   |', ' ___ ', '|   |', '\\___/'],
                '9': [' ___ ', '|   |', '\\___|', '    |', '\\___/']
            }
        },
        banner: {
            height: 7,
            chars: {
                'A': ['   ###   ', '  ## ##  ', ' ##   ## ', ' ##   ## ', ' ####### ', ' ##   ## ', ' ##   ## '],
                'B': [' ######  ', ' ##   ## ', ' ##   ## ', ' ######  ', ' ##   ## ', ' ##   ## ', ' ######  '],
                'C': ['  #####  ', ' ##   ## ', ' ##      ', ' ##      ', ' ##      ', ' ##   ## ', '  #####  '],
                'D': [' ######  ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ######  '],
                'E': [' ####### ', ' ##      ', ' ##      ', ' #####   ', ' ##      ', ' ##      ', ' ####### '],
                'F': [' ####### ', ' ##      ', ' ##      ', ' #####   ', ' ##      ', ' ##      ', ' ##      '],
                'G': ['  #####  ', ' ##   ## ', ' ##      ', ' ##  ### ', ' ##   ## ', ' ##   ## ', '  #####  '],
                'H': [' ##   ## ', ' ##   ## ', ' ##   ## ', ' ####### ', ' ##   ## ', ' ##   ## ', ' ##   ## '],
                'I': [' ####### ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', ' ####### '],
                'J': [' ####### ', '     ##  ', '     ##  ', '     ##  ', ' ##  ##  ', ' ##  ##  ', '  ####   '],
                'K': [' ##   ## ', ' ##  ##  ', ' ## ##   ', ' ####    ', ' ## ##   ', ' ##  ##  ', ' ##   ## '],
                'L': [' ##      ', ' ##      ', ' ##      ', ' ##      ', ' ##      ', ' ##      ', ' ####### '],
                'M': [' ##   ## ', ' ### ### ', ' ####### ', ' ## # ## ', ' ##   ## ', ' ##   ## ', ' ##   ## '],
                'N': [' ##   ## ', ' ###  ## ', ' #### ## ', ' ## #### ', ' ##  ### ', ' ##   ## ', ' ##   ## '],
                'O': ['  #####  ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', '  #####  '],
                'P': [' ######  ', ' ##   ## ', ' ##   ## ', ' ######  ', ' ##      ', ' ##      ', ' ##      '],
                'Q': ['  #####  ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ## # ## ', ' ##  ##  ', '  ### ## '],
                'R': [' ######  ', ' ##   ## ', ' ##   ## ', ' ######  ', ' ## ##   ', ' ##  ##  ', ' ##   ## '],
                'S': ['  #####  ', ' ##   ## ', ' ##      ', '  #####  ', '      ## ', ' ##   ## ', '  #####  '],
                'T': [' ####### ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', '   ###   ', '   ###   '],
                'U': [' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', '  #####  '],
                'V': [' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', ' ##   ## ', '  ## ##  ', '   ###   '],
                'W': [' ##   ## ', ' ##   ## ', ' ##   ## ', ' ## # ## ', ' ####### ', ' ### ### ', ' ##   ## '],
                'X': [' ##   ## ', '  ## ##  ', '   ###   ', '    #    ', '   ###   ', '  ## ##  ', ' ##   ## '],
                'Y': [' ##   ## ', '  ## ##  ', '   ###   ', '    #    ', '    #    ', '    #    ', '    #    '],
                'Z': [' ####### ', '     ##  ', '    ##   ', '   ##    ', '  ##     ', ' ##      ', ' ####### '],
                ' ': ['         ', '         ', '         ', '         ', '         ', '         ', '         '],
                '0': ['  #####  ', ' ##   ## ', ' ##  ### ', ' ## #### ', ' ###  ## ', ' ##   ## ', '  #####  '],
                '1': ['    ##   ', '   ###   ', '    ##   ', '    ##   ', '    ##   ', '    ##   ', ' ####### '],
                '2': ['  #####  ', ' ##   ## ', '      ## ', '    ##   ', '  ##     ', ' ##      ', ' ####### '],
                '3': ['  #####  ', ' ##   ## ', '      ## ', '    ###  ', '      ## ', ' ##   ## ', '  #####  '],
                '4': ['    ###  ', '   ####  ', '  ## ##  ', ' ##  ##  ', ' ####### ', '     ##  ', '     ##  '],
                '5': [' ####### ', ' ##      ', ' ######  ', '      ## ', '      ## ', ' ##   ## ', '  #####  '],
                '6': ['  #####  ', ' ##   ## ', ' ##      ', ' ######  ', ' ##   ## ', ' ##   ## ', '  #####  '],
                '7': [' ####### ', '      ## ', '     ##  ', '    ##   ', '   ##    ', '  ##     ', ' ##      '],
                '8': ['  #####  ', ' ##   ## ', ' ##   ## ', '  #####  ', ' ##   ## ', ' ##   ## ', '  #####  '],
                '9': ['  #####  ', ' ##   ## ', ' ##   ## ', '  ###### ', '      ## ', ' ##   ## ', '  #####  ']
            }
        },
        block: {
            height: 6,
            chars: {
                'A': ['█████╗ ', '██╔══██╗', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
                'B': ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
                'C': ['██████╗', '██╔════╝', '██║     ', '██║     ', '╚██████╗', ' ╚═════╝'],
                'D': ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
                'E': ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
                'F': ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '██║     ', '╚═╝     '],
                'G': ['██████╗ ', '██╔════╝', '██║  ███╗', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
                'H': ['██╗  ██╗', '██║  ██║', '███████║', '██╔══██║', '██║  ██║', '╚═╝  ╚═╝'],
                'I': ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
                ' ': ['    ', '    ', '    ', '    ', '    ', '    ']
            }
        },
        bubble: {
            height: 5,
            chars: {
                'A': ['  Ⓐ  ', ' ⒜ ⒜ ', '⒜⒜⒜⒜⒜', '⒜   ⒜', '⒜   ⒜'],
                'B': ['ⒷⒷⒷⒷ ', 'Ⓑ   Ⓑ', 'ⒷⒷⒷⒷ ', 'Ⓑ   Ⓑ', 'ⒷⒷⒷⒷ '],
                'C': [' ⒸⒸⒸ ', 'Ⓒ    ', 'Ⓒ    ', 'Ⓒ    ', ' ⒸⒸⒸ '],
                ' ': ['     ', '     ', '     ', '     ', '     ']
            }
        },
        digital: {
            height: 7,
            chars: {
                'A': [' ▄▀▀▀▄ ', '▐    ▌', '▐▄▄▄▄▌', '▐    ▌', '▐    ▌', '▐    ▌', '       '],
                'B': ['▐▀▀▀▄ ', '▐▄▄▄▀ ', '▐▄▄▄▄ ', '▐    ▌', '▐▄▄▄▀ ', '       ', '       '],
                'C': [' ▄▀▀▀▄', '▐     ', '▐     ', '▐     ', ' ▀▄▄▄▀', '       ', '       '],
                ' ': ['       ', '       ', '       ', '       ', '       ', '       ', '       ']
            }
        }
    };

    // Use selected font or fallback to standard
    const font = fonts[style] || fonts.standard;
    const lines = [];
    const upperText = text.toUpperCase();

    for (let i = 0; i < font.height; i++) {
        lines[i] = '';
    }

    for (let char of upperText) {
        const charLines = font.chars[char] || font.chars[' '];
        if (charLines) {
            for (let i = 0; i < font.height; i++) {
                lines[i] += (charLines[i] || ' '.repeat(font.chars[' '][i].length));
            }
        }
    }

    return lines.join('\n');
}

// Create ASCII box/frame
function createASCIIBox(text, style, padding) {
    const styles = {
        single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
        double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
        rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
        bold: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
        ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' }
    };

    const chars = styles[style] || styles.single;
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const width = maxLength + (padding * 2);

    let result = '';

    // Top border
    result += chars.tl + chars.h.repeat(width) + chars.tr + '\n';

    // Padding rows above
    for (let i = 0; i < padding - 1; i++) {
        result += chars.v + ' '.repeat(width) + chars.v + '\n';
    }

    // Content lines
    for (let line of lines) {
        const paddedLine = line.padEnd(maxLength, ' ');
        result += chars.v + ' '.repeat(padding) + paddedLine + ' '.repeat(padding) + chars.v + '\n';
    }

    // Padding rows below
    for (let i = 0; i < padding - 1; i++) {
        result += chars.v + ' '.repeat(width) + chars.v + '\n';
    }

    // Bottom border
    result += chars.bl + chars.h.repeat(width) + chars.br;

    return result;
}

// ASCII Art Templates
function getASCIITemplate(templateName) {
    const templates = {
        'arrow-right': `
    ┌────────┐
    │        │
────►  NEXT  │
    │        │
    └────────┘`,
        'arrow-down': `
    │
    │
    ▼
  ┌──────┐
  │ NEXT │
  └──────┘`,
        'check': `
  ✓ Task completed
  ✓ All tests passed
  ✓ Ready to deploy
  ✓ Documentation updated`,
        'divider': `
═══════════════════════════════════════════════════════════
`,
        'header': `
╔═══════════════════════════════════════════════════╗
║              SECTION HEADER                       ║
╚═══════════════════════════════════════════════════╝`,
        'flowchart': `
┌─────────────┐
│    START    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   PROCESS   │
└──────┬──────┘
       │
   ┌───┴───┐
   │ Check │
   └───┬───┘
       │
   ┌───▼──┬──────┐
   │ Yes  │  No  │
   ▼      ▼      │
┌────┐ ┌────┐   │
│ A  │ │ B  │   │
└─┬──┘ └─┬──┘   │
  │      │       │
  └──┬───┘       │
     │◄──────────┘
     ▼
┌─────────────┐
│     END     │
└─────────────┘`,
        'decision': `
       ┌─────────┐
       │ Check?  │
       └────┬────┘
            │
      ┌─────┴─────┐
      │           │
   Yes│           │No
      ▼           ▼
 ┌────────┐  ┌────────┐
 │  True  │  │  False │
 └────────┘  └────────┘`,
        'sequence': `
 User      System     Database
   │           │           │
   │  Request  │           │
   ├──────────►│           │
   │           │  Query    │
   │           ├──────────►│
   │           │           │
   │           │  Result   │
   │           │◄──────────┤
   │  Response │           │
   │◄──────────┤           │
   │           │           │`,
        'table-simple': `
┌──────────┬──────────┬──────────┐
│ Header 1 │ Header 2 │ Header 3 │
├──────────┼──────────┼──────────┤
│  Data 1  │  Data 2  │  Data 3  │
├──────────┼──────────┼──────────┤
│  Data 4  │  Data 5  │  Data 6  │
└──────────┴──────────┴──────────┘`,
        'timeline': `
  2020        2021        2022        2023
    │           │           │           │
    ●───────────●───────────●───────────●
    │           │           │           │
  Start    Milestone    Release    Current`,
        'network': `
            ┌──────────┐
            │  Server  │
            └────┬─────┘
                 │
       ┌─────────┼─────────┐
       │         │         │
   ┌───▼───┐ ┌──▼────┐ ┌──▼────┐
   │Client1│ │Client2│ │Client3│
   └───────┘ └───────┘ └───────┘`,
        'hierarchy': `
        ┌─────────┐
        │  Root   │
        └────┬────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼───┐         ┌───▼───┐
│Child 1│         │Child 2│
└───┬───┘         └───┬───┘
    │                 │
┌───▼───┐         ┌───▼───┐
│Grand 1│         │Grand 2│
└───────┘         └───────┘`,
        'process-flow': `
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Input  │────►│Process 1│────►│  Output │
└─────────┘     └────┬────┘     └─────────┘
                     │
                ┌────▼────┐
                │Process 2│
                └─────────┘`,
        'note-box': `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  NOTE:                         ┃
┃  This is an important note     ┃
┃  that requires attention!      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        'warning-box': `
╔════════════════════════════════════╗
║  ⚠ WARNING                         ║
║  Proceed with caution!             ║
╚════════════════════════════════════╝`,
        'info-box': `
╭────────────────────────────────────╮
│  ℹ  Information                    │
│  Additional context here           │
╰────────────────────────────────────╯`,
        'separator-fancy': `
╭──────────────────────────────────────────────────────╮
│                                                      │
╰──────────────────────────────────────────────────────╯`,
        'brackets': `
【  Important Text  】`,
        'banner-stars': `
************************************************************************
*                       IMPORTANT BANNER                              *
************************************************************************`,
        'progress-bar': `
Progress:  [████████████░░░░░░░░] 60%
           0%                    100%`
    };

    return templates[templateName] || '';
}

function loadASCIITemplate(templateName) {
    const template = getASCIITemplate(templateName);
    document.getElementById('ascii-preview').textContent = template;
}

function insertASCIIArt() {
    const asciiArt = document.getElementById('ascii-preview').textContent;

    if (!asciiArt || asciiArt === 'Select a template from the buttons above') {
        alert('Please generate ASCII art first');
        return;
    }

    // Insert using CodeMirror
    if (!tabManager) {
        alert('No active editor found');
        return;
    }

    // Insert in code block for proper rendering
    const codeBlock = '\n```\n' + asciiArt + '\n```\n';
    tabManager.insertAtCursor(codeBlock);

    // Trigger update
    if (tabManager) {
        tabManager.handleEditorInput(tabManager.activeTabId);
    }

    // Close dialog
    hideASCIIGenerator();
}

// ASCII Art Event Listeners
document.getElementById('ascii-dialog-close').addEventListener('click', hideASCIIGenerator);
document.getElementById('ascii-cancel').addEventListener('click', hideASCIIGenerator);
document.getElementById('ascii-generate').addEventListener('click', generateASCIIPreview);
document.getElementById('ascii-insert').addEventListener('click', insertASCIIArt);

// Mode switching
document.getElementById('ascii-mode-text').addEventListener('click', () => switchASCIIMode('text'));
document.getElementById('ascii-mode-box').addEventListener('click', () => switchASCIIMode('box'));
document.getElementById('ascii-mode-templates').addEventListener('click', () => switchASCIIMode('templates'));

// Auto-update preview for text mode
document.getElementById('ascii-text-input').addEventListener('input', generateASCIIPreview);
document.getElementById('ascii-font-style').addEventListener('change', generateASCIIPreview);

// Auto-update preview for box mode
document.getElementById('ascii-box-text').addEventListener('input', generateASCIIPreview);
document.getElementById('ascii-box-style').addEventListener('change', generateASCIIPreview);
document.getElementById('ascii-box-padding').addEventListener('input', generateASCIIPreview);

// Template buttons
document.querySelectorAll('.ascii-template-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const template = this.getAttribute('data-template');
        loadASCIITemplate(template);
    });
});

// IPC listener for menu
ipcRenderer.on('show-ascii-generator', () => {
    showASCIIGenerator();
});

// ============================================================================
// PANE RESIZING
// ============================================================================

let isResizing = false;
let currentResizer = null;

document.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('pane-resizer')) {
        isResizing = true;
        currentResizer = e.target;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const container = currentResizer.parentElement;
    const editorPane = currentResizer.previousElementSibling;
    const previewPane = currentResizer.nextElementSibling;

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;

    // Calculate percentages (minimum 20%, maximum 80% for each pane)
    let editorPercentage = (mouseX / containerWidth) * 100;
    editorPercentage = Math.max(20, Math.min(80, editorPercentage));

    const previewPercentage = 100 - editorPercentage;

    editorPane.style.flex = `0 0 ${editorPercentage}%`;
    previewPane.style.flex = `0 0 ${previewPercentage}%`;
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        currentResizer = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
});


// ============================================
// Insert Content from Generator Windows
// ============================================
ipcRenderer.on('insert-content', (event, content) => {
    if (tabManager) {
        tabManager.insertAtCursor(content);

        const activeTabId = tabManager.activeTabId;
        const tab = tabManager.tabs.get(activeTabId);
        if (tab) {
            tab.isDirty = true;
            tabManager.updatePreview(activeTabId);
            tabManager.updateTabBar();
        }
    }
});

// ============================================
// PDF VIEWER FUNCTIONALITY
// ============================================

// Legacy PDF viewer globals - kept for PDF editor dialogs that still use them
let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfZoomLevel = 1.0;
let pdfRotation = 0;
let pdfFilePath = null;
let isPdfViewerActive = false;

// Initialize PDF.js
// Lazy-load pdfjs-dist only when PDF viewer is needed
let _pdfjsLib;
function getPdfjsLib() {
    if (!_pdfjsLib) {
        _pdfjsLib = require('pdfjs-dist');
        _pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
    }
    return _pdfjsLib;
}

// Open PDF file - now creates a tab instead of replacing the entire view
async function openPdfFile(filePath) {
    // Check if this PDF is already open in a tab
    for (const [tabId, tab] of tabManager.tabs) {
        if (tab.type === 'pdf' && tab.filePath === filePath) {
            // Just switch to the existing tab
            tabManager.switchToTab(tabId);
            return;
        }
    }

    // Create a new PDF tab
    tabManager.createPdfTab(filePath);
}

// Render PDF page
async function renderPdfPage(pageNum) {
    if (!pdfDoc) return;

    try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');

        // Calculate viewport with zoom and rotation
        const viewport = page.getViewport({ scale: pdfZoomLevel, rotation: pdfRotation });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Update page input
        document.getElementById('pdf-page-input').value = pageNum;
    } catch (error) {
        console.error('Error rendering PDF page:', error);
    }
}

// PDF navigation handlers
document.getElementById('pdf-prev-page')?.addEventListener('click', async () => {
    if (pdfCurrentPage > 1) {
        pdfCurrentPage--;
        await renderPdfPage(pdfCurrentPage);
    }
});

document.getElementById('pdf-next-page')?.addEventListener('click', async () => {
    if (pdfDoc && pdfCurrentPage < pdfDoc.numPages) {
        pdfCurrentPage++;
        await renderPdfPage(pdfCurrentPage);
    }
});

document.getElementById('pdf-page-input')?.addEventListener('change', async (e) => {
    const pageNum = parseInt(e.target.value);
    if (pdfDoc && pageNum >= 1 && pageNum <= pdfDoc.numPages) {
        pdfCurrentPage = pageNum;
        await renderPdfPage(pdfCurrentPage);
    }
});

// PDF zoom handlers
document.getElementById('pdf-zoom-out')?.addEventListener('click', async () => {
    if (pdfZoomLevel > 0.25) {
        pdfZoomLevel -= 0.25;
        document.getElementById('pdf-zoom-level').textContent = Math.round(pdfZoomLevel * 100) + '%';
        await renderPdfPage(pdfCurrentPage);
    }
});

document.getElementById('pdf-zoom-in')?.addEventListener('click', async () => {
    if (pdfZoomLevel < 4.0) {
        pdfZoomLevel += 0.25;
        document.getElementById('pdf-zoom-level').textContent = Math.round(pdfZoomLevel * 100) + '%';
        await renderPdfPage(pdfCurrentPage);
    }
});

document.getElementById('pdf-fit-width')?.addEventListener('click', async () => {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pdfCurrentPage);
    const viewport = page.getViewport({ scale: 1, rotation: pdfRotation });
    const containerWidth = document.getElementById('pdf-viewer').clientWidth - 40;
    pdfZoomLevel = containerWidth / viewport.width;
    document.getElementById('pdf-zoom-level').textContent = Math.round(pdfZoomLevel * 100) + '%';
    await renderPdfPage(pdfCurrentPage);
});

document.getElementById('pdf-fit-page')?.addEventListener('click', async () => {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pdfCurrentPage);
    const viewport = page.getViewport({ scale: 1, rotation: pdfRotation });
    const container = document.getElementById('pdf-viewer');
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    const scaleX = containerWidth / viewport.width;
    const scaleY = containerHeight / viewport.height;
    pdfZoomLevel = Math.min(scaleX, scaleY);
    document.getElementById('pdf-zoom-level').textContent = Math.round(pdfZoomLevel * 100) + '%';
    await renderPdfPage(pdfCurrentPage);
});

// PDF rotation handlers
document.getElementById('pdf-rotate-left')?.addEventListener('click', async () => {
    pdfRotation = (pdfRotation - 90 + 360) % 360;
    await renderPdfPage(pdfCurrentPage);
});

document.getElementById('pdf-rotate-right')?.addEventListener('click', async () => {
    pdfRotation = (pdfRotation + 90) % 360;
    await renderPdfPage(pdfCurrentPage);
});

// Close PDF viewer
document.getElementById('pdf-close')?.addEventListener('click', () => {
    closePdfViewer();
});

async function closePdfViewer() {
    // Legacy PDF viewer close - for backward compatibility with PDF editor dialogs
    if (pdfDoc) {
        try {
            await pdfDoc.destroy();
        } catch (e) {
            console.warn('Error destroying PDF:', e);
        }
    }

    pdfDoc = null;
    pdfFilePath = null;
    isPdfViewerActive = false;

    // If we're using the new tab-based system, close the current PDF tab
    if (tabManager) {
        const activeTab = tabManager.tabs.get(tabManager.activeTabId);
        if (activeTab && activeTab.type === 'pdf') {
            tabManager.closeTab(tabManager.activeTabId);
            return;
        }
    }

    // Legacy: Hide PDF viewer container
    document.getElementById('pdf-viewer-container')?.classList.add('hidden');

    // Show markdown tabs, tab bar, and toolbar
    document.getElementById('tab-bar')?.classList.remove('hidden');
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('hidden'));
    document.querySelector('.toolbar')?.classList.remove('hidden');

    // Activate the correct markdown tab
    if (tabManager) {
        const activeTab = document.querySelector(`.tab-content[data-tab-id="${tabManager.activeTabId}"]`);
        if (activeTab) activeTab.classList.add('active');
        tabManager.updatePreview(tabManager.activeTabId);
    }

    document.getElementById('status-text').textContent = 'Ready';
}

// Handle PDF file open from main process
ipcRenderer.on('open-pdf-file', (event, filePath) => {
    openPdfFile(filePath);
});

// ============================================
// PDF EDITOR TOOLBAR BUTTONS
// ============================================

// Helper function to trigger PDF editor dialog
function openPdfEditorDialog(operation) {
    // Use the opened PDF file if available, otherwise prompt
    if (pdfFilePath) {
        ipcRenderer.send('show-pdf-editor-from-toolbar', { operation, filePath: pdfFilePath });
    } else {
        ipcRenderer.send('show-pdf-editor-from-toolbar', { operation, filePath: null });
    }
}

// PDF Editor toolbar button handlers
document.getElementById('pdf-tb-merge')?.addEventListener('click', () => {
    openPdfEditorDialog('merge');
});

document.getElementById('pdf-tb-split')?.addEventListener('click', () => {
    openPdfEditorDialog('split');
});

document.getElementById('pdf-tb-compress')?.addEventListener('click', () => {
    openPdfEditorDialog('compress');
});

document.getElementById('pdf-tb-rotate')?.addEventListener('click', () => {
    openPdfEditorDialog('rotate');
});

document.getElementById('pdf-tb-delete')?.addEventListener('click', () => {
    openPdfEditorDialog('delete');
});

document.getElementById('pdf-tb-reorder')?.addEventListener('click', () => {
    openPdfEditorDialog('reorder');
});

document.getElementById('pdf-tb-watermark')?.addEventListener('click', () => {
    openPdfEditorDialog('watermark');
});

document.getElementById('pdf-tb-encrypt')?.addEventListener('click', () => {
    openPdfEditorDialog('encrypt');
});

document.getElementById('pdf-tb-decrypt')?.addEventListener('click', () => {
    openPdfEditorDialog('decrypt');
});

// ============================================
// DYNAMIC PANE RESIZER
// ============================================

function initPaneResizer(tabId) {
    const resizer = document.getElementById(`pane-resizer-${tabId}`);
    const editorPane = document.getElementById(`editor-pane-${tabId}`);
    const previewPane = document.getElementById(`preview-pane-${tabId}`);
    const tabContent = document.getElementById(`tab-content-${tabId}`);

    if (!resizer || !editorPane || !previewPane) return;

    let isResizing = false;
    let startX = 0;
    let startEditorWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startEditorWidth = editorPane.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerWidth = tabContent.offsetWidth;
        const deltaX = e.clientX - startX;
        let newEditorWidth = startEditorWidth + deltaX;

        // Minimum widths
        const minWidth = 150;
        const maxWidth = containerWidth - minWidth - 6; // 6px for resizer

        newEditorWidth = Math.max(minWidth, Math.min(maxWidth, newEditorWidth));

        const editorPercent = (newEditorWidth / containerWidth) * 100;
        const previewPercent = 100 - editorPercent - 1; // 1% for resizer

        editorPane.style.flex = `0 0 ${editorPercent}%`;
        previewPane.style.flex = `0 0 ${previewPercent}%`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Initialize resizer for first tab
document.addEventListener('DOMContentLoaded', () => {
    initPaneResizer(1);
});

// ============================================
// IMAGE/AUDIO/VIDEO CONVERTER HANDLERS
// These require external tools (ImageMagick, FFmpeg)
// ============================================

ipcRenderer.on('show-image-tool', (event, tool) => {
    alert(`Image ${tool} tool requires ImageMagick to be installed.\n\nPlease install ImageMagick from: https://imagemagick.org/\n\nThis feature will be available in a future update with built-in support.`);
});

ipcRenderer.on('show-audio-tool', (event, tool) => {
    alert(`Audio ${tool} tool requires FFmpeg to be installed.\n\nPlease install FFmpeg from: https://ffmpeg.org/\n\nThis feature will be available in a future update with built-in support.`);
});

ipcRenderer.on('show-video-tool', (event, tool) => {
    alert(`Video ${tool} tool requires FFmpeg to be installed.\n\nPlease install FFmpeg from: https://ffmpeg.org/\n\nThis feature will be available in a future update with built-in support.`);
});

