import { Hono } from 'hono'
import { html } from 'hono/html'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { googleAuth } from '@hono/oauth-providers/google'
import { users } from './db/schema'

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

  await setSignedCookie(c, 'session', String(dbUser.id), c.env.COOKIE_SECRET)

  return c.redirect('/')
})

app.get('/logout', (c) => {
  deleteCookie(c, 'session')
  return c.redirect('/')
})

app.get('/', async (c) => {
  const db = drizzle(c.env.DB)

  const sessionId = await getSignedCookie(c, c.env.COOKIE_SECRET, 'session')

  if (sessionId) {
    const userId = parseInt(sessionId, 10)
    const dbUser = await db.select().from(users).where(eq(users.id, userId)).get()

    if (dbUser) {
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
        </body>
        </html>
      `)
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
