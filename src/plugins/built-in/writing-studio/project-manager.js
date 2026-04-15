class ProjectManager {
  /**
   * @param {object} fs - { readFile(path), writeFile(path, content), fileExists(path), listDir(path) }
   */
  constructor(fs) {
    this.fs = fs;
  }

  createProject(dir, opts) {
    const project = {
      title: opts.title,
      type: opts.type || 'manuscript',
      target: { words: opts.targetWords || 0, deadline: opts.deadline || null },
      chapters: [],
      metadata: opts.metadata || {}
    };
    this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
    return project;
  }

  loadProject(dir) {
    const raw = this.fs.readFile(dir + '/.project.json');
    if (!raw) return null;
    return JSON.parse(raw);
  }

  _saveProject(dir, project) {
    this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
  }

  addChapter(dir, chapter) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    project.chapters.push(chapter);
    this._saveProject(dir, project);
  }

  updateChapter(dir, index, updates) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    Object.assign(project.chapters[index], updates);
    this._saveProject(dir, project);
  }

  compileManuscript(dir) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    const parts = [];
    for (const ch of project.chapters) {
      const content = this.fs.readFile(dir + '/' + ch.file);
      if (content) parts.push(content);
    }
    return parts.join('\n\n---\n\n');
  }

  getStats(dir) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    let totalWords = 0;
    for (const ch of project.chapters) {
      const content = this.fs.readFile(dir + '/' + ch.file);
      if (content) totalWords += content.split(/\s+/).filter(Boolean).length;
    }
    const target = project.target.words || 0;
    return {
      totalWords,
      chapterCount: project.chapters.length,
      targetWords: target,
      pctComplete: target > 0 ? Math.min(100, Math.round((totalWords / target) * 100)) : 0
    };
  }
}

module.exports = { ProjectManager };
