const { ProjectManager } = require('../src/plugins/built-in/writing-studio/project-manager');

// All ProjectManager methods are async (the real fs backend is the IPC-backed
// file API; these tests inject a synchronous fake, which `await` handles).
describe('ProjectManager', () => {
  let pm;
  let files;

  beforeEach(() => {
    files = {};
    pm = new ProjectManager({
      readFile: (p) => files[p] || null,
      writeFile: (p, c) => {
        files[p] = c;
      },
      fileExists: (p) => p in files,
      listDir: (p) =>
        Object.keys(files)
          .filter((f) => f.startsWith(p))
          .map((f) => f.slice(p.length + 1)),
    });
  });

  test('createProject writes .project.json', async () => {
    const project = await pm.createProject('/manuscripts/novel', {
      title: 'My Novel',
      type: 'manuscript',
      targetWords: 80000,
    });
    expect(project.title).toBe('My Novel');
    expect(files['/manuscripts/novel/.project.json']).toBeDefined();
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.target.words).toBe(80000);
  });

  test('loadProject reads and returns project data', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [],
      metadata: {},
    });
    const project = await pm.loadProject('/manuscripts/novel');
    expect(project.title).toBe('Test');
  });

  test('loadProject returns null if no project file', async () => {
    await expect(pm.loadProject('/nonexistent')).resolves.toBeNull();
  });

  test('addChapter appends chapter and saves', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [],
      metadata: {},
    });
    await pm.addChapter('/manuscripts/novel', {
      file: '01-chapter.md',
      title: 'Chapter One',
      status: 'draft',
    });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].title).toBe('Chapter One');
  });

  test('compileManuscript concatenates chapter files', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' },
      ],
      metadata: {},
    });
    files['/manuscripts/novel/01.md'] = 'First chapter content.';
    files['/manuscripts/novel/02.md'] = 'Second chapter content.';
    const result = await pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('First chapter content.\n\n---\n\nSecond chapter content.');
  });

  test('compileManuscript skips missing files', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' },
      ],
      metadata: {},
    });
    files['/manuscripts/novel/01.md'] = 'Only chapter one.';
    const result = await pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('Only chapter one.');
  });

  test('getStats returns total word count across chapters', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' },
      ],
      metadata: {},
    });
    files['/manuscripts/novel/01.md'] = 'word '.repeat(100).trim();
    files['/manuscripts/novel/02.md'] = 'more '.repeat(50).trim();
    const stats = await pm.getStats('/manuscripts/novel');
    expect(stats.totalWords).toBeGreaterThan(0);
    expect(stats.chapterCount).toBe(2);
    expect(stats.targetWords).toBe(50000);
    expect(stats.pctComplete).toBeDefined();
  });

  test('updateChapter modifies a chapter by index', async () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test',
      type: 'manuscript',
      target: { words: 50000 },
      chapters: [{ file: '01.md', title: 'Old Title', status: 'draft' }],
      metadata: {},
    });
    await pm.updateChapter('/manuscripts/novel', 0, { title: 'New Title', status: 'revised' });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters[0].title).toBe('New Title');
    expect(parsed.chapters[0].status).toBe('revised');
  });
});
