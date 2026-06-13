/**
 * Tests for Markdown Extensions
 * Tests TOC generation, admonition parsing, and PlantUML encoding
 */

describe('Markdown Extensions', () => {
  describe('TOC generation from headings', () => {
    test('extracts all heading levels', () => {
      const html = '<h1>Title</h1><h2>Section 1</h2><h2>Section 2</h2><h3>Subsection</h3>';
      const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
      const toc = [];
      let match;
      while ((match = headingRegex.exec(html)) !== null) {
        toc.push({ level: parseInt(match[1]), text: match[2] });
      }
      expect(toc).toHaveLength(4);
      expect(toc[0]).toEqual({ level: 1, text: 'Title' });
      expect(toc[3]).toEqual({ level: 3, text: 'Subsection' });
    });

    test('handles empty HTML', () => {
      const html = '<p>No headings here</p>';
      const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
      const toc = [];
      let match;
      while ((match = headingRegex.exec(html)) !== null) {
        toc.push({ level: parseInt(match[1]), text: match[2] });
      }
      expect(toc).toHaveLength(0);
    });

    test('handles headings with attributes', () => {
      const html = '<h1 id="title" class="main">Title</h1><h2 id="sec">Section</h2>';
      const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
      const toc = [];
      let match;
      while ((match = headingRegex.exec(html)) !== null) {
        toc.push({ level: parseInt(match[1]), text: match[2] });
      }
      expect(toc).toHaveLength(2);
      expect(toc[0].text).toBe('Title');
    });
  });

  describe('Admonition regex matching', () => {
    test('matches note admonition', () => {
      const src = ':::note\nThis is a note.\n:::\n';
      const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
      expect(match).not.toBeNull();
      expect(match[1]).toBe('note');
      expect(match[2].trim()).toBe('This is a note.');
    });

    test('matches all admonition types', () => {
      const types = ['note', 'warning', 'tip', 'danger', 'info'];
      types.forEach((type) => {
        const src = `:::${type}\nContent\n:::\n`;
        const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
        expect(match).not.toBeNull();
        expect(match[1]).toBe(type);
      });
    });

    test('does not match invalid admonition type', () => {
      const src = ':::custom\nContent\n:::\n';
      const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
      expect(match).toBeNull();
    });

    test('captures multiline content', () => {
      const src = ':::warning\nLine 1\nLine 2\nLine 3\n:::\n';
      const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
      expect(match).not.toBeNull();
      expect(match[2]).toContain('Line 1');
      expect(match[2]).toContain('Line 3');
    });
  });

  describe('Admonitions full parsing integration (mocked environment)', () => {
    const extension = {
      name: 'admonition',
      level: 'block',
      start(src) {
        return src.match(/^:::(note|warning|tip|danger|info)/m)?.index;
      },
      tokenizer(src) {
        const match = src.match(/^:::(note|warning|tip|danger|info)\s*\n([\s\S]*?)^:::\s*$/m);
        if (match && match.index === 0) {
          const admonitionType = match[1];
          const text = match[2].trim();
          const tokens = [];
          this.lexer.blockTokens(text, tokens);
          return {
            type: 'admonition',
            raw: match[0],
            admonitionType,
            text,
            tokens,
          };
        }
      },
      renderer(token) {
        const icons = { note: 'ℹ', warning: '⚠', tip: '💡', danger: '🔴', info: 'ℹ' };
        const icon = icons[token.admonitionType] || 'ℹ';
        const inner = this.parser.parse(token.tokens || []);
        return `<div class="admonition admonition-${token.admonitionType}">
                    <div class="admonition-title">${icon} ${token.admonitionType.charAt(0).toUpperCase() + token.admonitionType.slice(1)}</div>
                    <div class="admonition-content">${inner}</div>
                </div>`;
      },
    };

    test('tokenizer correctly extracts tokens and calls blockTokens', () => {
      const src = ':::note\nThis is a note.\n:::';
      const mockLexer = {
        blockTokens: jest.fn((text, tokens) => {
          tokens.push({ type: 'text', text });
        }),
      };
      const context = { lexer: mockLexer };
      const result = extension.tokenizer.call(context, src);

      expect(result).toBeDefined();
      expect(result.type).toBe('admonition');
      expect(result.admonitionType).toBe('note');
      expect(result.text).toBe('This is a note.');
      expect(mockLexer.blockTokens).toHaveBeenCalledWith('This is a note.', expect.any(Array));
      expect(result.tokens).toEqual([{ type: 'text', text: 'This is a note.' }]);
    });

    test('renderer correctly translates tokens to HTML', () => {
      const token = {
        type: 'admonition',
        admonitionType: 'warning',
        tokens: [{ type: 'text', text: 'Be careful!' }],
      };
      const mockParser = {
        parse: jest.fn((_tokens) => '<p>Be careful!</p>'),
      };
      const context = { parser: mockParser };
      const html = extension.renderer.call(context, token);

      expect(html).toContain('admonition admonition-warning');
      expect(html).toContain('⚠ Warning');
      expect(html).toContain('<p>Be careful!</p>');
      expect(mockParser.parse).toHaveBeenCalledWith(token.tokens);
    });
  });

  describe('PlantUML hex encoding', () => {
    const plantumlEncode = (text) => {
      const hex = Array.from(Buffer.from(text, 'utf-8'))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return '~h' + hex;
    };

    test('encodes simple text', () => {
      const encoded = plantumlEncode('A -> B');
      expect(encoded).toBe('~h41202d3e2042');
    });

    test('encodes empty string', () => {
      expect(plantumlEncode('')).toBe('~h');
    });

    test('encodes special characters', () => {
      const encoded = plantumlEncode('@startuml');
      expect(encoded).toMatch(/^~h[0-9a-f]+$/);
      // '@' is 0x40, 's' is 0x73
      expect(encoded.startsWith('~h40')).toBe(true);
    });
  });

  describe('Slug generation for TOC anchors', () => {
    const slugify = (text) => {
      return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    };

    test('converts heading to slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    test('removes special characters', () => {
      expect(slugify('What is C++?')).toBe('what-is-c');
    });

    test('collapses multiple dashes', () => {
      expect(slugify('Hello   World')).toBe('hello-world');
    });

    test('handles already lowercase text', () => {
      expect(slugify('simple')).toBe('simple');
    });
  });

  describe('scopeCSS utility', () => {
    const scopeCSS = (cssText, scopeSelector) => {
      if (!cssText) return '';
      return cssText.replace(
        /([^\r\n,{}]+)(,(?=[^}]*{)|(?=[^{]*{))/g,
        (match, selector, separator) => {
          const trimmed = selector.trim();
          if (
            !trimmed ||
            trimmed.startsWith('@') ||
            trimmed.startsWith(':root') ||
            trimmed.startsWith('from') ||
            trimmed.startsWith('to') ||
            /^\d+%$/.test(trimmed)
          ) {
            return match;
          }
          return scopeSelector + ' ' + trimmed + (separator || '');
        }
      );
    };

    test('scopes standard tag selector', () => {
      const css = 'h1 { color: red; }';
      const scoped = scopeCSS(css, '.preview-content');
      expect(scoped).toBe('.preview-content h1{ color: red; }');
    });

    test('scopes multiple class selectors', () => {
      const css = '.title, .content { font-family: sans-serif; }';
      const scoped = scopeCSS(css, '.preview-content');
      expect(scoped).toBe(
        '.preview-content .title,.preview-content .content{ font-family: sans-serif; }'
      );
    });

    test('ignores @rules like @media', () => {
      const css = '@media (max-width: 600px) { h1 { color: blue; } }';
      const scoped = scopeCSS(css, '.preview-content');
      expect(scoped).toContain('@media (max-width: 600px)');
    });

    test('ignores :root selector', () => {
      const css = ':root { --color: red; }';
      const scoped = scopeCSS(css, '.preview-content');
      expect(scoped).toBe(':root { --color: red; }');
    });

    test('ignores keyframe percentages', () => {
      const css = '0% { opacity: 0; } 100% { opacity: 1; }';
      const scoped = scopeCSS(css, '.preview-content');
      expect(scoped).toContain('0%');
      expect(scoped).toContain('100%');
    });

    test('handles empty input', () => {
      expect(scopeCSS('', '.preview-content')).toBe('');
      expect(scopeCSS(null, '.preview-content')).toBe('');
    });
  });
});
