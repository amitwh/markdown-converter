/**
 * Electron File System Adapter
 *
 * Implements file system operations for Electron using IPC.
 * This abstracts file operations to enable easier testing and migration.
 *
 * @version 4.1.0
 */

/**
 * Electron File System Adapter
 * @type {import('../types').FileSystemAdapter}
 */
const electronFsAdapter = {
    /**
     * Read file content
     * @param {string} path - File path
     * @returns {Promise<string>} File content
     */
    async readFile(path) {
        return await window.electronAPI.readFile(path);
    },

    /**
     * Write content to file
     * @param {string} path - File path
     * @param {string} content - File content
     * @returns {Promise<void>}
     */
    async writeFile(path, content) {
        return await window.electronAPI.writeFile(path, content);
    },

    /**
     * Delete file
     * @param {string} path - File path
     * @returns {Promise<void>}
     */
    async deleteFile(path) {
        // TODO: Add IPC channel for delete
        throw new Error('deleteFile not implemented');
    },

    /**
     * Ensure directory exists
     * @param {string} path - Directory path
     * @returns {Promise<void>}
     */
    async ensureDir(path) {
        // TODO: Add IPC channel for ensureDir
        throw new Error('ensureDir not implemented');
    },

    /**
     * List directory contents
     * @param {string} path - Directory path
     * @returns {Promise<Array<import('../types').FileInfo>>}
     */
    async listDirectory(path) {
        // TODO: Add IPC channel for listDirectory
        throw new Error('listDirectory not implemented');
    },

    /**
     * Check if path exists
     * @param {string} path - Path to check
     * @returns {Promise<boolean>}
     */
    async exists(path) {
        // TODO: Add IPC channel for exists
        throw new Error('exists not implemented');
    },

    /**
     * Check if path is a directory
     * @param {string} path - Path to check
     * @returns {Promise<boolean>}
     */
    async isDirectory(path) {
        // TODO: Add IPC channel for isDirectory
        throw new Error('isDirectory not implemented');
    },

    /**
     * Copy file or directory
     * @param {string} source - Source path
     * @param {string} dest - Destination path
     * @returns {Promise<void>}
     */
    async copy(source, dest) {
        // TODO: Add IPC channel for copy
        throw new Error('copy not implemented');
    },

    /**
     * Move file or directory
     * @param {string} source - Source path
     * @param {string} dest - Destination path
     * @returns {Promise<void>}
     */
    async move(source, dest) {
        // TODO: Add IPC channel for move
        throw new Error('move not implemented');
    }
};

module.exports = { electronFsAdapter };
