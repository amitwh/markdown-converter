/**
 * Tests for ModalManager
 * Covers the three bugs fixed in modal refactor:
 *   1. open() animation: reflow between hidden removal and open class add
 *   2. close() cleanup: 'hidden' class restored after transition
 *   3. State management: isOpen() accuracy
 */

const { ModalManager } = require('../src/utils/ModalManager');

function createModalElement(id = 'test-modal') {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('data-close', '');

    const content = document.createElement('div');
    content.className = 'modal-content';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close');

    const body = document.createElement('div');
    body.className = 'modal-body';

    const input = document.createElement('input');
    input.type = 'text';

    body.appendChild(input);
    header.appendChild(closeBtn);
    content.appendChild(header);
    content.appendChild(body);
    modal.appendChild(backdrop);
    modal.appendChild(content);
    document.body.appendChild(modal);

    return modal;
}

describe('ModalManager', () => {
    let modal;
    let manager;

    beforeEach(() => {
        modal = createModalElement();
        manager = new ModalManager(modal);
    });

    afterEach(() => {
        manager.destroy();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        document.body.style.overflow = '';
    });

    // =========================================================
    // open()
    // =========================================================

    describe('open()', () => {
        test('removes hidden class and adds open class', () => {
            expect(modal.classList.contains('hidden')).toBe(true);
            expect(modal.classList.contains('open')).toBe(false);

            manager.open();

            expect(modal.classList.contains('hidden')).toBe(false);
            expect(modal.classList.contains('open')).toBe(true);
        });

        test('sets isOpen to true', () => {
            expect(manager.isOpen()).toBe(false);
            manager.open();
            expect(manager.isOpen()).toBe(true);
        });

        test('prevents body scroll', () => {
            manager.open();
            expect(document.body.style.overflow).toBe('hidden');
        });

        test('does not open again if already open', () => {
            manager.open();
            manager.open(); // second call should be no-op
            expect(manager.isOpen()).toBe(true);
        });

        test('calls onOpen callback', () => {
            const onOpen = jest.fn();
            manager.destroy();
            manager = new ModalManager(modal, { onOpen });
            manager.open();
            expect(onOpen).toHaveBeenCalledTimes(1);
        });

        test('dispatches modal:open custom event', () => {
            const handler = jest.fn();
            modal.addEventListener('modal:open', handler);
            manager.open();
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    // =========================================================
    // close()
    // =========================================================

    describe('close()', () => {
        beforeEach(() => {
            manager.open();
        });

        test('removes open class', () => {
            expect(modal.classList.contains('open')).toBe(true);
            manager.close();
            expect(modal.classList.contains('open')).toBe(false);
        });

        test('sets isOpen to false immediately', () => {
            manager.close();
            expect(manager.isOpen()).toBe(false);
        });

        test('restores body scroll when no modals remain open', () => {
            manager.close();
            expect(document.body.style.overflow).toBe('');
        });

        test('adds hidden class after transitionend event fires', () => {
            manager.close();

            // Immediately after close(): hidden should NOT yet be added —
            // the close animation is still in progress.
            // (This is the bug that existed before the fix.)
            expect(modal.classList.contains('hidden')).toBe(false);

            // Simulate the CSS transition completing
            const event = new Event('transitionend');
            Object.defineProperty(event, 'target', { value: modal, writable: false });
            modal.dispatchEvent(event);

            expect(modal.classList.contains('hidden')).toBe(true);
        });

        test('adds hidden class via 250ms timeout fallback when transitionend never fires', () => {
            jest.useFakeTimers();

            manager.close();
            expect(modal.classList.contains('hidden')).toBe(false);

            // Advance past the fallback timeout (250ms)
            jest.advanceTimersByTime(300);

            expect(modal.classList.contains('hidden')).toBe(true);

            jest.useRealTimers();
        });

        test('does not add hidden class if modal is reopened before timeout fires', () => {
            jest.useFakeTimers();

            manager.close();
            jest.advanceTimersByTime(100); // halfway through timeout

            // Re-open the modal before the timeout fires
            manager.open();

            jest.advanceTimersByTime(200); // past original timeout expiry

            // Modal was reopened, so hidden must NOT have been added
            expect(modal.classList.contains('hidden')).toBe(false);
            expect(modal.classList.contains('open')).toBe(true);

            jest.useRealTimers();
        });

        test('calls onClose callback', () => {
            const onClose = jest.fn();
            manager.destroy();
            manager = new ModalManager(modal, { onClose });
            manager.open();
            manager.close();
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        test('dispatches modal:close custom event', () => {
            const handler = jest.fn();
            modal.addEventListener('modal:close', handler);
            manager.close();
            expect(handler).toHaveBeenCalledTimes(1);
        });

        test('is a no-op when modal is already closed', () => {
            manager.close(); // close from open
            const onClose = jest.fn();
            manager.destroy();
            manager = new ModalManager(modal, { onClose });
            manager.close(); // call close on an already-closed modal
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    // =========================================================
    // Keyboard interaction
    // =========================================================

    describe('keyboard shortcuts', () => {
        test('Escape key closes an open modal', () => {
            manager.open();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(manager.isOpen()).toBe(false);
        });

        test('Escape key does nothing when modal is already closed', () => {
            expect(() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }).not.toThrow();
        });

        test('closeOnEscape: false prevents Escape from closing', () => {
            manager.destroy();
            manager = new ModalManager(modal, { closeOnEscape: false });
            manager.open();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            expect(manager.isOpen()).toBe(true);
        });
    });

    // =========================================================
    // Close triggers
    // =========================================================

    describe('close triggers', () => {
        test('clicking the × close button closes the modal', () => {
            manager.open();
            modal.querySelector('.modal-close').click();
            expect(manager.isOpen()).toBe(false);
        });

        test('clicking backdrop (data-close) closes the modal', () => {
            manager.open();
            modal.querySelector('.modal-backdrop').click();
            expect(manager.isOpen()).toBe(false);
        });

        test('closeOnBackdrop: false prevents backdrop from closing', () => {
            manager.destroy();
            manager = new ModalManager(modal, { closeOnBackdrop: false });
            manager.open();
            modal.querySelector('.modal-backdrop').click();
            expect(manager.isOpen()).toBe(true);
        });
    });

    // =========================================================
    // destroy()
    // =========================================================

    describe('destroy()', () => {
        test('closes modal if open', () => {
            manager.open();
            manager.destroy();
            expect(manager.isOpen()).toBe(false);
        });

        test('does not throw when destroying a closed modal', () => {
            expect(() => manager.destroy()).not.toThrow();
        });
    });
});
