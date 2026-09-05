/**
 * WikiLinks + Backlinks unit tests (pure string/graph logic, no IO).
 */
const path = require('path');
const { renderWikiLinksInHtml, resolveTargetPath, docNameFor } = require('../src/utils/wiki-links');
const {
  collectMarkdownFiles,
  extractOutgoingLinks,
  findBacklinks,
} = require('../src/utils/backlinks');

describe('wiki-links', () => {
  describe('renderWikiLinksInHtml', () => {
    it('converts [[target]] into a wiki-link anchor', () => {
      const html = renderWikiLinksInHtml('<p>see [[My Note]] now</p>');
      expect(html).toContain('data-wiki-target="My Note"');
      expect(html).toContain('>My Note</a>');
      expect(html).not.toContain('[[');
    });

    it('uses the alias as label when [[target|alias]]', () => {
      const html = renderWikiLinksInHtml('<p>[[My Note|the note]]</p>');
      expect(html).toContain('data-wiki-target="My Note"');
      expect(html).toContain('>the note</a>');
    });

    it('ignores the heading fragment in [[target#section]]', () => {
      const html = renderWikiLinksInHtml('<p>[[Note#Details]]</p>');
      expect(html).toContain('data-wiki-target="Note"');
    });

    it('leaves code blocks and inline code untouched', () => {
      const html = renderWikiLinksInHtml(
        '<p>real [[Link]]</p><pre><code>fake [[Code]]</code></pre><p><code>[[Inline]]</code></p>'
      );
      expect(html).toContain('data-wiki-target="Link"');
      expect(html).not.toContain('data-wiki-target="Code"');
      expect(html).not.toContain('data-wiki-target="Inline"');
      expect(html).toContain('[[Code]]');
    });

    it('escapes HTML in targets and labels', () => {
      const html = renderWikiLinksInHtml('<p>[[A<b>&Note|lbl"&x]]</p>');
      expect(html).not.toContain('<b>&Note');
      expect(html).toContain('data-wiki-target=');
    });

    it('passes through HTML without [[ unchanged (fast path)', () => {
      expect(renderWikiLinksInHtml('<p>plain</p>')).toBe('<p>plain</p>');
    });
  });

  describe('resolveTargetPath', () => {
    it('appends .md in the current directory', () => {
      expect(resolveTargetPath('Note', '/docs', path)).toBe(path.join('/docs', 'Note.md'));
    });

    it('keeps an existing markdown extension', () => {
      expect(resolveTargetPath('Note.md', '/docs', path)).toBe(path.join('/docs', 'Note.md'));
      expect(resolveTargetPath('Note.markdown', '/docs', path)).toBe(
        path.join('/docs', 'Note.markdown')
      );
    });

    it('supports relative subpaths', () => {
      expect(resolveTargetPath('sub/Note', '/docs', path)).toBe(
        path.join('/docs', 'sub', 'Note.md')
      );
    });

    it('rejects absolute and traversing targets', () => {
      expect(resolveTargetPath('/etc/passwd', '/docs', path)).toBeNull();
      expect(resolveTargetPath('C:/win', '/docs', path)).toBeNull();
      expect(resolveTargetPath('../outside', '/docs', path)).toBeNull();
      expect(resolveTargetPath('', '/docs', path)).toBeNull();
    });
  });

  describe('docNameFor', () => {
    it('strips the markdown extension', () => {
      expect(docNameFor('/docs/My Note.md', path)).toBe('My Note');
      expect(docNameFor('/docs/My Note.markdown', path)).toBe('My Note');
      expect(docNameFor(null, path)).toBeNull();
    });
  });
});

describe('backlinks', () => {
  describe('extractOutgoingLinks', () => {
    it('collects unique targets including aliased/sectioned links', () => {
      const links = extractOutgoingLinks('[[A]] and [[B|x]] and [[A#sec]] and [[C]]');
      expect(links.sort()).toEqual(['A', 'B', 'C']);
    });
  });

  describe('collectMarkdownFiles', () => {
    it('walks folders breadth-first, skipping hidden and vendor dirs, capped', async () => {
      const tree = {
        '/vault': [
          { name: 'a.md', isDirectory: false, path: '/vault/a.md' },
          { name: '.git', isDirectory: true, path: '/vault/.git' },
          { name: 'node_modules', isDirectory: true, path: '/vault/node_modules' },
          { name: 'sub', isDirectory: true, path: '/vault/sub' },
        ],
        '/vault/sub': [{ name: 'b.markdown', isDirectory: false, path: '/vault/sub/b.markdown' }],
        // .git/node_modules never requested
      };
      const listDir = async (dir) => ({ entries: tree[dir] || [] });
      const files = await collectMarkdownFiles('/vault', listDir);
      expect(files.sort()).toEqual(['/vault/a.md', '/vault/sub/b.markdown']);
    });

    it('respects the file cap', async () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        name: `f${i}.md`,
        isDirectory: false,
        path: `/v/f${i}.md`,
      }));
      const files = await collectMarkdownFiles('/v', async () => ({ entries }), { maxFiles: 5 });
      expect(files).toHaveLength(5);
    });
  });

  describe('findBacklinks', () => {
    it('finds linking documents with line numbers and context', async () => {
      const files = ['/v/a.md', '/v/b.md', '/v/current.md'];
      const contents = {
        '/v/a.md': 'intro\nsee [[Current Note]] here',
        '/v/b.md': 'no links here',
      };
      const readFile = async (p) => contents[p] ?? null;
      const links = await findBacklinks({
        docName: 'Current Note',
        docPath: '/v/current.md',
        files,
        readFile,
      });
      expect(links).toEqual([
        expect.objectContaining({ path: '/v/a.md', line: 2, context: 'see [[Current Note]] here' }),
      ]);
    });

    it('matches .md-suffixed and case-insensitive references, misses self', async () => {
      const contents = {
        '/v/a.md': '[[current note.md]]',
        '/v/current.md': 'self ref [[Current Note]]',
      };
      const links = await findBacklinks({
        docName: 'Current Note',
        docPath: '/v/current.md',
        files: ['/v/a.md', '/v/current.md'],
        readFile: async (p) => contents[p] ?? null,
      });
      expect(links).toHaveLength(1);
      expect(links[0].path).toBe('/v/a.md');
    });
  });
});
