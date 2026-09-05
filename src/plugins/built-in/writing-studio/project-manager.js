/**
 * Manuscript project management (.project.json + chapter files).
 *
 * All methods are async: the fs backend injected by the plugin is the
 * IPC-backed file API (readFile/writeFile/fileExists/listDir return
 * Promises); `await` also works against the synchronous fakes used in unit
 * tests.
 */
class ProjectManager {
  /**
   * @param {object} fs - { readFile(path), writeFile(path, content), fileExists(path), listDir(path) }
   */
  constructor(fs) {
    this.fs = fs;
  }

  async createProject(dir, opts) {
    const project = {
      title: opts.title,
      type: opts.type || 'manuscript',
      target: { words: opts.targetWords || 0, deadline: opts.deadline || null },
      chapters: [],
      metadata: opts.metadata || {},
    };
    await this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
    return project;
  }

  async loadProject(dir) {
    const exists = await this.fs.fileExists(dir + '/.project.json');
    if (!exists) return null;
    const raw = await this.fs.readFile(dir + '/.project.json');
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async _saveProject(dir, project) {
    await this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
  }

  async addChapter(dir, chapter) {
    const project = await this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    project.chapters.push(chapter);
    await this._saveProject(dir, project);
  }

  async updateChapter(dir, index, updates) {
    const project = await this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    Object.assign(project.chapters[index], updates);
    await this._saveProject(dir, project);
  }

  async compileManuscript(dir) {
    const project = await this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    const parts = [];
    for (const ch of project.chapters) {
      const content = await this.fs.readFile(dir + '/' + ch.file);
      if (content) parts.push(content);
    }
    return parts.join('\n\n---\n\n');
  }

  async getStats(dir) {
    const project = await this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    let totalWords = 0;
    for (const ch of project.chapters) {
      const content = await this.fs.readFile(dir + '/' + ch.file);
      if (content) totalWords += content.split(/\s+/).filter(Boolean).length;
    }
    const target = project.target.words || 0;
    return {
      totalWords,
      chapterCount: project.chapters.length,
      targetWords: target,
      pctComplete: target > 0 ? Math.min(100, Math.round((totalWords / target) * 100)) : 0,
    };
  }
}

module.exports = { ProjectManager };
