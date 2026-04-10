import { Hono } from 'hono'
import { html } from 'hono/html'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleAuth } from '@hono/oauth-providers/google'
import { users, sessions, apiTokens, aiBots } from './db/schema'
import { GoogleGenAI } from '@google/genai'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  COOKIE_SECRET: string
  GOOGLE_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/auth/google', (c, next) => {
  return googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ['openid', 'email', 'profile'],
  })(c, next)
})

app.get('/auth/google', async (c) => {
  const user = c.get('user-google')
  if (!user) {
    return c.redirect('/')
  }

  const db = drizzle(c.env.DB)

  let dbUser = await db.select().from(users).where(eq(users.googleId, user.id!)).get()

  if (!dbUser) {
    const result = await db.insert(users).values({
      googleId: user.id!,
      email: user.email!,
      name: user.name!,
      picture: user.picture || null,
    }).returning().get()
    dbUser = result
  }

  const sessionId = crypto.randomUUID()
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days

  await db.insert(sessions).values({
    id: sessionId,
    userId: dbUser.id,
    expiresAt,
  })

  const token = await sign({ id: sessionId, exp: expiresAt }, c.env.COOKIE_SECRET)
  setCookie(c, 'session', token)

  return c.redirect('/')
})

app.get('/logout', async (c) => {
  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    try {
      const payload = await verify(sessionId, c.env.COOKIE_SECRET, 'HS256')
      const id = payload.id as string
      const db = drizzle(c.env.DB)
      await db.delete(sessions).where(eq(sessions.id, id))
    } catch (e) {
      // ignore
    }
  }
  deleteCookie(c, 'session')
  return c.redirect('/')
})

app.post('/sessions/:id/delete', async (c) => {
  const id = c.req.param('id')
  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    try {
      const payload = await verify(sessionId, c.env.COOKIE_SECRET, 'HS256')
      const currentSessionId = payload.id as string
      const db = drizzle(c.env.DB)

      const currentSession = await db.select().from(sessions).where(eq(sessions.id, currentSessionId)).get()
      if (currentSession && currentSession.expiresAt > Math.floor(Date.now() / 1000)) {
        await db.delete(sessions).where(eq(sessions.id, id))
      }
    } catch (e) {
      // ignore
    }
  }
  return c.redirect('/')
})

app.post('/api-tokens', async (c) => {
  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const db = drizzle(c.env.DB)

      const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (currentSession && currentSession.expiresAt > Math.floor(Date.now() / 1000)) {
        const body = await c.req.parseBody()
        const description = (body['description'] as string) || ''
        const tokenValue = crypto.randomUUID()

        await db.insert(apiTokens).values({
          userId: currentSession.userId,
          token: tokenValue,
          description,
          createdAt: Math.floor(Date.now() / 1000),
        })
      }
    } catch (e) {
      // ignore
    }
  }
  return c.redirect('/')
})

app.post('/api-tokens/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const db = drizzle(c.env.DB)

      const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (currentSession && currentSession.expiresAt > Math.floor(Date.now() / 1000)) {
        const tokenToDelete = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).get()
        if (tokenToDelete && tokenToDelete.userId === currentSession.userId) {
          await db.delete(apiTokens).where(eq(apiTokens.id, id))
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return c.redirect('/')
})

app.post('/ai-bots', async (c) => {
  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const db = drizzle(c.env.DB)

      const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (currentSession && currentSession.expiresAt > Math.floor(Date.now() / 1000)) {
        const body = await c.req.parseBody()
        const name = (body['name'] as string) || 'Unnamed Bot'
        const modelName = (body['modelName'] as string) || 'gemini-3-flash-preview'
        const systemPrompt = (body['systemPrompt'] as string) || ''

        await db.insert(aiBots).values({
          userId: currentSession.userId,
          name,
          modelName,
          systemPrompt,
          createdAt: Math.floor(Date.now() / 1000),
        })
      }
    } catch (e) {
      // ignore
    }
  }
  return c.redirect('/')
})

app.post('/ai-bots/:id/delete', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const db = drizzle(c.env.DB)

      const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (currentSession && currentSession.expiresAt > Math.floor(Date.now() / 1000)) {
        const botToDelete = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
        if (botToDelete && botToDelete.userId === currentSession.userId) {
          await db.delete(aiBots).where(eq(aiBots.id, id))
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return c.redirect('/')
})

app.post('/ai-bots/:id/chat', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const sessionCookie = getCookie(c, 'session')
  if (!sessionCookie) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
    const sessionId = payload.id as string
    const db = drizzle(c.env.DB)

    const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!currentSession || currentSession.expiresAt <= Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (!bot || bot.userId !== currentSession.userId) {
      return c.json({ error: 'Not found or not authorized' }, 404)
    }

    const body = await c.req.json()
    const history = body.history || []

    // We construct the contents payload for Gemini API
    const contents: any[] = []

    // Add system prompt if it exists
    if (bot.systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `System Prompt: ${bot.systemPrompt}` }] })
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
    }

    for (const msg of history) {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] })
    }

    const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_API_KEY })

    // Create the chat response
    const response = await ai.models.generateContent({
      model: bot.modelName,
      contents,
      config: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
    })

    let thoughts = ""
    let answer = ""

    if (response.candidates && response.candidates.length > 0) {
      const content = response.candidates[0].content;
      if (content && content.parts) {
        for (const part of content.parts) {
          if (!part.text) {
            continue
          } else if ((part as any).thought) {
            thoughts += part.text
          } else {
            answer += part.text
          }
        }
      }
    }

    return c.json({ answer, thoughts })
  } catch (e: any) {
    console.error(e)
    return c.json({ error: 'Internal server error', details: e.message }, 500)
  }
})

app.get('/ai-bots/:id/chat', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  const sessionCookie = getCookie(c, 'session')
  if (!sessionCookie) return c.redirect('/')

  try {
    const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
    const sessionId = payload.id as string
    const db = drizzle(c.env.DB)

    const currentSession = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!currentSession || currentSession.expiresAt <= Math.floor(Date.now() / 1000)) {
      return c.redirect('/')
    }

    const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (!bot || bot.userId !== currentSession.userId) {
      return c.redirect('/')
    }

    return c.html(html`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat with ${bot.name}</title>
        <style>
          :root {
            --bg-color: #f9fafb;
            --chat-bg: #ffffff;
            --text-primary: #111827;
            --text-secondary: #4b5563;
            --user-msg-bg: #2563eb;
            --user-msg-text: #ffffff;
            --bot-msg-bg: #f3f4f6;
            --bot-msg-text: #1f2937;
            --thought-bg: #fef3c7;
            --thought-text: #92400e;
            --border-color: #e5e7eb;
            --input-bg: #ffffff;
            --focus-ring: #60a5fa;
            --button-bg: #2563eb;
            --button-hover: #1d4ed8;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
          }

          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.5rem;
            background-color: var(--chat-bg);
            border-bottom: 1px solid var(--border-color);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            z-index: 10;
          }

          .header h1 {
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--text-primary);
          }

          .header .model-name {
            font-size: 0.875rem;
            color: var(--text-secondary);
            font-weight: 400;
            margin-left: 0.5rem;
            background: #e5e7eb;
            padding: 0.125rem 0.5rem;
            border-radius: 9999px;
          }

          .back-link {
            text-decoration: none;
            color: var(--text-secondary);
            font-size: 0.875rem;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: var(--text-primary);
          }

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

          .msg-wrapper.user {
            align-self: flex-end;
          }

          .msg-wrapper.model {
            align-self: flex-start;
          }

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

          .thought-toggle:hover {
            background-color: #e5e7eb;
          }

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
            padding-right: 3.5rem; /* space for button if inside, but we use flex */
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

          button:hover:not(:disabled) {
            background-color: var(--button-hover);
          }

          button:active:not(:disabled) {
            transform: scale(0.98);
          }

          button:disabled {
            background-color: #9ca3af;
            cursor: not-allowed;
          }

          /* Loading Indicator */
          .loading-dots {
            display: none;
            align-items: center;
            gap: 4px;
            padding: 0.875rem 1.25rem;
            background-color: var(--bot-msg-bg);
            border-radius: 1.25rem;
            border-bottom-left-radius: 0.25rem;
            align-self: flex-start;
            margin-top: -0.5rem; /* pull up slightly */
          }

          .loading-dots.active {
            display: flex;
          }

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

          /* Markdown-like simple styling for messages */
          .msg.model p { margin-bottom: 0.5rem; }
          .msg.model p:last-child { margin-bottom: 0; }
          .msg.model code { background: #e5e7eb; padding: 0.1rem 0.3rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.9em; }
          .msg.model pre { background: #1f2937; color: #f8f8f2; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-top: 0.5rem; margin-bottom: 0.5rem; font-family: monospace; font-size: 0.85em; }
        </style>
      </head>
      <body>
        <div class="header">
          <a href="/" class="back-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back
          </a>
          <h1>${bot.name} <span class="model-name">${bot.modelName}</span></h1>
          <div style="width: 60px;"></div> <!-- Spacer for centering -->
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

          // Simple markdown to HTML for bold, italic, code
          function formatText(text) {
             let formatted = text
                .replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escape HTML
                .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>') // Bold
                .replace(/\\*(.*?)\\*/g, '<em>$1</em>') // Italic
                .replace(/\\n/g, '<br/>'); // Newlines

             // Very basic code block handling (doesn't handle multiline perfectly but better than nothing)
             formatted = formatted.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>');
             formatted = formatted.replace(/\`(.*?)\`/g, '<code>$1</code>');

             return formatted;
          }

          function appendMessage(role, text, thoughts) {
            hideLoading(); // Ensure loading is removed before appending new msg

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
              // Keep thoughts relatively unformatted but preserve newlines
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
              msgDiv.innerText = text; // User text is raw
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
              } else {
                const data = await res.json();
                hideLoading();
                appendMessage('model', data.answer, data.thoughts);
                history.push({ role: 'model', text: data.answer });
              }
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
      </body>
      </html>
    `)
  } catch (e) {
    return c.redirect('/')
  }
})

app.get('/', async (c) => {
  const db = drizzle(c.env.DB)

  const sessionCookie = getCookie(c, 'session')

  if (sessionCookie) {
    let sessionId: string | undefined
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      sessionId = payload.id as string
    } catch (e) {
      // Invalid token
    }

    if (sessionId !== undefined) {
      const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()

      if (session && session.expiresAt > Math.floor(Date.now() / 1000)) {
        const dbUser = await db.select().from(users).where(eq(users.id, session.userId)).get()

        if (dbUser) {
          const activeSessions = await db.select().from(sessions).where(eq(sessions.userId, dbUser.id)).all()
          const tokens = await db.select().from(apiTokens).where(eq(apiTokens.userId, dbUser.id)).all()
          const bots = await db.select().from(aiBots).where(eq(aiBots.userId, dbUser.id)).all()

          return c.html(html`
            <!DOCTYPE html>
            <html>
            <head>
              <title>y-gem</title>
            </head>
            <body>
              <h1>Welcome, ${dbUser.name}!</h1>
              ${dbUser.picture ? html`<img src="${dbUser.picture}" alt="Profile Picture" width="100" />` : ''}
              <p>Email: ${dbUser.email}</p>
              <form action="/logout" method="GET">
                <button type="submit">Logout</button>
              </form>

              <h2>Active Sessions</h2>
              <ul>
                ${activeSessions.map(s => html`
                  <li>
                    Session ID: ${s.id.substring(0, 8)}... | Expires: ${new Date(s.expiresAt * 1000).toLocaleString()}
                    ${s.id === sessionId ? '(Current)' : ''}
                    <form action="/sessions/${s.id}/delete" method="POST" style="display:inline;">
                      <button type="submit">Delete</button>
                    </form>
                  </li>
                `)}
              </ul>

              <h2>API Tokens</h2>
              <ul>
                ${tokens.map(t => html`
                  <li>
                    Token: ${t.token} | Description: ${t.description || 'N/A'} | Created: ${new Date(t.createdAt * 1000).toLocaleString()}
                    <form action="/api-tokens/${t.id}/delete" method="POST" style="display:inline;">
                      <button type="submit">Revoke</button>
                    </form>
                  </li>
                `)}
              </ul>

              <h3>Create New API Token</h3>
              <form action="/api-tokens" method="POST">
                <label>Description: <input type="text" name="description" /></label>
                <button type="submit">Create Token</button>
              </form>

              <h2>AI Bots</h2>
              <ul>
                ${bots.map(b => html`
                  <li>
                    Bot: <a href="/ai-bots/${b.id}/chat">${b.name}</a> | Model: ${b.modelName} | Created: ${new Date(b.createdAt * 1000).toLocaleString()}
                    <form action="/ai-bots/${b.id}/delete" method="POST" style="display:inline;">
                      <button type="submit">Delete</button>
                    </form>
                  </li>
                `)}
              </ul>

              <h3>Create New AI Bot</h3>
              <form action="/ai-bots" method="POST">
                <label style="display:block; margin-bottom: 5px;">Name: <input type="text" name="name" required /></label>
                <label style="display:block; margin-bottom: 5px;">Model: <input type="text" name="modelName" value="gemini-3-flash-preview" required /></label>
                <label style="display:block; margin-bottom: 5px;">System Prompt:<br/> <textarea name="systemPrompt" rows="3" cols="40"></textarea></label>
                <button type="submit">Create Bot</button>
              </form>
            </body>
            </html>
          `)
        }
      }
    }
  }

  return c.html(html`
    <!DOCTYPE html>
    <html>
    <head>
      <title>y-gem - Login</title>
    </head>
    <body>
      <h1>y-gem</h1>
      <form action="/auth/google" method="GET">
        <button type="submit">Login by Google OAuth</button>
      </form>
    </body>
    </html>
  `)
})

export default app
