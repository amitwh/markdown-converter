// src/main/utils/paths.js
// Path helpers — extracted from src/main.js lines 109-207
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getAllowedDirectories() {
  const dirs = [
    app.getPath('documents'),
    app.getPath('desktop'),
    app.getPath('downloads'),
    app.getPath('home'),
    process.cwd() // Current working directory
  ].filter(Boolean); // Remove any undefined paths
  return dirs;
}

/**
 * Validates that a file path is safe and doesn't attempt path traversal
 * @param {string} filePath - The path to validate
 * @returns {{ valid: boolean, resolved: string, error?: string }}
 */
function validatePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, resolved: '', error: 'Invalid path' };
  }

  // Resolve to absolute path (handles .., ., symlinks)
  let resolved;
  try {
    resolved = path.resolve(filePath);
  } catch (err) {
    return { valid: false, resolved: '', error: 'Invalid path format' };
  }

  // Normalize path separators
  resolved = path.normalize(resolved);

  // Check for null bytes (path injection)
  if (resolved.includes('\0')) {
    return { valid: false, resolved: '', error: 'Null byte in path' };
  }

  // Check if path exists
  if (!fs.existsSync(resolved)) {
    return { valid: false, resolved, error: 'Path does not exist' };
  }

  return { valid: true, resolved };
}

/**
 * Resolves a path for operations where the target may not exist yet.
 * Validates string shape and blocks obviously sensitive locations.
 * @param {string} filePath
 * @returns {{ valid: boolean, resolved: string, error?: string }}
 */
function resolveWritablePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, resolved: '', error: 'Invalid path' };
  }

  let resolved;
  try {
    resolved = path.normalize(path.resolve(filePath));
  } catch (err) {
    return { valid: false, resolved: '', error: 'Invalid path format' };
  }

  if (resolved.includes('\0')) {
    return { valid: false, resolved: '', error: 'Null byte in path' };
  }

  if (!isPathAccessible(resolved)) {
    return { valid: false, resolved, error: 'Path is not accessible' };
  }

  return { valid: true, resolved };
}

/**
 * Checks if a resolved path is within allowed directories
 * For an editor app, we allow access to all user-accessible paths
 * but log any suspicious access attempts
 * @param {string} resolvedPath - The resolved absolute path
 * @returns {boolean}
 */
function isPathAccessible(resolvedPath) {
  // Block access to sensitive system directories
  const blockedPaths = [
    '/etc/passwd', '/etc/shadow', '/root',
    'C:\\Windows\\System32', 'C:\\Windows\\System',
    '/System', '/private/etc'
  ];

  const normalizedPath = resolvedPath.toLowerCase();
  for (const blocked of blockedPaths) {
    if (normalizedPath.startsWith(blocked.toLowerCase())) {
      console.warn('[SECURITY] Blocked access to sensitive path:', resolvedPath);
      return false;
    }
  }

  return true;
}

module.exports = { getAllowedDirectories, validatePath, resolveWritablePath, isPathAccessible };
