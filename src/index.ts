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
        <title>Chat with ${bot.name}</title>
        <style>
          body { font-family: sans-serif; margin: 20px; }
          #chat-container { border: 1px solid #ccc; padding: 10px; height: 400px; overflow-y: scroll; margin-bottom: 10px; }
          .msg { margin-bottom: 10px; }
          .msg.user { text-align: right; color: blue; }
          .msg.model { text-align: left; color: green; }
          .thought { font-size: 0.9em; color: #666; background: #eee; padding: 5px; margin-bottom: 5px; display: none; }
          .thought.show { display: block; }
          .thought-toggle { font-size: 0.8em; cursor: pointer; color: #555; text-decoration: underline; margin-bottom: 5px; display: inline-block; }
          input[type="text"] { width: 80%; padding: 5px; }
          button { padding: 5px 10px; }
        </style>
      </head>
      <body>
        <h1>Chat with ${bot.name} (${bot.modelName})</h1>
        <a href="/">Back to Home</a>
        <div id="chat-container"></div>
        <form id="chat-form">
          <input type="text" id="chat-input" required autocomplete="off" placeholder="Type your message..." />
          <button type="submit" id="send-btn">Send</button>
        </form>

        <script>
          const history = [];
          const form = document.getElementById('chat-form');
          const input = document.getElementById('chat-input');
          const container = document.getElementById('chat-container');
          const sendBtn = document.getElementById('send-btn');

          function appendMessage(role, text, thoughts) {
            const div = document.createElement('div');
            div.className = 'msg ' + role;

            if (thoughts) {
              const toggle = document.createElement('div');
              toggle.className = 'thought-toggle';
              toggle.innerText = 'Show/Hide Thoughts';

              const thoughtDiv = document.createElement('div');
              thoughtDiv.className = 'thought';
              thoughtDiv.innerText = thoughts;

              toggle.onclick = () => {
                thoughtDiv.classList.toggle('show');
              };

              div.appendChild(toggle);
              div.appendChild(thoughtDiv);
            }

            const textDiv = document.createElement('div');
            textDiv.innerText = role === 'user' ? 'You: ' + text : 'Bot: ' + text;
            div.appendChild(textDiv);

            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
          }

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value;
            if (!text) return;

            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;

            appendMessage('user', text);
            history.push({ role: 'user', text });

            try {
              const res = await fetch('/ai-bots/${bot.id}/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history })
              });

              if (!res.ok) {
                appendMessage('model', 'Error: ' + res.statusText);
                history.pop();
              } else {
                const data = await res.json();
                appendMessage('model', data.answer, data.thoughts);
                history.push({ role: 'model', text: data.answer });
              }
            } catch (err) {
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
