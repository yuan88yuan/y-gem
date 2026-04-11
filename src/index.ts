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

async function getAuthenticatedUserId(c: any) {
  const db = drizzle(c.env.DB)

  const tokenValue = c.req.header('Authorization')?.replace('Bearer ', '')
  if (tokenValue) {
    const tokenData = await db.select().from(apiTokens).where(eq(apiTokens.token, tokenValue)).get()
    if (tokenData) return tokenData.userId
  }

  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (session && session.expiresAt > Math.floor(Date.now() / 1000)) {
        return session.userId
      }
    } catch (e) {
      // ignore
    }
  }

  return null
}

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
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = c.req.param('id')
  const db = drizzle(c.env.DB)

  const sessionToDelete = await db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (sessionToDelete && sessionToDelete.userId === userId) {
    await db.delete(sessions).where(eq(sessions.id, id))
  }
  return c.redirect('/')
})


app.post('/api-tokens', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const db = drizzle(c.env.DB)
  const body = await c.req.parseBody()
  const description = (body['description'] as string) || ''
  const tokenValue = crypto.randomUUID()

  await db.insert(apiTokens).values({
    userId,
    token: tokenValue,
    description,
    createdAt: Math.floor(Date.now() / 1000),
  })
  return c.redirect('/')
})


app.post('/api-tokens/:id/delete', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  const db = drizzle(c.env.DB)
  const tokenToDelete = await db.select().from(apiTokens).where(eq(apiTokens.id, id)).get()
  if (tokenToDelete && tokenToDelete.userId === userId) {
    await db.delete(apiTokens).where(eq(apiTokens.id, id))
  }
  return c.redirect('/')
})


app.get('/api/bots/:id', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  try {
    const db = drizzle(c.env.DB)
    const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (!bot) return c.json({ error: 'Bot not found' }, 404)
    if (bot.userId !== userId) return c.json({ error: 'Forbidden' }, 403)

    return c.json(bot)
  } catch (e: any) {
    return c.json({ error: 'Internal server error', details: e.message }, 500)
  }
})


app.post('/ai-bots', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const db = drizzle(c.env.DB)
  const body = await c.req.parseBody()
  const name = (body['name'] as string) || 'Unnamed Bot'
  const modelName = (body['modelName'] as string) || 'gemini-3-flash-preview'
  const systemPrompt = (body['systemPrompt'] as string) || ''

  await db.insert(aiBots).values({
    userId,
    name,
    modelName,
    systemPrompt,
    createdAt: Math.floor(Date.now() / 1000),
  })
  return c.redirect('/')
})


app.post('/ai-bots/:id/delete', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  const db = drizzle(c.env.DB)
  const botToDelete = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
  if (botToDelete && botToDelete.userId === userId) {
    await db.delete(aiBots).where(eq(aiBots.id, id))
  }
  return c.redirect('/')
})


app.post('/ai-bots/:id/chat', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  try {
    const db = drizzle(c.env.DB)
    const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (!bot || bot.userId !== userId) {
      return c.json({ error: 'Not found or not authorized' }, 404)
    }

    const body = await c.req.json()
    const history = body.history || []

    const contents: any[] = []

    if (bot.systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `System Prompt: ${bot.systemPrompt}` }] })
      contents.push({ role: 'model', parts: [{ text: 'Understood.' }] })
    }

    for (const msg of history) {
      contents.push({ role: msg.role, parts: [{ text: msg.text }] })
    }

    const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_API_KEY })

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


app.get('/ai-bots/:id/edit', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  try {
    const db = drizzle(c.env.DB)
    const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (!bot || bot.userId !== userId) {
      return c.redirect('/')
    }

    let availableModels: string[] = []
    try {
      const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_API_KEY })
      const modelsResp = await ai.models.list()
      for await (const m of modelsResp) {
        if (m.name) {
          availableModels.push(m.name)
        }
      }
    } catch (e) {
      // Fallback if API key is invalid or network fails
      availableModels = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-pro-exp',
      ]
    }
    // Ensure current model is in list
    if (!availableModels.includes(bot.modelName)) {
      availableModels.push(bot.modelName)
    }

    return c.html(html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Edit Bot - y-gem</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  primary: '#2563eb',
                  'primary-hover': '#1d4ed8',
                }
              }
            }
          }
        </script>
        <style>
          input[type="text"], textarea {
            padding: 0.5rem;
            border: 1px solid #d1d5db;
          }
          input[type="text"]:focus, textarea:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 1px #3b82f6;
          }
        </style>
      </head>
      <body class="bg-gray-100 min-h-screen font-sans text-gray-900">
        <nav class="bg-white shadow-sm border-b border-gray-200">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
              <div class="flex items-center">
                <a href="/" class="text-xl font-bold text-primary hover:underline">y-gem</a>
              </div>
            </div>
          </div>
        </nav>

        <main class="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div class="bg-white shadow rounded-xl overflow-hidden border border-gray-100">
            <div class="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 class="text-lg font-semibold text-gray-800">Edit Bot: ${bot.name}</h2>
            </div>
            <div class="p-6">
              <form action="/ai-bots/${bot.id}/edit" method="POST" class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input type="text" name="name" value="${bot.name}" required class="w-full rounded-md shadow-sm sm:text-sm" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                  <select name="modelName" required class="w-full rounded-md shadow-sm sm:text-sm bg-white border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                    ${availableModels.map((m: string) => html`<option value="${m}" ${m === bot.modelName ? 'selected' : ''}>${m}</option>`)}
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                  <textarea name="systemPrompt" rows="5" class="w-full rounded-md shadow-sm sm:text-sm">${bot.systemPrompt || ''}</textarea>
                </div>
                <div class="flex items-center gap-4">
                  <button type="submit" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors">
                    Save Changes
                  </button>
                  <a href="/" class="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Cancel</a>
                </div>
              </form>
            </div>
          </div>
        </main>
      </body>
      </html>
    `)
  } catch (e) {
    return c.redirect('/')
  }
})

app.post('/ai-bots/:id/edit', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  try {
    const db = drizzle(c.env.DB)
    const botToEdit = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (botToEdit && botToEdit.userId === userId) {
      const body = await c.req.parseBody()
      const name = (body['name'] as string) || 'Unnamed Bot'
      const modelName = (body['modelName'] as string) || 'gemini-3-flash-preview'
      const systemPrompt = (body['systemPrompt'] as string) || ''

      await db.update(aiBots)
        .set({ name, modelName, systemPrompt })
        .where(eq(aiBots.id, id))
    }
  } catch (e) {
    // ignore
  }
  return c.redirect('/')
})


app.post('/ai-bots/:id/update-model', async (c) => {
  const userId = await getAuthenticatedUserId(c)
  if (!userId) return c.redirect('/')

  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.redirect('/')

  try {
    const db = drizzle(c.env.DB)
    const botToEdit = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
    if (botToEdit && botToEdit.userId === userId) {
      const body = await c.req.parseBody()
      const modelName = (body['modelName'] as string) || 'gemini-3-flash-preview'

      await db.update(aiBots)
        .set({ modelName })
        .where(eq(aiBots.id, id))
    }
  } catch (e) {
    // ignore
  }
  return c.redirect(`/ai-bots/${id}/chat`)
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

    let availableModels: string[] = []
    try {
      const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_API_KEY })
      const modelsResp = await ai.models.list()
      for await (const m of modelsResp) {
        if (m.name && m.name.includes('gemini')) {
          availableModels.push(m.name)
        }
      }
    } catch (e) {
      // Fallback if API key is invalid or network fails
      availableModels = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-pro-exp',
      ]
    }
    // Ensure current model is in list
    if (!availableModels.includes(bot.modelName)) {
      availableModels.push(bot.modelName)
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
            height: 100dvh;
            overflow: hidden;
          }

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

          .header .model-name {
            font-size: 0.875rem;
            color: var(--text-secondary);
            font-weight: 400;
            margin-left: 0.5rem;
            background: #e5e7eb;
            padding: 0.125rem 0.5rem;
            border-radius: 9999px;
            flex-shrink: 0;
            white-space: nowrap;
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
          <h1>
            <span class="bot-name">${bot.name}</span>
            <form action="/ai-bots/${bot.id}/update-model" method="POST" style="display:inline-block; margin-left:0.5rem;">
              <select name="modelName" onchange="this.form.submit()" style="font-size: 0.875rem; color: var(--text-secondary); background: #e5e7eb; padding: 0.125rem 0.5rem; border-radius: 9999px; border: none; outline: none; cursor: pointer; max-width: 150px; text-overflow: ellipsis;">
                ${availableModels.map((m: string) => html`<option value="${m}" ${m === bot.modelName ? 'selected' : ''}>${m}</option>`)}
              </select>
            </form>
          </h1>
          <div style="width: 60px; flex-shrink: 0;"></div> <!-- Spacer for centering -->
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

          let availableModels: string[] = []
          try {
            const ai = new GoogleGenAI({ apiKey: c.env.GOOGLE_API_KEY })
            const modelsResp = await ai.models.list()
            for await (const m of modelsResp) {
              if (m.name && m.name.includes('gemini')) {
                availableModels.push(m.name)
              }
            }
          } catch (e) {
            // Fallback if API key is invalid or network fails
            availableModels = [
              'gemini-3-flash-preview',
              'gemini-2.5-flash',
              'gemini-2.5-pro',
              'gemini-2.0-flash',
              'gemini-2.0-pro-exp',
            ]
          }

          return c.html(html`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>y-gem Dashboard</title>
              <script src="https://cdn.tailwindcss.com"></script>
              <script>
                tailwind.config = {
                  theme: {
                    extend: {
                      colors: {
                        primary: '#2563eb',
                        'primary-hover': '#1d4ed8',
                      }
                    }
                  }
                }
              </script>
              <style>
                input[type="text"], textarea {
                  padding: 0.5rem;
                  border: 1px solid #d1d5db;
                }
                input[type="text"]:focus, textarea:focus {
                  outline: none;
                  border-color: #3b82f6;
                  box-shadow: 0 0 0 1px #3b82f6;
                }
              </style>
            </head>
            <body class="bg-gray-100 min-h-screen font-sans text-gray-900">
              <nav class="bg-white shadow-sm border-b border-gray-200">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div class="flex justify-between h-16">
                    <div class="flex items-center">
                      <span class="text-xl font-bold text-primary">y-gem</span>
                    </div>
                    <div class="flex items-center space-x-4">
                      <div class="flex items-center space-x-2">
                        ${dbUser.picture ? html`<img src="${dbUser.picture}" alt="Profile" class="h-8 w-8 rounded-full border border-gray-200" />` : ''}
                        <span class="text-sm font-medium text-gray-700 hidden sm:block">${dbUser.name}</span>
                      </div>
                      <div class="h-6 w-px bg-gray-300"></div>
                      <form action="/logout" method="GET" class="m-0">
                        <button type="submit" class="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Logout</button>
                      </form>
                    </div>
                  </div>
                </div>
              </nav>

              <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

                  <!-- AI Bots Column -->
                  <div class="lg:col-span-3 space-y-8">
                    <div class="bg-white shadow rounded-xl overflow-hidden border border-gray-100">
                      <div class="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <h2 class="text-lg font-semibold text-gray-800">AI Bots</h2>
                        <div class="flex space-x-2">
                          <button onclick="openModal('create-bot-modal')" class="text-sm bg-primary text-white hover:bg-primary-hover px-3 py-1.5 rounded-md font-medium transition-colors">Create Bot</button>
                          <button onclick="openModal('api-keys-modal')" class="text-sm bg-gray-800 text-white hover:bg-gray-900 px-3 py-1.5 rounded-md font-medium transition-colors">API Keys</button>
                          <button onclick="openModal('sessions-modal')" class="text-sm bg-gray-200 text-gray-800 hover:bg-gray-300 px-3 py-1.5 rounded-md font-medium transition-colors">Sessions</button>
                        </div>
                      </div>
                      <div class="p-6">
                        ${bots.length === 0 ? html`<p class="text-gray-500 text-sm italic mb-4">No bots created yet.</p>` : ''}
                        <ul class="divide-y divide-gray-200 mb-6">
                          ${bots.map(b => html`
                            <li class="py-4 flex justify-between items-center group">
                              <div>
                                <a href="/ai-bots/${b.id}/chat" class="text-lg font-medium text-primary hover:underline">${b.name}</a>
                                <p class="text-sm text-gray-500 mt-1">Model: <span class="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">${b.modelName}</span></p>
                                <p class="text-xs text-gray-400 mt-1">Created: ${new Date(b.createdAt * 1000).toLocaleString()}</p>
                              </div>
                              <div class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href="/ai-bots/${b.id}/edit" class="text-sm text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md font-medium transition-colors">Edit</a>
                                <form action="/ai-bots/${b.id}/delete" method="POST" class="m-0" onsubmit="return confirm('Are you sure you want to delete this bot?');">
                                  <button type="submit" class="text-sm text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md font-medium transition-colors">Delete</button>
                                </form>
                              </div>
                            </li>
                          `)}
                        </ul>

                      </div>
                    </div>
                  </div>

                </div>
              </main>

              <!-- Modals -->
              <div id="create-bot-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
                  <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">Create New Bot</h3>
                    <button onclick="closeModal('create-bot-modal')" class="text-gray-400 hover:text-gray-500">
                      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                  <div class="p-6">
                    <form action="/ai-bots" method="POST" class="space-y-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" name="name" required class="w-full rounded-md shadow-sm sm:text-sm" placeholder="My Awesome Bot" />
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
                        <select name="modelName" required class="w-full rounded-md shadow-sm sm:text-sm bg-white border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                          ${availableModels.map((m: string) => html`<option value="${m}" ${m === 'gemini-3-flash-preview' ? 'selected' : ''}>${m}</option>`)}
                        </select>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                        <textarea name="systemPrompt" rows="3" class="w-full rounded-md shadow-sm sm:text-sm" placeholder="You are a helpful assistant..."></textarea>
                      </div>
                      <div class="mt-5 sm:mt-6 flex space-x-3">
                        <button type="submit" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm transition-colors">Create</button>
                        <button type="button" onclick="closeModal('create-bot-modal')" class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm transition-colors">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              <div id="api-keys-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
                  <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">API Tokens</h3>
                    <button onclick="closeModal('api-keys-modal')" class="text-gray-400 hover:text-gray-500">
                      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                  <div class="p-6 max-h-[70vh] overflow-y-auto">
                    ${tokens.length === 0 ? html`<p class="text-gray-500 text-sm italic mb-4">No tokens created.</p>` : ''}
                    <ul class="divide-y divide-gray-200 mb-6">
                      ${tokens.map(t => html`
                        <li class="py-3">
                          <div class="flex justify-between items-start">
                            <div class="break-all pr-4">
                              <p class="text-sm font-mono text-gray-800 bg-gray-50 p-1 rounded border border-gray-100 mb-1">${t.token}</p>
                              <p class="text-xs text-gray-500">${t.description || 'No description'}</p>
                            </div>
                            <form action="/api-tokens/${t.id}/delete" method="POST" class="flex-shrink-0">
                              <button type="submit" class="text-xs text-red-600 hover:text-red-800 hover:underline">Revoke</button>
                            </form>
                          </div>
                        </li>
                      `)}
                    </ul>

                    <div class="mt-4 pt-4 border-t border-gray-100">
                      <form action="/api-tokens" method="POST" class="space-y-3">
                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <input type="text" name="description" class="w-full rounded-md shadow-sm sm:text-sm" placeholder="Token description" />
                        </div>
                        <button type="submit" class="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-colors">
                          Generate Token
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>

              <div id="sessions-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
                  <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">Active Sessions</h3>
                    <button onclick="closeModal('sessions-modal')" class="text-gray-400 hover:text-gray-500">
                      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  </div>
                  <div class="p-6 max-h-[70vh] overflow-y-auto">
                    <ul class="divide-y divide-gray-200">
                      ${activeSessions.map(s => html`
                        <li class="py-3 flex justify-between items-center">
                          <div>
                            <p class="text-sm font-medium text-gray-800">
                              ${s.id.substring(0, 8)}...
                              ${s.id === sessionId ? html`<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Current</span>` : ''}
                            </p>
                            <p class="text-xs text-gray-500 mt-1">Expires: ${new Date(s.expiresAt * 1000).toLocaleDateString()}</p>
                          </div>
                          ${s.id !== sessionId ? html`
                          <form action="/sessions/${s.id}/delete" method="POST">
                            <button type="submit" class="text-xs text-red-600 hover:text-red-800 hover:underline">Revoke</button>
                          </form>
                          ` : ''}
                        </li>
                      `)}
                    </ul>
                  </div>
                </div>
              </div>

              <script>
                function openModal(id) {
                  document.getElementById(id).classList.remove('hidden');
                }
                function closeModal(id) {
                  document.getElementById(id).classList.add('hidden');
                }
              </script>
            </body>
            </html>
          `)
        }
      }
    }
  }

  return c.html(html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>y-gem - Login</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 flex items-center justify-center min-h-screen font-sans">
      <div class="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-xl border border-gray-100 text-center">
        <div>
          <h1 class="mt-2 text-4xl font-extrabold text-gray-900 tracking-tight">y-gem</h1>
          <p class="mt-4 text-sm text-gray-500">Your AI Bot Hub</p>
        </div>
        <div class="mt-8">
          <form action="/auth/google" method="GET">
            <button type="submit" class="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all">
              <svg class="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                <path fill="none" d="M1 1h22v22H1z" />
              </svg>
              Continue with Google
            </button>
          </form>
        </div>
      </div>
    </body>
    </html>
  `)
})

export default app
