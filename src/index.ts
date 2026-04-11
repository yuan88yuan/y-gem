import { Hono } from 'hono'
import { html } from 'hono/html'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import { sign, verify } from 'hono/jwt'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleAuth } from '@hono/oauth-providers/google'
import { users, sessions, apiTokens, aiBots } from './db/schema'
import { GoogleGenAI } from '@google/genai'
import { Layout } from './templates/layout'
import { DashboardPage } from './templates/dashboard'
import { ChatPage } from './templates/chat'
import { EditBotPage } from './templates/edit'

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

    return streamSSE(c, async (stream) => {
      // Create the chat response
      const responseStream = await ai.models.generateContentStream({
        model: bot.modelName,
        contents,
        config: {
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      })

      for await (const chunk of responseStream) {
        let chunkThoughts = ""
        let chunkAnswer = ""

        if (chunk.candidates && chunk.candidates.length > 0) {
          const content = chunk.candidates[0].content;
          if (content && content.parts) {
            for (const part of content.parts) {
              if (!part.text) {
                continue
              } else if ((part as any).thought) {
                chunkThoughts += part.text
              } else {
                chunkAnswer += part.text
              }
            }
          }
        }

        if (chunkThoughts || chunkAnswer) {
          await stream.writeSSE({
            data: JSON.stringify({ thoughts: chunkThoughts, answer: chunkAnswer }),
          })
        }
      }
    })
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
          availableModels.push(m.name.replace(/^models\//, ''))
        }
      }
    } catch (e) {
      availableModels = [
        'gemini-3-flash-preview',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
        'gemini-2.0-pro-exp',
      ]
    }
    if (!availableModels.includes(bot.modelName)) {
      availableModels.push(bot.modelName)
    }

    return c.html(html`${Layout(`Edit Bot: ${bot.name}`, EditBotPage({ bot, availableModels }))}`)
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
        if (m.name) {
          availableModels.push(m.name.replace(/^models\//, ''))
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

    return c.html(html`${await Layout(`Chat with ${bot.name}`, await ChatPage({ bot, availableModels }))}`)
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
              if (m.name) {
                availableModels.push(m.name.replace(/^models\//, ''))
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
                        <input type="text" name="modelName" list="available-models" value="gemini-3-flash-preview" required class="w-full rounded-md shadow-sm sm:text-sm bg-white border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                        <datalist id="available-models">
                          ${availableModels.map((m: string) => html`<option value="${m}"></option>`)}
                        </datalist>
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
