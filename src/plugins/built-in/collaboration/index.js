/**
 * Collaboration built-in plugin — anchor-based inline comments.
 *
 * Implements the comment half of the v5 collaboration design:
 *   - Comments sidebar panel (add / list / jump / resolve / delete)
 *   - F8 navigates to the next open comment (document-level key handler)
 *   - Ctrl+Alt+M adds a comment at the cursor line
 *
 * Comments persist to `<folder>/.comments/<file>.json` via the app's IPC file
 * helpers; nothing is written into the document itself, so exports and Git
 * commits of the prose stay clean.
 *
 * @module collaboration
 */

const { PluginAPI } = require('../../../plugins/plugin-api');
const { renderCommentsPanel } = require('./comments-panel');
const store = require('./comment-store');

class CollaborationPlugin extends PluginAPI {
  init(context) {
    this.context = context;

    // IO adapters over the allowlisted IPC file helpers; comments-panel
    // and comment-store stay renderer-agnostic.
    this._io = {
      readFile: (p) => context.ipc.invoke('read-file', p),
      writeFile: (p, c) => context.ipc.invoke('write-file', { path: p, content: c }),
      fileExists: (p) => context.ipc.invoke('path-exists', p),
      ensureDirectory: (p) => context.ipc.invoke('ensure-directory', p),
    };

    this._registerSidebar(context);
    this._registerCommands(context);
    this._installF8Navigation();
  }

  _registerSidebar(context) {
    context.sidebar.registerPanel('comments', {
      title: 'Comments',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>`,
      render: (container) => renderCommentsPanel(container, this._panelDeps()),
    });
  }

  _panelDeps() {
    return {
      editor: this.context.editor,
      io: this._io,
      pathUtil: require('path'),
      author: 'me',
    };
  }

  _registerCommands(context) {
    context.commands.register(
      'add-comment',
      'Comment: Add Comment at Cursor',
      () => {
        // Opens the Comments panel focused on the composer at the cursor line
        this._openPanel();
      },
      'Ctrl+Alt+M'
    );
    context.commands.register('next-comment', 'Comment: Next Open Comment', () => {
      this._jumpToNextComment();
    });
  }

  /**
   * Document-level F8 handler (uninstalled on deactivate). Inside textareas
   * and inputs F8 must keep its default behavior.
   */
  _installF8Navigation() {
    this._f8Handler = (event) => {
      if (event.key !== 'F8') return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      this._jumpToNextComment();
    };
    document.addEventListener('keydown', this._f8Handler);
  }

  async _jumpToNextComment() {
    const docPath = this.context.editor.getCurrentFilePath();
    if (!docPath) return;
    const comments = await store.loadComments(docPath, this._io, require('path'));
    const fromLine = this.context.editor.getCurrentLine();
    const next = store.nextUnresolved(comments, fromLine);
    if (next) this.context.editor.jumpToLine(next.line);
  }

  _openPanel() {
    this.context.events.emit('sidebar:open-panel', { panel: 'collaboration:comments' });
  }

  deactivate() {
    if (this._f8Handler) {
      document.removeEventListener('keydown', this._f8Handler);
      this._f8Handler = null;
    }
  }
}

module.exports = { Plugin: CollaborationPlugin };
