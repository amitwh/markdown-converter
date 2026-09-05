/**
 * AI Assistant chat sidebar panel.
 *
 * Renders a compact chat interface (message list, composer, status badge) and
 * wires it to the plugin's IPC-backed completion helper. All network work
 * happens in the main process; this file only manages conversation state
 * (history is kept in memory for the session, not persisted).
 *
 * @module AiChatPanel
 */

/** Simple HTML escape for all user/model text before insertion. */
function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the chat panel into its sidebar container.
 *
 * @param {HTMLElement} container Sidebar panel content element
 * @param {object} deps
 * @param {Function} deps.complete async ({system, messages}) => {content}
 * @param {Function} deps.insertAtCursor (text) => void — insert reply in doc
 * @param {Function} deps.getSelection () => string — for "use selection"
 * @param {{provider:string, model:string, configured:boolean}} deps.statusInfo
 * @param {Function} deps.onOpenSettings () => void — jump to provider config
 */
function renderChatPanel(container, deps) {
  container.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'ws-panel ai-chat-panel';
  panel.innerHTML = `
    <div class="ws-section">
      <div class="ai-chat-status">
        <span class="ai-chat-badge" data-role="badge"></span>
        <button class="ws-btn ws-btn-sm" data-role="settings" type="button">Setup…</button>
      </div>
      <div class="ai-chat-messages" data-role="messages" aria-live="polite"></div>
      <div class="ai-chat-composer">
        <textarea data-role="input" rows="3" placeholder="Ask about your document…
(Shift+Enter for newline)"></textarea>
        <div class="ai-chat-actions">
          <button class="ws-btn" data-role="use-selection" type="button"
            title="Insert the current editor selection into the composer">Use selection</button>
          <button class="ws-btn ws-btn-primary" data-role="send" type="button">Send</button>
        </div>
        <div class="ai-chat-footer">
          <button class="ws-btn ws-btn-sm" data-role="insert-last" type="button"
            title="Insert the last assistant reply at the cursor">Insert last reply</button>
          <button class="ws-btn ws-btn-sm" data-role="clear" type="button">Clear chat</button>
        </div>
      </div>
    </div>`;
  container.appendChild(panel);

  // --- Element handles -----------------------------------------------------
  const badge = panel.querySelector('[data-role="badge"]');
  const messagesEl = panel.querySelector('[data-role="messages"]');
  const inputEl = panel.querySelector('[data-role="input"]');
  const sendBtn = panel.querySelector('[data-role="send"]');
  const insertLastBtn = panel.querySelector('[data-role="insert-last"]');
  const useSelectionBtn = panel.querySelector('[data-role="use-selection"]');
  const clearBtn = panel.querySelector('[data-role="clear"]');
  const settingsBtn = panel.querySelector('[data-role="settings"]');

  // --- Conversation state (session-scoped) ---------------------------------
  const history = []; // {role: 'user'|'assistant', content}
  let lastAssistantReply = '';
  let busy = false;

  function renderBadge() {
    const { provider, model, configured } = deps.statusInfo;
    badge.textContent = configured ? `${provider} · ${model}` : 'Not configured';
    badge.classList.toggle('ai-chat-badge-ok', Boolean(configured));
    badge.classList.toggle('ai-chat-badge-off', !configured);
    sendBtn.disabled = !configured || busy;
  }

  function appendMessage(role, text) {
    const item = document.createElement('div');
    item.className = `ai-chat-msg ai-chat-msg-${role}`;
    item.innerHTML = `<div class="ai-chat-msg-role">${role === 'user' ? 'You' : 'AI'}</div>
<div class="ai-chat-msg-body">${esc(text)}</div>`;
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendBusy() {
    const item = document.createElement('div');
    item.className = 'ai-chat-msg ai-chat-msg-assistant ai-chat-msg-busy';
    item.dataset.role = 'busy';
    item.textContent = 'Thinking…';
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return item;
  }

  async function send() {
    const text = inputEl.value.trim();
    if (!text || busy || !deps.statusInfo.configured) return;

    busy = true;
    renderBadge();
    inputEl.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });
    const busyEl = appendBusy();

    try {
      // Keep a rolling window of the last 12 turns so long chats don't grow
      // request payloads unboundedly.
      const window = history.slice(-12);
      const { content } = await deps.complete({ messages: window });
      lastAssistantReply = content;
      history.push({ role: 'assistant', content });
      appendMessage('assistant', content);
    } catch (error) {
      appendMessage('assistant', `Error: ${error.message || 'request failed'}`);
    } finally {
      busyEl.remove();
      busy = false;
      renderBadge();
      inputEl.focus();
    }
  }

  // --- Wire events ----------------------------------------------------------
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  useSelectionBtn.addEventListener('click', () => {
    const sel = deps.getSelection();
    if (sel) inputEl.value += (inputEl.value ? '\n\n' : '') + sel;
    inputEl.focus();
  });
  insertLastBtn.addEventListener('click', () => {
    if (lastAssistantReply) deps.insertAtCursor(lastAssistantReply);
  });
  clearBtn.addEventListener('click', () => {
    history.length = 0;
    lastAssistantReply = '';
    messagesEl.replaceChildren();
  });
  settingsBtn.addEventListener('click', () => deps.onOpenSettings());

  renderBadge();
  if (!deps.statusInfo.configured) {
    appendMessage(
      'assistant',
      'Set up a provider first (OpenAI, Anthropic, or a local Ollama/LM Studio server) via the Setup button.'
    );
  }
}

module.exports = { renderChatPanel };
