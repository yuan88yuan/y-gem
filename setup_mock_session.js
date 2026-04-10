import { sign } from 'hono/jwt'
import { randomUUID } from 'crypto'

async function main() {
    const sessionId = randomUUID()
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    console.log(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('${sessionId}', 1, ${expiresAt});`)

    const token = await sign({ id: sessionId, exp: expiresAt }, 'test_cookie_secret_for_local_dev')
    console.log(`Token: ${token}`)
}
main()
