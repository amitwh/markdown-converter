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
            types.forEach(type => {
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

    describe('PlantUML hex encoding', () => {
        const plantumlEncode = (text) => {
            const hex = Array.from(Buffer.from(text, 'utf-8'))
                .map(b => b.toString(16).padStart(2, '0'))
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
});
