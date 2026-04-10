import { Hono } from 'hono'
import { html } from 'hono/html'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleAuth } from '@hono/oauth-providers/google'
import { users, sessions, apiTokens } from './db/schema'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  COOKIE_SECRET: string
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
