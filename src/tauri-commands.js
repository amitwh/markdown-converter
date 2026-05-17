// Tauri Commands Bridge for MarkdownConverter
// Replaces preload.js — uses Tauri's invoke() instead of ipcRenderer

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ============================================
// FILE OPERATIONS
// ============================================
export const file = {
  read: (path) => invoke('read_file', { path }),
  write: (path, content) => invoke('write_file', { path, content }),
  delete: (path) => invoke('delete_file', { path }),
  exists: (path) => invoke('path_exists', { path }),
  isDirectory: (path) => invoke('is_directory', { path }),
  listDirectory: (path) => invoke('list_directory', { path }),
  ensureDir: (path) => invoke('ensure_directory', { path }),
  copy: (source, destination) => invoke('copy_path', { source, destination }),
  move: (source, destination) => invoke('move_path', { source, destination }),
};

// ============================================
// EXPORT OPERATIONS
// ============================================
export const exportDoc = {
  markdown: (inputPath, outputPath, format, options) =>
    invoke('export_markdown', { inputPath, outputPath, format, options }),
  checkPandoc: () => invoke('check_pandoc_available', {}),
};

// ============================================
// GIT OPERATIONS
// ============================================
export const git = {
  status: (repoPath) => invoke('git_status', { repoPath }),
  stage: (repoPath, path) => invoke('git_stage', { repoPath, path }),
  commit: (repoPath, message) => invoke('git_commit', { repoPath, message }),
  log: (repoPath, limit) => invoke('git_log', { repoPath, limit }),
  diff: (repoPath, path) => invoke('git_diff', { repoPath, path }),
};

// ============================================
// APP OPERATIONS
// ============================================
export const app = {
  getVersion: () => invoke('get_app_version'),
  getRecentFiles: () => invoke('get_recent_files'),
  saveRecentFiles: (files) => invoke('save_recent_files', { files }),
};

// ============================================
// PDF OPERATIONS
// ============================================
export const pdf = {
  getPageCount: (path) => invoke('get_pdf_page_count', { path }),
  merge: (paths, output) => invoke('merge_pdfs', { paths, output }),
  split: (input, outputDir, pagesPerSplit) => invoke('split_pdf', { input, outputDir, pagesPerSplit }),
  rotate: (input, output, degrees) => invoke('rotate_pdf', { input, output, degrees }),
  deletePages: (input, output, pages) => invoke('delete_pdf_pages', { input, output, pages }),
};

// ============================================
// DIALOG OPERATIONS
// ============================================
export const dialog = {
  openFile: () => invoke('open_file_dialog', {}),
  saveFile: (defaultName) => invoke('save_file_dialog', { defaultName }),
  selectFolder: () => invoke('select_folder_dialog', {}),
};

// ============================================
// EVENT LISTENERS
// ============================================
export const events = {
  onFileNew: (callback) => listen('file-new', callback),
  onFileOpened: (callback) => listen('file-opened', callback),
  onFileSave: (callback) => listen('file-save', callback),
  onTogglePreview: (callback) => listen('toggle-preview', callback),
  onToggleFind: (callback) => listen('toggle-find', callback),
  onUndo: (callback) => listen('undo', callback),
  onRedo: (callback) => listen('redo', callback),
  onThemeChanged: (callback) => listen('theme-changed', callback),
  onToggleCommandPalette: (callback) => listen('toggle-command-palette', callback),
  onToggleSidebarPanel: (callback) => listen('toggle-sidebar-panel', callback),
  onToggleBottomPanel: (callback) => listen('toggle-bottom-panel', callback),
  onConversionComplete: (callback) => listen('conversion-complete', callback),
  onConversionStatus: (callback) => listen('conversion-status', callback),
};

// ============================================
// PLUGIN OPERATIONS
// ============================================
export const plugins = {
  list: () => invoke('list_plugins', {}),
  get: (name) => invoke('get_plugin', { name }),
};