import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { googleAuth } from '@hono/oauth-providers/google'
import { users } from './db/schema'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/auth/google', (c, next) => {
  return googleAuth({
    client_id: c.env.GOOGLE_CLIENT_ID,
    client_secret: c.env.GOOGLE_CLIENT_SECRET,
    scope: ['openid', 'email', 'profile'],
  })(c, next)
})

app.get('/auth/google', (c) => {
  const user = c.get('user-google')
  return c.json({
    message: 'Successfully logged in with Google',
    user
  })
})

app.get('/', async (c) => {
  const db = drizzle(c.env.DB)
  const allUsers = await db.select().from(users).all()
  return c.json({ message: 'Hello Hono!', users: allUsers })
})

export default app
