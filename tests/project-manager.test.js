const { ProjectManager } = require('../src/plugins/built-in/writing-studio/project-manager');

describe('ProjectManager', () => {
  let pm;
  let files;

  beforeEach(() => {
    files = {};
    pm = new ProjectManager({
      readFile: (p) => files[p] || null,
      writeFile: (p, c) => { files[p] = c; },
      fileExists: (p) => p in files,
      listDir: (p) => Object.keys(files).filter(f => f.startsWith(p)).map(f => f.slice(p.length + 1))
    });
  });

  test('createProject writes .project.json', () => {
    const project = pm.createProject('/manuscripts/novel', {
      title: 'My Novel', type: 'manuscript', targetWords: 80000
    });
    expect(project.title).toBe('My Novel');
    expect(files['/manuscripts/novel/.project.json']).toBeDefined();
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.target.words).toBe(80000);
  });

  test('loadProject reads and returns project data', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [], metadata: {}
    });
    const project = pm.loadProject('/manuscripts/novel');
    expect(project.title).toBe('Test');
  });

  test('loadProject returns null if no project file', () => {
    expect(pm.loadProject('/nonexistent')).toBeNull();
  });

  test('addChapter appends chapter and saves', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [], metadata: {}
    });
    pm.addChapter('/manuscripts/novel', { file: '01-chapter.md', title: 'Chapter One', status: 'draft' });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].title).toBe('Chapter One');
  });

  test('compileManuscript concatenates chapter files', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'First chapter content.';
    files['/manuscripts/novel/02.md'] = 'Second chapter content.';
    const result = pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('First chapter content.\n\n---\n\nSecond chapter content.');
  });

  test('compileManuscript skips missing files', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'Only chapter one.';
    const result = pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('Only chapter one.');
  });

  test('getStats returns total word count across chapters', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'word '.repeat(100).trim();
    files['/manuscripts/novel/02.md'] = 'more '.repeat(50).trim();
    const stats = pm.getStats('/manuscripts/novel');
    expect(stats.totalWords).toBeGreaterThan(0);
    expect(stats.chapterCount).toBe(2);
    expect(stats.targetWords).toBe(50000);
    expect(stats.pctComplete).toBeDefined();
  });

  test('updateChapter modifies a chapter by index', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [{ file: '01.md', title: 'Old Title', status: 'draft' }],
      metadata: {}
    });
    pm.updateChapter('/manuscripts/novel', 0, { title: 'New Title', status: 'revised' });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters[0].title).toBe('New Title');
    expect(parsed.chapters[0].status).toBe('revised');
  });
});
