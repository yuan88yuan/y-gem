import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import { DbClient } from './client'

export async function getAuthenticatedUserId(c: any, app: any) {
  const dbClient = new DbClient(app, c.env)

  const tokenValue = c.req.header('Authorization')?.replace('Bearer ', '')
  if (tokenValue) {
    const tokenData = await dbClient.getApiTokenByValue(tokenValue)
    if (tokenData) return tokenData.userId
  }

  const sessionCookie = getCookie(c, 'session')
  if (sessionCookie) {
    try {
      const payload = await verify(sessionCookie, c.env.COOKIE_SECRET, 'HS256')
      const sessionId = payload.id as string
      const session = await dbClient.getSessionById(sessionId)
      if (session && session.expiresAt > Math.floor(Date.now() / 1000)) {
        return session.userId
      }
    } catch (e) {
      // ignore
    }
  }

  return null
}
