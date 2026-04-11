import { html } from 'hono/html'

export const ChatPage = (data: {
  bot: any;
  availableModels: string[];
}) => {
  const { bot, availableModels } = data;
  return html`
    <div class="header">
      <a href="/" class="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </a>
      <h1>
        <span class="bot-name">${bot.name}</span>
        <form action="/ai-bots/${bot.id}/update-model" method="POST" style="display:inline-flex; align-items:center; margin-left:0.5rem; gap:0.25rem;">
          <input type="text" name="modelName" list="available-models" value="${bot.modelName}" style="font-size: 0.875rem; color: var(--text-secondary); background: #e5e7eb; padding: 0.125rem 0.5rem; border-radius: 9999px; border: none; outline: none; max-width: 150px; text-overflow: ellipsis;">
          <datalist id="available-models">
            ${availableModels.map((m: string) => html`<option value="${m}"></option>`)}
          </datalist>
          <button type="submit" style="font-size: 0.75rem; background: var(--button-bg); color: white; border: none; border-radius: 9999px; padding: 0.125rem 0.5rem; cursor: pointer;">Update</button>
        </form>
      </h1>
      <div style="width: 60px; flex-shrink: 0;"></div>
    </div>

    <div id="chat-container">
      <!-- Loading indicator is appended and removed as needed -->
    </div>

    <div class="input-area">
      <form id="chat-form">
        <input type="text" id="chat-input" required autocomplete="off" placeholder="Message ${bot.name}..." />
        <button type="submit" id="send-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </form>
    </div>

    <style>
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.5rem;
        padding-top: calc(1rem + env(safe-area-inset-top));
        background-color: var(--chat-bg);
        border-bottom: 1px solid var(--border-color);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        z-index: 10;
      }
      .header h1 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        min-width: 0;
        justify-content: center;
        flex: 1;
      }
      .header .bot-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .back-link {
        text-decoration: none;
        color: var(--text-secondary);
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        transition: color 0.2s;
        width: 60px;
        flex-shrink: 0;
      }
      .back-link:hover { color: var(--text-primary); }
      #chat-container {
        flex: 1;
        padding: 1.5rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        scroll-behavior: smooth;
      }
      .msg-wrapper {
        display: flex;
        flex-direction: column;
        max-width: 80%;
        animation: fadeIn 0.3s ease-in-out;
      }
      .msg-wrapper.user { align-self: flex-end; }
      .msg-wrapper.model { align-self: flex-start; }
      .msg {
        padding: 0.875rem 1.25rem;
        border-radius: 1.25rem;
        font-size: 0.95rem;
        line-height: 1.5;
        position: relative;
        word-wrap: break-word;
      }
      .msg.user {
        background-color: var(--user-msg-bg);
        color: var(--user-msg-text);
        border-bottom-right-radius: 0.25rem;
      }
      .msg.model {
        background-color: var(--bot-msg-bg);
        color: var(--bot-msg-text);
        border-bottom-left-radius: 0.25rem;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .thought-container {
        margin-bottom: 0.5rem;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      .thought-toggle {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.25rem;
        padding: 0.25rem 0.5rem;
        background-color: var(--bot-msg-bg);
        border-radius: 0.5rem;
        transition: background-color 0.2s;
        user-select: none;
      }
      .thought-toggle:hover { background-color: #e5e7eb; }
      .thought {
        font-size: 0.875rem;
        color: var(--thought-text);
        background-color: var(--thought-bg);
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        border-left: 3px solid #d97706;
        display: none;
        line-height: 1.5;
        max-width: 100%;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }
      .thought.show {
        display: block;
        animation: slideDown 0.2s ease-out;
      }
      .input-area {
        padding: 1.25rem;
        padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
        background-color: var(--chat-bg);
        border-top: 1px solid var(--border-color);
      }
      #chat-form {
        display: flex;
        gap: 0.75rem;
        max-width: 48rem;
        margin: 0 auto;
        position: relative;
      }
      input[type="text"] {
        flex: 1;
        padding: 0.875rem 1.25rem;
        border: 1px solid var(--border-color);
        border-radius: 1.5rem;
        font-size: 1rem;
        background-color: var(--input-bg);
        color: var(--text-primary);
        transition: border-color 0.2s, box-shadow 0.2s;
        outline: none;
      }
      input[type="text"]:focus {
        border-color: var(--focus-ring);
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
      }
      input[type="text"]:disabled {
        background-color: #f3f4f6;
        color: #9ca3af;
        cursor: not-allowed;
      }
      button {
        padding: 0 1.5rem;
        background-color: var(--button-bg);
        color: white;
        border: none;
        border-radius: 1.5rem;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      button:hover:not(:disabled) { background-color: var(--button-hover); }
      button:active:not(:disabled) { transform: scale(0.98); }
      button:disabled {
        background-color: #9ca3af;
        cursor: not-allowed;
      }
      .loading-dots {
        display: none;
        align-items: center;
        gap: 4px;
        padding: 0.875rem 1.25rem;
        background-color: var(--bot-msg-bg);
        border-radius: 1.25rem;
        border-bottom-left-radius: 0.25rem;
        align-self: flex-start;
        margin-top: -0.5rem;
      }
      .loading-dots.active { display: flex; }
      .dot {
        width: 6px;
        height: 6px;
        background-color: var(--text-secondary);
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out both;
      }
      .dot:nth-child(1) { animation-delay: -0.32s; }
      .dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .msg.model p { margin-bottom: 0.5rem; }
      .msg.model p:last-child { margin-bottom: 0; }
      .msg.model code { background: #e5e7eb; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.9em; }
      .msg.model pre { background: #1f2937; color: #f8f8f2; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-top: 0.5rem; margin-bottom: 0.5rem; font-family: monospace; font-size: 0.85em; }
    </style>
    <script>
      const history = [];
      const form = document.getElementById('chat-form');
      const input = document.getElementById('chat-input');
      const container = document.getElementById('chat-container');
      const sendBtn = document.getElementById('send-btn');

      let loadingIndicator;

      function createLoadingIndicator() {
        const div = document.createElement('div');
        div.className = 'loading-dots msg-wrapper model';
        div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        return div;
      }

      function showLoading() {
        if (!loadingIndicator) loadingIndicator = createLoadingIndicator();
        container.appendChild(loadingIndicator);
        loadingIndicator.classList.add('active');
        container.scrollTop = container.scrollHeight;
      }

      function hideLoading() {
        if (loadingIndicator && loadingIndicator.parentNode === container) {
          container.removeChild(loadingIndicator);
        }
      }

      function formatText(text) {
         let formatted = text
            .replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
            .replace(/\\*(.*?)\\*/g, '<em>$1</em>')
            .replace(/\\n/g, '<br/>');

         formatted = formatted.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
         formatted = formatted.replace(/\`(.*?)\`/g, '<code>$1</code>');

         return formatted;
      }

      function appendMessage(role, text, thoughts) {
        hideLoading();
        const wrapper = document.createElement('div');
        wrapper.className = 'msg-wrapper ' + role;

        if (thoughts) {
          const thoughtContainer = document.createElement('div');
          thoughtContainer.className = 'thought-container';

          const toggle = document.createElement('div');
          toggle.className = 'thought-toggle';
          toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-9 4 18 2-9h4"/></svg> Thoughts';

          const thoughtDiv = document.createElement('div');
          thoughtDiv.className = 'thought';
          thoughtDiv.innerHTML = thoughts.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br/>');

          toggle.onclick = () => {
            thoughtDiv.classList.toggle('show');
          };

          thoughtContainer.appendChild(toggle);
          thoughtContainer.appendChild(thoughtDiv);
          wrapper.appendChild(thoughtContainer);
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg ' + role;

        if (role === 'model') {
          msgDiv.innerHTML = formatText(text);
        } else {
          msgDiv.innerText = text;
        }

        wrapper.appendChild(msgDiv);

        container.appendChild(wrapper);
        container.scrollTop = container.scrollHeight;
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        appendMessage('user', text);
        history.push({ role: 'user', text });

        showLoading();

        try {
          const res = await fetch('/ai-bots/${bot.id}/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history })
          });

          if (!res.ok) {
            hideLoading();
            appendMessage('model', 'Error: ' + res.statusText);
            history.pop();
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
            return;
          }

          hideLoading();

          const wrapper = document.createElement('div');
          wrapper.className = 'msg-wrapper model';

          const thoughtContainer = document.createElement('div');
          thoughtContainer.className = 'thought-container';
          thoughtContainer.style.display = 'none';

          const toggle = document.createElement('div');
          toggle.className = 'thought-toggle';
          toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-9 4 18 2-9h4"/></svg> Thoughts';

          const thoughtDiv = document.createElement('div');
          thoughtDiv.className = 'thought';

          toggle.onclick = () => {
            thoughtDiv.classList.toggle('show');
          };

          thoughtContainer.appendChild(toggle);
          thoughtContainer.appendChild(thoughtDiv);
          wrapper.appendChild(thoughtContainer);

          const msgDiv = document.createElement('div');
          msgDiv.className = 'msg model';
          wrapper.appendChild(msgDiv);

          container.appendChild(wrapper);

          let finalAnswer = '';
          let finalThoughts = '';

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.thoughts) {
                    finalThoughts += data.thoughts;
                    thoughtContainer.style.display = 'block';
                    thoughtDiv.innerHTML = finalThoughts.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\n/g, '<br/>');
                  }
                  if (data.answer) {
                    finalAnswer += data.answer;
                    msgDiv.innerHTML = formatText(finalAnswer);
                  }
                  container.scrollTop = container.scrollHeight;
                } catch (e) {
                  console.error('Error parsing SSE data', e);
                }
              }
            }
          }

          history.push({ role: 'model', text: finalAnswer });

        } catch (err) {
          hideLoading();
          appendMessage('model', 'Network error.');
          history.pop();
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      });
    </script>
  `;
};
