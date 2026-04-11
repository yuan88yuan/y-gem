import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { users, sessions, apiTokens, aiBots } from '../db/schema'

type Bindings = {
  DB: D1Database
  COOKIE_SECRET: string
}

const dbApi = new Hono<{ Bindings: Bindings }>()

// Add simple auth middleware to prevent external access
dbApi.use('*', async (c, next) => {
  const token = c.req.header('x-internal-token')
  if (!token || token !== c.env.COOKIE_SECRET) {
    return c.json({ error: 'Unauthorized internal access' }, 401)
  }
  await next()
})

// User routes
dbApi.get('/users/by-google-id/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = c.req.param('id')
  const user = await db.select().from(users).where(eq(users.googleId, id)).get()
  return c.json(user || null)
})

dbApi.get('/users/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = parseInt(c.req.param('id'), 10)
  const user = await db.select().from(users).where(eq(users.id, id)).get()
  return c.json(user || null)
})

dbApi.post('/users', async (c) => {
  const db = drizzle(c.env.DB)
  const body = await c.req.json()
  const result = await db.insert(users).values(body).returning().get()
  return c.json(result)
})

// Session routes
dbApi.get('/sessions/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = c.req.param('id')
  const session = await db.select().from(sessions).where(eq(sessions.id, id)).get()
  return c.json(session || null)
})

dbApi.get('/sessions/user/:userId', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = parseInt(c.req.param('userId'), 10)
  const userSessions = await db.select().from(sessions).where(eq(sessions.userId, userId)).all()
  return c.json(userSessions)
})

dbApi.post('/sessions', async (c) => {
  const db = drizzle(c.env.DB)
  const body = await c.req.json()
  await db.insert(sessions).values(body)
  return c.json({ success: true })
})

dbApi.delete('/sessions/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = c.req.param('id')
  await db.delete(sessions).where(eq(sessions.id, id))
  return c.json({ success: true })
})

// API Token routes
dbApi.get('/api-tokens/token/:token', async (c) => {
  const db = drizzle(c.env.DB)
  const token = c.req.param('token')
  const tokenData = await db.select().from(apiTokens).where(eq(apiTokens.token, token)).get()
  return c.json(tokenData || null)
})

dbApi.get('/api-tokens/user/:userId', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = parseInt(c.req.param('userId'), 10)
  const tokens = await db.select().from(apiTokens).where(eq(apiTokens.userId, userId)).all()
  return c.json(tokens)
})

dbApi.post('/api-tokens', async (c) => {
  const db = drizzle(c.env.DB)
  const body = await c.req.json()
  const result = await db.insert(apiTokens).values(body).returning().get()
  return c.json(result)
})

dbApi.delete('/api-tokens/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = parseInt(c.req.param('id'), 10)
  await db.delete(apiTokens).where(eq(apiTokens.id, id))
  return c.json({ success: true })
})

// AI Bot routes
dbApi.get('/ai-bots/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = parseInt(c.req.param('id'), 10)
  const bot = await db.select().from(aiBots).where(eq(aiBots.id, id)).get()
  return c.json(bot || null)
})

dbApi.get('/ai-bots/user/:userId', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = parseInt(c.req.param('userId'), 10)
  const bots = await db.select().from(aiBots).where(eq(aiBots.userId, userId)).all()
  return c.json(bots)
})

dbApi.post('/ai-bots', async (c) => {
  const db = drizzle(c.env.DB)
  const body = await c.req.json()
  await db.insert(aiBots).values(body)
  return c.json({ success: true })
})

dbApi.patch('/ai-bots/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  await db.update(aiBots).set(body).where(eq(aiBots.id, id))
  return c.json({ success: true })
})

dbApi.delete('/ai-bots/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const id = parseInt(c.req.param('id'), 10)
  await db.delete(aiBots).where(eq(aiBots.id, id))
  return c.json({ success: true })
})

export { dbApi }
