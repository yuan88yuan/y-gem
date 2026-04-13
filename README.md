# y-gem

y-gem is a Cloudflare Worker application that allows users to create and manage custom AI bots powered by Google GenAI.

## Technical Stack
- **Framework**: Hono
- **Database**: Cloudflare D1 with Drizzle ORM
- **AI**: Google GenAI (supporting streaming and "thoughts")
- **Authentication**: Google OAuth via `@hono/oauth-providers/google`
- **Styling**: Tailwind CSS (via CDN)

## Core Architecture
- **Routing**: Main routing is handled in `src/index.ts`.
- **Database Layer**: 
  - Schema is defined in `src/db/schema.ts`.
  - Data access is decoupled: `src/api/db.ts` implements a REST API for DB operations, and `src/api/client.ts` provides a TypeScript client (`DbClient`) to interact with that API.
- **Session Management**: Uses JWTs stored in cookies, synchronized with a `sessions` table in D1.
- **API Access**: Supports API tokens for authenticated external requests.

## Key Features
- **AI Bot Hub**: Create, edit, and delete bots with custom system prompts and model selection.
- **Streaming Chat**: Real-time interaction with bots using Server-Sent Events (SSE).
- **Account Management**: Google login, session revocation, and API token generation.

## Local Server
The `local-server` is an Express.js application that acts as a local proxy and management interface for the main y-gem Cloudflare Worker.
- **Remote Proxy**: Uses a static `YGEM_API_TOKEN` to communicate with the production server's internal DB API.
- **Local Dashboard**: Renders shared UI templates on Node.js by mocking Hono's `html` template literal.
- **Local AI Execution**: Handles chat requests directly using the `GoogleGenAI` SDK and local API keys.
- **State Sync**: Proxies bot and token management to the remote server.

---

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
- **`GOOGLE_API_KEY`**: Your Google AI API key for GenAI model access.

*Note: For local development, `COOKIE_SECRET` can be defined in `wrangler.jsonc` under `vars`. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` should be provided as secrets (e.g., using `.dev.vars` locally or `npx wrangler secret put` for production).*

## Local Server Environment Settings

The `local-server` requires the following variables in its `.env` file:
- **`YGEM_SERVER_URL`**: The base URL of the deployed y-gem Cloudflare Worker (e.g., `https://y-gem.your-subdomain.workers.dev`).
- **`YGEM_API_TOKEN`**: A valid API token generated from the y-gem dashboard to authenticate requests to the remote server.
- **`GOOGLE_API_KEY`**: Your Google AI API key.
- **`PORT`**: (Optional) The port the local server should run on. Defaults to 3000.

