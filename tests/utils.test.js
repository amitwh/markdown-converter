/**
 * Tests for Utility Functions
 * Tests helper functions that can be extracted and tested
 */

describe('Utility Functions', () => {
  describe('hexToRgb', () => {
    // This function converts hex colors to RGB
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
          }
        : null;
    }

    test('should convert black hex to RGB', () => {
      const result = hexToRgb('#000000');
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    test('should convert white hex to RGB', () => {
      const result = hexToRgb('#ffffff');
      expect(result).toEqual({ r: 1, g: 1, b: 1 });
    });

    test('should convert red hex to RGB', () => {
      const result = hexToRgb('#ff0000');
      expect(result.r).toBeCloseTo(1);
      expect(result.g).toBeCloseTo(0);
      expect(result.b).toBeCloseTo(0);
    });

    test('should handle hex without hash', () => {
      const result = hexToRgb('00ff00');
      expect(result.r).toBeCloseTo(0);
      expect(result.g).toBeCloseTo(1);
      expect(result.b).toBeCloseTo(0);
    });

    test('should return null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#xyz')).toBeNull();
    });
  });

  describe('File Path Utilities', () => {
    test('should extract file extension', () => {
      const getExtension = (filepath) => {
        const match = filepath.match(/\.([^/.]+)$/);
        return match ? match[1].toLowerCase() : '';
      };

      expect(getExtension('file.md')).toBe('md');
      expect(getExtension('document.PDF')).toBe('pdf');
      expect(getExtension('path/to/file.docx')).toBe('docx');
      expect(getExtension('noextension')).toBe('');
    });

    test('should replace file extension', () => {
      const replaceExtension = (filepath, newExt) => {
        return filepath.replace(/\.[^/.]+$/, `.${newExt}`);
      };

      expect(replaceExtension('file.md', 'pdf')).toBe('file.pdf');
      expect(replaceExtension('path/to/doc.docx', 'html')).toBe('path/to/doc.html');
    });
  });
});
