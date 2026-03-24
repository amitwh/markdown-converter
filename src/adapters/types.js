/**
 * Platform Adapter Type Definitions
 *
 * This module defines the interfaces for platform-specific operations.
 * Adapters abstract file system, conversion, and system operations
 * to enable easier testing and future platform migration.
 *
 * @version 4.1.0
 */

/**
 * @typedef {Object} FileInfo
 * @property {string} name - File or directory name
 * @property {boolean} isDir - True if directory
 * @property {number} size - File size in bytes
 * @property {number} modified - Last modified timestamp (ms since epoch)
 */

/**
 * @typedef {Object} WatchEvent
 * @property {string} type - Event type ('add', 'change', 'unlink', 'addDir', 'unlinkDir')
 * @property {string} path - Affected file/directory path
 */

/**
 * @typedef {Object} ConversionOptions
 * @property {string} format - Output format (pdf, docx, html, etc.)
 * @property {string} [pdfEngine] - PDF engine for PDF export (xelatex, pdflatex, etc.)
 * @property {string} [template] - Word template path for DOCX
 * @property {string} [geometry] - Page geometry for PDF (e.g., 'margin=1in')
 * @property {string} [header] - Header content
 * @property {string} [footer] - Footer content
 * @property {boolean} [toc] - Include table of contents
 */

/**
 * @typedef {Object} ConversionResult
 * @property {string} input - Input file path
 * @property {string} output - Output file path
 * @property {boolean} success - Whether conversion succeeded
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} PlatformCapabilities
 * @property {boolean} hasPandoc - Pandoc is available
 * @property {boolean} hasFfmpeg - FFmpeg is available
 * @property {boolean} hasLibreOffice - LibreOffice is available
 * @property {boolean} hasDirectFs - Direct file system access
 * @property {boolean} hasSystemNotifications - System notifications available
 * @property {boolean} hasPdfJs - PDF.js available for PDF viewing
 */

/**
 * @typedef {Object} DialogOptions
 * @property {string} [title] - Dialog title
 * @property {string} [defaultPath] - Default path
 * @property {string[]} [filters] - File filters [{ name: 'Markdown', extensions: ['md'] }]
 * @property {string} [buttonLabel] - Custom button label
 */

/**
 * @typedef {Object} SystemInfo
 * @property {string} platform - Operating system (win32, darwin, linux)
 * @property {string} homeDir - User home directory
 * @property {string} documentsDir - Documents directory
 * @property {string} downloadsDir - Downloads directory
 * @property {string} tempDir - Temporary directory
 * @property {string} appVersion - Application version
 */

/**
 * @typedef {Object} FileSystemAdapter
 * @property {(path: string) => Promise<string>} readFile - Read file content
 * @property {(path: string, content: string) => Promise<void>} writeFile - Write file content
 * @property {(path: string) => Promise<void>} deleteFile - Delete file
 * @property {(path: string) => Promise<void>} ensureDir - Ensure directory exists
 * @property {(path: string) => Promise<FileInfo[]>} listDirectory - List directory contents
 * @property {(path: string) => Promise<boolean>} exists - Check if path exists
 * @property {(path: string) => Promise<boolean>} isDirectory - Check if path is directory
 * @property {(source: string, dest: string) => Promise<void>} copy - Copy file or directory
 * @property {(source: string, dest: string) => Promise<void>} move - Move file or directory
 * @property {(path: string, callback: (event: WatchEvent) => void) => () => void>} [watchDirectory] - Watch directory for changes
 */

/**
 * @typedef {Object} ConversionAdapter
 * @property {(input: string, output: string, options: ConversionOptions) => Promise<void>} convertFile - Convert single file
 * @property {(files: string[], outputDir: string, options: ConversionOptions) => Promise<ConversionResult[]>} batchConvert - Batch convert files
 * @property {() => Promise<boolean>} checkPandoc - Check if Pandoc is available
 * @property {() => Promise<boolean>} checkFfmpeg - Check if FFmpeg is available
 * @property {() => Promise<boolean>} checkLibreOffice - Check if LibreOffice is available
 */

/**
 * @typedef {Object} DialogAdapter
 * @property {(options?: DialogOptions) => Promise<string|null>} showOpenDialog - Show open file dialog
 * @property {(options?: DialogOptions) => Promise<string[]>} showOpenDialogMulti - Show multi-select open dialog
 * @property {(options?: DialogOptions) => Promise<string|null>} showSaveDialog - Show save file dialog
 * @property {(message: string, type?: string) => Promise<void>} showMessage - Show message dialog
 * @property {(message: string, type?: string) => Promise<boolean>} showConfirm - Show confirmation dialog
 */

/**
 * @typedef {Object} SystemAdapter
 * @property {() => Promise<SystemInfo>} getSystemInfo - Get system information
 * @property {(title: string, body: string) => Promise<void>} showNotification - Show system notification
 * @property {(url: string) => Promise<void>} openExternal - Open URL in default browser
 * @property {(path: string) => Promise<void>} openInExplorer - Open path in file explorer
 * @property {(path: string) => Promise<void>} openInDefaultApp - Open path in default application
 */

/**
 * @typedef {Object} PdfAdapter
 * @property {(path: string) => Promise<Object>} loadDocument - Load PDF document
 * @property {(doc: Object, pageNum: number, canvas: HTMLCanvasElement, scale: number, rotation: number) => Promise<void>} renderPage - Render PDF page to canvas
 * @property {(operations: Object) => Promise<void>} processOperation - Process PDF operation (merge, split, etc.)
 */

/**
 * @typedef {Object} PlatformAdapter
 * @property {string} name - Platform name ('electron', 'web', 'tauri', 'flutter')
 * @property {FileSystemAdapter} fs - File system operations
 * @property {ConversionAdapter} convert - Conversion operations
 * @property {DialogAdapter} dialog - Dialog operations
 * @property {SystemAdapter} system - System operations
 * @property {PdfAdapter} [pdf] - PDF operations (optional, not available on all platforms)
 * @property {PlatformCapabilities} capabilities - Platform capabilities
 */

module.exports = {
    // Type definitions are JSDoc only, no runtime exports needed
};
