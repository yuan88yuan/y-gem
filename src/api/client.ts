import { HonoRequest } from 'hono'

export class DbClient {
  private app: any;
  private env: any;

  constructor(app: any, env: any) {
    this.app = app;
    this.env = env;
  }

  private async fetchInternal(path: string, options: any = {}) {
    const reqUrl = `http://localhost/api/internal/db${path}`;

    // Create a new Request object for app.fetch
    const req = new Request(reqUrl, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': this.env.COOKIE_SECRET,
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Need to pass a dummy execution context
    const executionCtx = {
        waitUntil: () => {},
        passThroughOnException: () => {}
    };

    const res = await this.app.fetch(req, this.env, executionCtx);

    if (!res.ok) {
        throw new Error(`DB API Error: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // User methods
  async getUserByGoogleId(googleId: string) {
    return this.fetchInternal(`/users/by-google-id/${googleId}`);
  }

  async getUserById(id: number) {
    return this.fetchInternal(`/users/${id}`);
  }

  async createUser(googleId: string, email: string, name: string, picture: string | null) {
    return this.fetchInternal('/users', {
      method: 'POST',
      body: { googleId, email, name, picture }
    });
  }

  // Session methods
  async getSessionById(id: string) {
    return this.fetchInternal(`/sessions/${id}`);
  }

  async getSessionsByUserId(userId: number) {
    return this.fetchInternal(`/sessions/user/${userId}`);
  }

  async createSession(id: string, userId: number, expiresAt: number) {
    return this.fetchInternal('/sessions', {
      method: 'POST',
      body: { id, userId, expiresAt }
    });
  }

  async deleteSession(id: string) {
    return this.fetchInternal(`/sessions/${id}`, {
      method: 'DELETE'
    });
  }

  // API Token methods
  async getApiTokenByValue(token: string) {
    return this.fetchInternal(`/api-tokens/token/${token}`);
  }

  async getApiTokensByUserId(userId: number) {
    return this.fetchInternal(`/api-tokens/user/${userId}`);
  }

  async createApiToken(userId: number, token: string, description: string, createdAt: number) {
    return this.fetchInternal('/api-tokens', {
      method: 'POST',
      body: { userId, token, description, createdAt }
    });
  }

  async deleteApiToken(id: number) {
    return this.fetchInternal(`/api-tokens/${id}`, {
      method: 'DELETE'
    });
  }

  // Bot methods
  async getBotById(id: number) {
    return this.fetchInternal(`/ai-bots/${id}`);
  }

  async getBotsByUserId(userId: number) {
    return this.fetchInternal(`/ai-bots/user/${userId}`);
  }

  async createBot(userId: number, name: string, modelName: string, systemPrompt: string, createdAt: number) {
    return this.fetchInternal('/ai-bots', {
      method: 'POST',
      body: { userId, name, modelName, systemPrompt, createdAt }
    });
  }

  async updateBot(id: number, data: { name?: string, modelName?: string, systemPrompt?: string }) {
    return this.fetchInternal(`/ai-bots/${id}`, {
      method: 'PATCH',
      body: data
    });
  }

  async deleteBot(id: number) {
    return this.fetchInternal(`/ai-bots/${id}`, {
      method: 'DELETE'
    });
  }
}
