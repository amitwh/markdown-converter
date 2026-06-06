// src/main/menu/items.js
// Individual menu items — pure functions that take (mainWindow) and return menu item arrays

const { app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Helper: build recent files submenu
function buildRecentFilesMenu(mainWindow) {
  try {
    const recentFilesPath = path.join(app.getPath('userData'), 'recent-files.json');
    if (!fs.existsSync(recentFilesPath)) return [{ label: 'No Recent Files', enabled: false }];
    const recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
    const existing = recentFiles.filter(file => fs.existsSync(file));
    if (existing.length === 0) return [{ label: 'No Recent Files', enabled: false }];
    const items = existing.map(file => ({
      label: path.basename(file),
      click: () => {
        const { openFileFromPath } = require('../index');
        openFileFromPath(file);
      }
    }));
    items.push(
      { type: 'separator' },
      {
        label: 'Clear Recent Files',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('clear-recent-files');
          }
        }
      }
    );
    return items;
  } catch (e) {
    return [{ label: 'No Recent Files', enabled: false }];
  }
}

function fileItems(mainWindow) {
  return [
    {
      label: 'New',
      accelerator: 'CmdOrCtrl+N',
      click: () => mainWindow.webContents.send('file-new')
    },
    {
      label: 'Open',
      accelerator: 'CmdOrCtrl+O',
      click: () => {
        const { openFile } = require('../index');
        openFile();
      }
    },
    {
      label: 'Open PDF',
      accelerator: 'CmdOrCtrl+Shift+O',
      click: () => {
        const { openPdfFile } = require('../index');
        openPdfFile();
      }
    },
    {
      label: 'Save',
      accelerator: 'CmdOrCtrl+S',
      click: () => mainWindow.webContents.send('file-save')
    },
    {
      label: 'Save As',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => {
        const { saveAsFile } = require('../index');
        saveAsFile();
      }
    },
    { type: 'separator' },
    // NOTE: Print Preview submenu removed — handled by React <PrintPreview> overlay
    { type: 'separator' },
    {
      label: 'Recent Files',
      submenu: buildRecentFilesMenu(mainWindow)
    },
    { type: 'separator' },
    {
      label: 'New from Template',
      submenu: [
        { label: 'Blog Post', click: () => mainWindow.webContents.send('load-template-menu', 'blog-post.md') },
        { label: 'Meeting Notes', click: () => mainWindow.webContents.send('load-template-menu', 'meeting-notes.md') },
        { label: 'Technical Spec', click: () => mainWindow.webContents.send('load-template-menu', 'technical-spec.md') },
        { label: 'Changelog', click: () => mainWindow.webContents.send('load-template-menu', 'changelog.md') },
        { label: 'README', click: () => mainWindow.webContents.send('load-template-menu', 'readme.md') },
        { label: 'Project Plan', click: () => mainWindow.webContents.send('load-template-menu', 'project-plan.md') },
        { label: 'API Documentation', click: () => mainWindow.webContents.send('load-template-menu', 'api-docs.md') },
        { label: 'Tutorial', click: () => mainWindow.webContents.send('load-template-menu', 'tutorial.md') },
        { label: 'Release Notes', click: () => mainWindow.webContents.send('load-template-menu', 'release-notes.md') },
        { label: 'Comparison', click: () => mainWindow.webContents.send('load-template-menu', 'comparison.md') }
      ]
    },
    { type: 'separator' },
    {
      label: 'Import Document...',
      accelerator: 'CmdOrCtrl+I',
      click: () => {
        const { importDocument } = require('../index');
        importDocument();
      }
    },
    {
      label: 'Export',
      submenu: [
        {
          label: 'HTML', click: () => {
            const { exportFile } = require('../index');
            exportFile('html');
          }
        },
        {
          label: 'PDF', click: () => {
            const { exportFile } = require('../index');
            exportFile('pdf');
          }
        },
        {
          label: 'PDF (Enhanced)', click: () => {
            const { exportPDFViaWordTemplate } = require('../index');
            exportPDFViaWordTemplate();
          }, accelerator: 'Ctrl+Shift+P'
        },
        {
          label: 'DOCX', click: () => {
            const { exportFile } = require('../index');
            exportFile('docx');
          }
        },
        {
          label: 'DOCX (Enhanced)', click: () => {
            const { exportWordWithTemplate } = require('../index');
            exportWordWithTemplate();
          }, accelerator: 'Ctrl+Shift+W'
        },
        { label: 'LaTeX', click: () => { const { exportFile } = require('../index'); exportFile('latex'); } },
        { label: 'RTF', click: () => { const { exportFile } = require('../index'); exportFile('rtf'); } },
        { label: 'ODT', click: () => { const { exportFile } = require('../index'); exportFile('odt'); } },
        { label: 'EPUB', click: () => { const { exportFile } = require('../index'); exportFile('epub'); } },
        { type: 'separator' },
        { label: 'PowerPoint (PPTX)', click: () => { const { exportFile } = require('../index'); exportFile('pptx'); } },
        { label: 'OpenDocument Presentation (ODP)', click: () => { const { exportFile } = require('../index'); exportFile('odp'); } },
        { type: 'separator' },
        { label: 'CSV (Tables)', click: () => { const { exportSpreadsheet } = require('../index'); exportSpreadsheet('csv'); } },
        { type: 'separator' },
        { label: 'JSON (.json)', click: () => { const { exportFile } = require('../index'); exportFile('json'); } },
        { label: 'YAML (.yaml)', click: () => { const { exportFile } = require('../index'); exportFile('yaml'); } },
        { label: 'XML (.xml)', click: () => { const { exportFile } = require('../index'); exportFile('xml'); } },
        { type: 'separator' },
        { label: 'Confluence Wiki (.txt)', click: () => { const { exportFile } = require('../index'); exportFile('confluence'); } },
        { label: 'MOBI E-book (.mobi)', click: () => { const { exportFile } = require('../index'); exportFile('mobi'); } }
      ]
    },
    { type: 'separator' },
    {
      label: 'Select Word Template...',
      click: () => {
        const { selectWordTemplate } = require('../index');
        selectWordTemplate();
      }
    },
    {
      label: 'Template Settings...',
      click: () => {
        const { showTemplateSettings } = require('../index');
        showTemplateSettings();
      }
    },
    {
      label: 'Header & Footer Settings...',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('open-header-footer-dialog');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
      click: () => app.quit()
    }
  ];
}

function editItems(mainWindow) {
  return [
    {
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      click: () => mainWindow.webContents.send('undo')
    },
    {
      label: 'Redo',
      accelerator: 'CmdOrCtrl+Shift+Z',
      click: () => mainWindow.webContents.send('redo')
    },
    { type: 'separator' },
    { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
    { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
    { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
    { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
    { type: 'separator' },
    {
      label: 'Find & Replace',
      accelerator: 'CmdOrCtrl+F',
      click: () => mainWindow.webContents.send('toggle-find')
    }
  ];
}

function viewItems(mainWindow) {
  return [
    {
      label: 'Toggle Preview',
      accelerator: 'CmdOrCtrl+Shift+V',
      click: () => mainWindow.webContents.send('toggle-preview')
    },
    // NOTE: Command Palette removed — handled by useCommandStore
    { type: 'separator' },
    {
      label: 'Sidebar',
      submenu: [
        { label: 'File Explorer', click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'explorer') },
        { label: 'Git', click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'git') },
        { label: 'Snippets', click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'snippets') },
        { label: 'Templates', click: () => mainWindow.webContents.send('toggle-sidebar-panel', 'templates') }
      ]
    },
    {
      label: 'Bottom Panel (REPL)',
      click: () => mainWindow.webContents.send('toggle-bottom-panel')
    },
    { type: 'separator' },
    {
      label: 'Theme',
      submenu: [
        { label: 'Atom One Light (Default)', click: () => { const { setTheme } = require('../index'); setTheme('atomonelight'); } },
        { label: 'GitHub Light', click: () => { const { setTheme } = require('../index'); setTheme('github'); } },
        { label: 'Light', click: () => { const { setTheme } = require('../index'); setTheme('light'); } },
        { label: 'Solarized Light', click: () => { const { setTheme } = require('../index'); setTheme('solarized'); } },
        { label: 'Gruvbox Light', click: () => { const { setTheme } = require('../index'); setTheme('gruvbox-light'); } },
        { label: 'Ayu Light', click: () => { const { setTheme } = require('../index'); setTheme('ayu-light'); } },
        { label: 'Sepia', click: () => { const { setTheme } = require('../index'); setTheme('sepia'); } },
        { label: 'Paper', click: () => { const { setTheme } = require('../index'); setTheme('paper'); } },
        { label: 'Rose Pine Dawn', click: () => { const { setTheme } = require('../index'); setTheme('rosepine-dawn'); } },
        { label: 'Concrete Light', click: () => { const { setTheme } = require('../index'); setTheme('concrete-light'); } },
        { type: 'separator' },
        { label: 'Dark', click: () => { const { setTheme } = require('../index'); setTheme('dark'); } },
        { label: 'One Dark', click: () => { const { setTheme } = require('../index'); setTheme('onedark'); } },
        { label: 'Dracula', click: () => { const { setTheme } = require('../index'); setTheme('dracula'); } },
        { label: 'Nord', click: () => { const { setTheme } = require('../index'); setTheme('nord'); } },
        { label: 'Monokai', click: () => { const { setTheme } = require('../index'); setTheme('monokai'); } },
        { label: 'Material', click: () => { const { setTheme } = require('../index'); setTheme('material'); } },
        { label: 'Gruvbox Dark', click: () => { const { setTheme } = require('../index'); setTheme('gruvbox-dark'); } },
        { label: 'Tokyo Night', click: () => { const { setTheme } = require('../index'); setTheme('tokyonight'); } },
        { label: 'Palenight', click: () => { const { setTheme } = require('../index'); setTheme('palenight'); } },
        { label: 'Ayu Dark', click: () => { const { setTheme } = require('../index'); setTheme('ayu-dark'); } },
        { label: 'Ayu Mirage', click: () => { const { setTheme } = require('../index'); setTheme('ayu-mirage'); } },
        { label: 'Oceanic Next', click: () => { const { setTheme } = require('../index'); setTheme('oceanic-next'); } },
        { label: 'Cobalt2', click: () => { const { setTheme } = require('../index'); setTheme('cobalt2'); } },
        { label: 'Concrete Dark', click: () => { const { setTheme } = require('../index'); setTheme('concrete-dark'); } },
        { label: 'Concrete Warm', click: () => { const { setTheme } = require('../index'); setTheme('concrete-warm'); } }
      ]
    },
    { type: 'separator' },
    {
      label: 'Font Size',
      submenu: [
        {
          label: 'Increase Font Size',
          accelerator: 'CmdOrCtrl+Shift+Plus',
          click: () => mainWindow.webContents.send('adjust-font-size', 'increase')
        },
        {
          label: 'Decrease Font Size',
          accelerator: 'CmdOrCtrl+Shift+-',
          click: () => mainWindow.webContents.send('adjust-font-size', 'decrease')
        },
        {
          label: 'Reset Font Size',
          accelerator: 'CmdOrCtrl+Shift+0',
          click: () => mainWindow.webContents.send('adjust-font-size', 'reset')
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Spell Check',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        mainWindow.webContents.session.setSpellCheckerEnabled(menuItem.checked);
      }
    },
    { type: 'separator' },
    {
      label: 'Custom Preview CSS',
      submenu: [
        {
          label: 'Load Custom Preview CSS...',
          click: () => mainWindow.webContents.send('load-custom-css')
        },
        {
          label: 'Clear Custom Preview CSS',
          click: () => mainWindow.webContents.send('clear-custom-css')
        }
      ]
    },
    { type: 'separator' },
    { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
    { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' },
    { type: 'separator' },
    { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
    { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
    { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' }
  ];
}

function batchItems(mainWindow) {
  return [
    {
      label: 'Convert Markdown Folder...',
      click: () => {
        const { showBatchConversionDialog } = require('../index');
        showBatchConversionDialog();
      }
    },
    { type: 'separator' },
    {
      label: 'Batch Image Conversion...',
      click: () => mainWindow.webContents.send('show-batch-converter', 'image')
    },
    {
      label: 'Batch Audio Conversion...',
      click: () => mainWindow.webContents.send('show-batch-converter', 'audio')
    },
    {
      label: 'Batch Video Conversion...',
      click: () => mainWindow.webContents.send('show-batch-converter', 'video')
    },
    {
      label: 'Batch PDF Conversion...',
      click: () => mainWindow.webContents.send('show-batch-converter', 'pdf')
    }
  ];
}

function convertItems(mainWindow) {
  return [
    {
      label: 'Universal File Converter...',
      accelerator: 'CmdOrCtrl+Shift+C',
      click: () => {
        const { showUniversalConverterDialog } = require('../index');
        showUniversalConverterDialog();
      }
    }
  ];
}

function pdfEditorItems(mainWindow) {
  return [
    {
      label: 'Open PDF File...',
      accelerator: 'CmdOrCtrl+Shift+O',
      click: () => {
        const { openPdfFile } = require('../index');
        openPdfFile();
      }
    },
    { type: 'separator' },
    {
      label: 'Merge PDFs...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('merge');
      }
    },
    {
      label: 'Split PDF...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('split');
      }
    },
    {
      label: 'Compress PDF...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('compress');
      }
    },
    { type: 'separator' },
    {
      label: 'Rotate Pages...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('rotate');
      }
    },
    {
      label: 'Delete Pages...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('delete');
      }
    },
    {
      label: 'Reorder Pages...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('reorder');
      }
    },
    { type: 'separator' },
    {
      label: 'Add Watermark...',
      click: () => {
        const { showPDFEditorDialog } = require('../index');
        showPDFEditorDialog('watermark');
      }
    },
    { type: 'separator' },
    {
      label: 'Security',
      submenu: [
        {
          label: 'Add Password Protection...',
          click: () => {
            const { showPDFEditorDialog } = require('../index');
            showPDFEditorDialog('encrypt');
          }
        },
        {
          label: 'Remove Password...',
          click: () => {
            const { showPDFEditorDialog } = require('../index');
            showPDFEditorDialog('decrypt');
          }
        },
        {
          label: 'Set Permissions...',
          click: () => {
            const { showPDFEditorDialog } = require('../index');
            showPDFEditorDialog('permissions');
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'About PDF Editor',
      click: () => {
        const { showAboutDialog } = require('../index');
        showAboutDialog();
      }
    }
  ];
}

function toolsItems(mainWindow) {
  // NOTE: Table Generator and ASCII Art Generator removed — handled by React dialogs
  return [
    // Removed: Table Generator (Cmd+Ctrl+Shift+T) — now React <TableGeneratorDialog>
    // Removed: ASCII Art Generator (Cmd+Ctrl+Shift+A) — now React <AsciiGeneratorDialog>
    { type: 'separator' },
    {
      label: 'Document Compare',
      click: () => mainWindow.webContents.send('show-document-compare')
    }
  ];
}

function helpItems(mainWindow) {
  return [
    {
      label: 'About MarkdownConverter',
      click: () => {
        const { showAboutDialog } = require('../index');
        showAboutDialog();
      }
    },
    { type: 'separator' },
    {
      label: 'Dependencies & Requirements',
      click: () => {
        const { showDependenciesDialog } = require('../index');
        showDependenciesDialog();
      }
    },
    { type: 'separator' },
    {
      label: 'Documentation',
      click: () => shell.openExternal('https://github.com/amitwh/markdown-converter')
    },
    {
      label: 'Report Issue',
      click: () => shell.openExternal('https://github.com/amitwh/markdown-converter/issues')
    },
    {
      label: 'Check for Updates',
      click: () => shell.openExternal('https://github.com/amitwh/markdown-converter/releases')
    }
  ];
}

module.exports = {
  fileItems,
  editItems,
  viewItems,
  batchItems,
  convertItems,
  pdfEditorItems,
  toolsItems,
  helpItems
};