/**
 * AI Assistant built-in plugin.
 *
 * Brings LLM assistance into the editor with multi-provider support:
 *   - OpenAI / Anthropic (cloud, API key required)
 *   - Ollama / LM Studio (local, no key)
 *   - Any OpenAI-compatible or Anthropic-compatible endpoint (custom base
 *     URL; Anthropic-compatible gateways like LiteLLM proxies work with or
 *     without a key)
 *
 * All provider traffic is proxied through the main process
 * (ai-assistant:complete / ai-assistant:status IPC) so API keys never enter
 * the renderer and the renderer CSP stays closed to AI endpoints.
 *
 * Extension points:
 *   - Sidebar "AI Chat" panel (session-scoped conversation, insert replies)
 *   - Commands: Summarize / Improve / Explain / Translate selection
 *   - EventBus `ai:analyze` handler — powers the writing-studio Proofread
 *     panel, which was built waiting for exactly this plugin
 *
 * @module ai-assistant
 */

const { PluginAPI } = require('../../../plugins/plugin-api');
const { renderChatPanel } = require('./chat-panel');
const { buildTaskPrompt, buildProofreadPrompt, parseProofreadIssues } = require('./prompts');

class AiAssistantPlugin extends PluginAPI {
  init(context) {
    this.context = context;

    // Cached provider status; refreshed from main whenever settings change
    this._statusInfo = { provider: '', model: '', configured: false };
    this._settingsModalOpen = false;

    this._refreshStatus();

    this._registerSidebar(context);
    this._registerCommands(context);
    this._registerAnalyzeHandler(context);
  }

  /** Fetch provider/model/configured from the main process (no key material). */
  async _refreshStatus() {
    try {
      const status = await this.context.ipc.invoke('ai-assistant:status', null);
      this._statusInfo = {
        provider: status.provider || '',
        model: status.model || '',
        configured: Boolean(status.configured),
      };
    } catch {
      this._statusInfo = { provider: '', model: '', configured: false };
    }
  }

  _registerSidebar(context) {
    // Panel body + rail icon: PluginContext namespaces the panel id to
    // "ai-assistant:chat"; SidebarManager creates the rail icon from the
    // inline SVG so the plugin needs no app-shell edits.
    context.sidebar.registerPanel('chat', {
      title: 'AI Chat',
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path>
        <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"></path>
      </svg>`,
      render: (container) =>
        renderChatPanel(container, {
          complete: (request) => this._complete(request),
          insertAtCursor: (text) => context.editor.insertAtCursor(text),
          getSelection: () => context.editor.getSelection() || '',
          statusInfo: this._statusInfo,
          onOpenSettings: () => this._openSettingsModal(),
        }),
    });
  }

  _registerCommands(context) {
    const runOnSelection = async (action, extra) => {
      const selection = context.editor.getSelection();
      const text = selection && selection.trim() ? selection : context.editor.getContent() || '';
      if (!text.trim()) return;
      try {
        const { system, user } = buildTaskPrompt(action, text, extra);
        const { content } = await this._complete({
          system,
          messages: [{ role: 'user', content: user }],
        });
        if (action === 'improve' && selection && selection.trim()) {
          // Improving an explicit selection replaces it at the cursor
          context.editor.insertAtCursor(content);
        } else {
          context.editor.insertAtCursor(`\n\n${content}`);
        }
      } catch (error) {
        console.warn('[ai-assistant] task failed:', error.message);
      }
    };

    context.commands.register('summarize-selection', 'AI: Summarize Selection', () =>
      runOnSelection('summarize')
    );
    context.commands.register('improve-selection', 'AI: Improve Writing', () =>
      runOnSelection('improve')
    );
    context.commands.register('explain-selection', 'AI: Explain Selection', () =>
      runOnSelection('explain')
    );
    context.commands.register('translate-selection', 'AI: Translate Selection', () => {
      // window.prompt() is not supported in Electron renderers — use a small
      // inline dialog instead. Cancelling leaves everything untouched.
      this._inputBox('Translate to which language?', 'e.g. French, Japanese').then((target) => {
        if (target) runOnSelection('translate', target);
      });
    });
    context.commands.register('open-chat', 'AI: Open Chat', () => {
      this._openSettingsModalRefresh();
      // Ask the host to expand our sidebar panel (wired via the event bus)
      this.context.events.emit('sidebar:open-panel', { panel: 'ai-assistant:chat' });
    });
  }

  /**
   * Minimal promise-based text input dialog (Electron has no window.prompt).
   * Resolves with the text, or null when cancelled.
   * @returns {Promise<string|null>}
   */
  _inputBox(label, placeholder) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ai-settings-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="ai-settings-dialog">
          <h3>${label}</h3>
          <input type="text" data-role="input" placeholder="${placeholder || ''}" />
          <div class="ai-settings-actions">
            <button data-role="ok" type="button" class="ws-btn ws-btn-primary">OK</button>
            <button data-role="cancel" type="button" class="ws-btn">Cancel</button>
          </div>
        </div>`;
      const input = overlay.querySelector('[data-role="input"]');
      const done = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay
        .querySelector('[data-role="ok"]')
        .addEventListener('click', () => done(input.value.trim() || null));
      overlay.querySelector('[data-role="cancel"]').addEventListener('click', () => done(null));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) done(null);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') done(input.value.trim() || null);
        if (event.key === 'Escape') done(null);
      });
      document.body.appendChild(overlay);
      input.focus();
    });
  }

  /**
   * Fulfill the writing-studio proofread contract: listen for `ai:analyze`
   * events ({text, type, callback}) and answer with {issues: [...]} parsed
   * from the model's JSON reply.
   */
  _registerAnalyzeHandler(context) {
    context.events.on('ai:analyze', async (payload) => {
      if (!payload || typeof payload.callback !== 'function') return;
      if (!this._statusInfo.configured) {
        payload.callback({
          issues: [
            {
              type: 'setup',
              message: 'AI Assistant is not configured. Set a provider via AI: Open Chat → Setup.',
              suggestion: '',
            },
          ],
        });
        return;
      }
      try {
        const { system, user } = buildProofreadPrompt(String(payload.text || ''));
        const { content } = await this._complete({
          system,
          messages: [{ role: 'user', content: user }],
        });
        payload.callback({ issues: parseProofreadIssues(content) });
      } catch (error) {
        payload.callback({ issues: [{ type: 'error', message: error.message, suggestion: '' }] });
      }
    });
  }

  /**
   * Shared completion helper: main process owns provider settings, so the
   * plugin only sends the prompt payload.
   */
  async _complete(request) {
    await this._refreshStatus();
    if (!this._statusInfo.configured) {
      throw new Error('AI Assistant is not configured (see AI Chat → Setup)');
    }
    return this.context.ipc.invoke('ai-assistant:complete', request);
  }

  /**
   * Tiny settings modal rendered by the plugin itself (plugin settings have
   * no host-provided UI yet). Persists through the plugin settings store,
   * which lands in settings.json main-side.
   */
  _openSettingsModalRefresh() {
    this._refreshStatus();
  }

  _openSettingsModal() {
    if (this._settingsModalOpen) return;
    this._settingsModalOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'ai-settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="ai-settings-dialog">
        <h3>AI Assistant Settings</h3>
        <label>Provider
          <select data-role="provider">
            <option value="ollama">Ollama (local)</option>
            <option value="lmstudio">LM Studio (local)</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai-compatible">OpenAI-compatible…</option>
            <option value="anthropic-compatible">Anthropic-compatible…</option>
          </select>
        </label>
        <label>Model <input data-role="model" type="text" placeholder="e.g. llama3.1, gpt-4o-mini" /></label>
        <label>Base URL
          <input
            data-role="baseUrl"
            type="text"
            placeholder="Required for …-compatible providers, e.g. http://localhost:4000"
          />
        </label>
        <label>API Key <input data-role="apiKey" type="password" placeholder="(not needed for local providers)" /></label>
        <label>Temperature <input data-role="temperature" type="number" min="0" max="2" step="0.1" /></label>
        <p class="ai-settings-note">Settings are stored locally in settings.json. API keys never leave this machine.</p>
        <div class="ai-settings-actions">
          <button data-role="save" type="button">Save</button>
          <button data-role="cancel" type="button">Cancel</button>
        </div>
      </div>`;

    const close = () => {
      overlay.remove();
      this._settingsModalOpen = false;
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    const $ = (role) => overlay.querySelector(`[data-role="${role}"]`);

    // Pre-fill from current settings
    Promise.all([
      this.context.settings.get('provider'),
      this.context.settings.get('model'),
      this.context.settings.get('baseUrl'),
      this.context.settings.get('apiKey'),
      this.context.settings.get('temperature'),
    ]).then(([provider, model, baseUrl, apiKey, temperature]) => {
      if (provider) $('provider').value = provider;
      if (model) $('model').value = model;
      if (baseUrl) $('baseUrl').value = baseUrl;
      if (apiKey) $('apiKey').value = apiKey;
      if (temperature !== undefined && temperature !== null) {
        $('temperature').value = temperature;
      }
    });

    $('cancel').addEventListener('click', close);
    $('save').addEventListener('click', async () => {
      await this.context.settings.set('provider', $('provider').value);
      await this.context.settings.set('model', $('model').value.trim());
      await this.context.settings.set('baseUrl', $('baseUrl').value.trim());
      await this.context.settings.set('apiKey', $('apiKey').value.trim());
      await this.context.settings.set('temperature', parseFloat($('temperature').value) || 0.7);
      await this._refreshStatus();
      close();
    });

    document.body.appendChild(overlay);
  }

  deactivate() {
    /* no long-lived timers to clean up */
  }
}

module.exports = { Plugin: AiAssistantPlugin };
