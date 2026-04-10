```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Server Environment Settings

This project requires the following environment bindings and variables to be configured in your Cloudflare Workers environment (e.g., via `wrangler.toml`, `wrangler.jsonc`, or the Cloudflare dashboard):

### Bindings
- **`DB`**: A Cloudflare D1 Database binding used by Drizzle ORM to store and retrieve application data (such as users).
  - Example `wrangler.jsonc` configuration:
    ```jsonc
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "y-gem-db",
        "database_id": "your-database-id"
      }
    ]
    ```

### Secrets / Environment Variables
- **`GOOGLE_CLIENT_ID`**: Your Google OAuth 2.0 Client ID.
- **`GOOGLE_CLIENT_SECRET`**: Your Google OAuth 2.0 Client Secret.
- **`COOKIE_SECRET`**: A secret string used to sign the JSON Web Tokens (JWT) for user sessions stored in cookies.

*Note: For local development, `COOKIE_SECRET` can be defined in `wrangler.jsonc` under `vars`. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` should be provided as secrets (e.g., using `.dev.vars` locally or `npx wrangler secret put` for production).*
