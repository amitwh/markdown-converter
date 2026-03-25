/**
 * ModalManager - Unified modal system with accessibility support
 * @version 4.0.0
 */
class ModalManager {
    #modal;
    #backdrop;
    #options;
    #lastFocusedElement;
    #focusableElements;
    #eventListeners;
    #isOpen;

    static #openModals = [];

    constructor(element, options = {}) {
        this.#modal = typeof element === 'string' ? document.querySelector(element) : element;
        this.#options = {
            closeOnBackdrop: true,
            closeOnEscape: true,
            focusFirst: true,
            onOpen: null,
            onClose: null,
            ...options
        };
        this.#isOpen = false;
        this.#eventListeners = [];
        this.#init();
    }

    #init() {
        // Ensure modal has required attributes
        if (!this.#modal.hasAttribute('role')) {
            this.#modal.setAttribute('role', 'dialog');
        }
        if (!this.#modal.hasAttribute('aria-modal')) {
            this.#modal.setAttribute('aria-modal', 'true');
        }

        // Find or create backdrop
        this.#backdrop = this.#modal.querySelector('.modal-backdrop');

        // Setup close triggers
        this.#setupCloseTriggers();
    }

    #setupCloseTriggers() {
        // Close button
        const closeBtn = this.#modal.querySelector('.modal-close');
        if (closeBtn) {
            const handler = (e) => {
                e.preventDefault();
                this.close();
            };
            closeBtn.addEventListener('click', handler);
            this.#eventListeners.push({ el: closeBtn, type: 'click', handler });
        }

        // Elements with data-close attribute
        const closeTriggers = this.#modal.querySelectorAll('[data-close]');
        closeTriggers.forEach(el => {
            if (el.classList.contains('modal-backdrop') && !this.#options.closeOnBackdrop) {
                return;
            }
            const handler = (e) => {
                e.preventDefault();
                this.close();
            };
            el.addEventListener('click', handler);
            this.#eventListeners.push({ el, type: 'click', handler });
        });
    }

    #getFocusableElements() {
        const selector = [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        return Array.from(this.#modal.querySelectorAll(selector))
            .filter(el => el.offsetParent !== null && !el.classList.contains('modal-backdrop'));
    }

    #trapFocus(e) {
        if (e.key !== 'Tab') return;

        const focusable = this.#getFocusableElements();
        if (focusable.length === 0) return;

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    }

    #handleKeydown(e) {
        if (e.key === 'Escape' && this.#options.closeOnEscape) {
            e.preventDefault();
            this.close();
        }
        this.#trapFocus(e);
    }

    open() {
        if (this.#isOpen) return;

        // Store last focused element
        this.#lastFocusedElement = document.activeElement;

        // Track open modals
        ModalManager.#openModals.push(this);

        // Show modal: remove hidden first, force a reflow so the browser
        // records opacity:0 as the start state, then add 'open' to trigger
        // the CSS transition. Without the reflow, both class changes are
        // batched into one style recalculation and the transition is skipped.
        this.#modal.classList.remove('hidden');
        void this.#modal.offsetHeight; // Force reflow — do not remove
        this.#modal.classList.add('open');
        this.#isOpen = true;

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Add keyboard listener
        const keydownHandler = (e) => this.#handleKeydown(e);
        document.addEventListener('keydown', keydownHandler);
        this.#eventListeners.push({ el: document, type: 'keydown', handler: keydownHandler });

        // Focus first element
        if (this.#options.focusFirst) {
            requestAnimationFrame(() => {
                const focusable = this.#getFocusableElements();
                if (focusable.length > 0) {
                    focusable[0].focus();
                }
            });
        }

        // Callback
        if (this.#options.onOpen) {
            this.#options.onOpen(this);
        }

        // Dispatch custom event
        this.#modal.dispatchEvent(new CustomEvent('modal:open'));
    }

    close() {
        if (!this.#isOpen) return;

        // Remove from open modals
        const index = ModalManager.#openModals.indexOf(this);
        if (index > -1) {
            ModalManager.#openModals.splice(index, 1);
        }

        // Start hide transition
        this.#modal.classList.remove('open');
        this.#isOpen = false;

        // Re-add 'hidden' after the CSS transition completes so the modal
        // is fully removed from rendering (display:none), not just invisible.
        // We use both transitionend and a setTimeout fallback because
        // transitionend never fires when prefers-reduced-motion disables transitions.
        let hidden = false;
        const addHidden = () => {
            if (hidden || this.#isOpen) return;
            hidden = true;
            this.#modal.removeEventListener('transitionend', onTransitionEnd);
            this.#modal.classList.add('hidden');
        };
        const onTransitionEnd = (e) => {
            if (e.target !== this.#modal) return;
            addHidden();
        };
        this.#modal.addEventListener('transitionend', onTransitionEnd);
        setTimeout(addHidden, 250); // fallback: slightly longer than 200ms transition

        // Restore body scroll if no modals open
        if (ModalManager.#openModals.length === 0) {
            document.body.style.overflow = '';
        }

        // Remove keyboard listener
        const keydownListener = this.#eventListeners.find(
            l => l.el === document && l.type === 'keydown'
        );
        if (keydownListener) {
            document.removeEventListener('keydown', keydownListener.handler);
            this.#eventListeners = this.#eventListeners.filter(l => l !== keydownListener);
        }

        // Restore focus
        if (this.#lastFocusedElement && typeof this.#lastFocusedElement.focus === 'function') {
            this.#lastFocusedElement.focus();
        }

        // Callback
        if (this.#options.onClose) {
            this.#options.onClose(this);
        }

        // Dispatch custom event
        this.#modal.dispatchEvent(new CustomEvent('modal:close'));
    }

    isOpen() {
        return this.#isOpen;
    }

    destroy() {
        // Close if open
        if (this.#isOpen) {
            this.close();
        }

        // Remove all event listeners
        this.#eventListeners.forEach(({ el, type, handler }) => {
            el.removeEventListener(type, handler);
        });
        this.#eventListeners = [];
    }
}

// Export for use in renderer
if (typeof window !== 'undefined') {
    window.ModalManager = ModalManager;
}

// CommonJS export
module.exports = { ModalManager };
