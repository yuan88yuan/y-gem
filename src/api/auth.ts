import { getCookie } from 'hono/cookie'
import { DbClient } from './client'

export async function getAuthenticatedUserId(c: any, app: any) {
  const dbClient = new DbClient(app, c.env)

  const tokenValue = c.req.header('Authorization')?.replace('Bearer ', '')
  if (tokenValue) {
    const tokenData = await dbClient.getApiTokenByValue(tokenValue)
    if (tokenData) return tokenData.userId
  }

  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    try {
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
