/**
 * Tests for Main Process Utilities
 * Tests sanitization, rate limiting, and other main process helpers
 */

describe('sanitizeErrorMessage', () => {
    const sanitizeErrorMessage = (message) => {
        if (typeof message !== 'string') return String(message);
        return message
            .replace(/[A-Z]:\\[^\s"']+\\([^\s"'\\]+)/gi, '$1')
            .replace(/\/[^\s"']+\/([^\s"'/]+)/g, '$1');
    };

    test('strips Windows absolute paths', () => {
        expect(sanitizeErrorMessage('Error in C:\\Users\\test\\file.js'))
            .toBe('Error in file.js');
    });

    test('strips Unix absolute paths', () => {
        expect(sanitizeErrorMessage('Error in /home/user/project/file.js'))
            .toBe('Error in file.js');
    });

    test('handles non-string input', () => {
        expect(sanitizeErrorMessage(42)).toBe('42');
        expect(sanitizeErrorMessage(null)).toBe('null');
    });

    test('preserves messages without paths', () => {
        expect(sanitizeErrorMessage('Something went wrong'))
            .toBe('Something went wrong');
    });

    test('strips nested Windows paths', () => {
        expect(sanitizeErrorMessage('Cannot read C:\\Users\\admin\\AppData\\Local\\config.json'))
            .toBe('Cannot read config.json');
    });

    test('strips nested Unix paths', () => {
        expect(sanitizeErrorMessage('File not found: /var/log/app/error.log'))
            .toBe('File not found: error.log');
    });

    test('handles undefined input', () => {
        expect(sanitizeErrorMessage(undefined)).toBe('undefined');
    });
});

describe('createRateLimiter', () => {
    const createRateLimiter = (minIntervalMs = 2000) => {
        let lastCall = 0;
        return function canProceed() {
            const now = Date.now();
            if (now - lastCall < minIntervalMs) return false;
            lastCall = now;
            return true;
        };
    };

    test('allows first call', () => {
        const limiter = createRateLimiter(1000);
        expect(limiter()).toBe(true);
    });

    test('blocks rapid calls', () => {
        const limiter = createRateLimiter(1000);
        limiter(); // first call
        expect(limiter()).toBe(false); // too soon
    });

    test('allows call after interval', () => {
        jest.useFakeTimers();
        const limiter = createRateLimiter(1000);
        limiter();
        jest.advanceTimersByTime(1001);
        expect(limiter()).toBe(true);
        jest.useRealTimers();
    });

    test('uses default interval of 2000ms', () => {
        jest.useFakeTimers();
        const limiter = createRateLimiter();
        limiter();
        jest.advanceTimersByTime(1999);
        expect(limiter()).toBe(false);
        jest.advanceTimersByTime(2);
        expect(limiter()).toBe(true);
        jest.useRealTimers();
    });

    test('resets after successful call', () => {
        jest.useFakeTimers();
        const limiter = createRateLimiter(500);
        limiter();
        jest.advanceTimersByTime(501);
        limiter(); // resets the timer
        expect(limiter()).toBe(false); // too soon after second call
        jest.useRealTimers();
    });
});
