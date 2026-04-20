import { randomUUID } from 'crypto'

function main() {
    const sessionId = randomUUID()
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    console.log(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('${sessionId}', 1, ${expiresAt});`)

    console.log(`Session Cookie Value: ${sessionId}`)
}
main()
