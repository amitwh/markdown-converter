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
        return await window.electronAPI.file.read(path);
    },

    /**
     * Write content to file
     * @param {string} path - File path
     * @param {string} content - File content
     * @returns {Promise<void>}
     */
    async writeFile(path, content) {
        return await window.electronAPI.file.write(path, content);
    },

    /**
     * Delete file
     * @param {string} path - File path
     * @returns {Promise<void>}
     */
    async deleteFile(path) {
        return await window.electronAPI.file.delete(path);
    },

    /**
     * Ensure directory exists
     * @param {string} path - Directory path
     * @returns {Promise<void>}
     */
    async ensureDir(path) {
        return await window.electronAPI.file.ensureDir(path);
    },

    /**
     * List directory contents
     * @param {string} path - Directory path
     * @returns {Promise<Array<import('../types').FileInfo>>}
     */
    async listDirectory(path) {
        const result = await window.electronAPI.invoke('list-directory', path);
        if (!result?.entries) {
            return [];
        }

        return result.entries.map((entry) => ({
            name: entry.name,
            isDir: entry.isDirectory,
            size: entry.size ?? 0,
            modified: entry.modified ?? 0,
            path: entry.path
        }));
    },

    /**
     * Check if path exists
     * @param {string} path - Path to check
     * @returns {Promise<boolean>}
     */
    async exists(path) {
        return await window.electronAPI.file.exists(path);
    },

    /**
     * Check if path is a directory
     * @param {string} path - Path to check
     * @returns {Promise<boolean>}
     */
    async isDirectory(path) {
        return await window.electronAPI.file.isDirectory(path);
    },

    /**
     * Copy file or directory
     * @param {string} source - Source path
     * @param {string} dest - Destination path
     * @returns {Promise<void>}
     */
    async copy(source, dest) {
        return await window.electronAPI.file.copy(source, dest);
    },

    /**
     * Move file or directory
     * @param {string} source - Source path
     * @param {string} dest - Destination path
     * @returns {Promise<void>}
     */
    async move(source, dest) {
        return await window.electronAPI.file.move(source, dest);
    }
};

module.exports = { electronFsAdapter };
