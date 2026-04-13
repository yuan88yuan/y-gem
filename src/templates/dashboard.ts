import { html } from 'hono/html';

export const DashboardPage = (data: {
  dbUser: any;
  activeSessions: any[];
  tokens: any[];
  bots: any[];
  sessionId: string;
  availableModels: string[];
}) => {
  const { dbUser, activeSessions, tokens, bots, sessionId, availableModels } = data;
  return html`
    <nav class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <span class="text-xl font-bold text-primary">y-gem</span>
          </div>
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2">
              ${dbUser.picture ? html`<img src="${dbUser.picture}" alt="Profile" class="h-8 w-8 rounded-full border border-gray-200" />` : ''}
              <span class="text-sm font-medium text-gray-700 hidden sm:block">${dbUser.name}</span>
            </div>
            <div class="h-6 w-px bg-gray-300"></div>
            <form action="/logout" method="GET" class="m-0">
              <button type="submit" class="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Logout</button>
            </form>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-3 space-y-8">
          <div class="bg-white shadow rounded-xl overflow-hidden border border-gray-100">
            <div class="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h2 class="text-lg font-semibold text-gray-800">AI Bots</h2>
              <div class="flex space-x-2">
                <button onclick="openModal('create-bot-modal')" class="text-sm bg-primary text-white hover:bg-primary-hover px-3 py-1.5 rounded-md font-medium transition-colors">Create Bot</button>
                <button onclick="openModal('api-keys-modal')" class="text-sm bg-gray-800 text-white hover:bg-gray-900 px-3 py-1.5 rounded-md font-medium transition-colors">API Keys</button>
                <button onclick="openModal('sessions-modal')" class="text-sm bg-gray-200 text-gray-800 hover:bg-gray-300 px-3 py-1.5 rounded-md font-medium transition-colors">Sessions</button>
              </div>
            </div>
            <div class="p-6">
              ${bots.length === 0 ? html`
                <div class="text-center py-12 px-4 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 mb-6">
                  <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h3 class="mt-2 text-sm font-medium text-gray-900">No bots created</h3>
                  <p class="mt-1 text-sm text-gray-500">Get started by creating your first AI bot.</p>
                  <div class="mt-6">
                    <button onclick="openModal('create-bot-modal')" class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                      <svg class="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Create Bot
                    </button>
                  </div>
                </div>
              ` : ''}
              <ul class="divide-y divide-gray-200 mb-6">
                ${bots.map(b => html`
                  <li class="py-4 flex justify-between items-center group">
                    <div>
                      <a href="/ai-bots/${b.id}/chat" class="text-lg font-medium text-primary hover:underline">${b.name}</a>
                      <p class="text-sm text-gray-500 mt-1">Model: <span class="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs">${b.modelName}</span></p>
                      <p class="text-xs text-gray-400 mt-1">Created: ${new Date(b.createdAt * 1000).toLocaleString()}</p>
                    </div>
                    <div class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href="/ai-bots/${b.id}/edit" class="text-sm text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md font-medium transition-colors">Edit</a>
                      <form action="/ai-bots/${b.id}/delete" method="POST" class="m-0" onsubmit="return confirm('Are you sure you want to delete this bot?');">
                        <button type="submit" class="text-sm text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md font-medium transition-colors">Delete</button>
                      </form>
                    </div>
                  </li>
                `)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Modals -->
    <div id="create-bot-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-900">Create New Bot</h3>
          <button onclick="closeModal('create-bot-modal')" class="text-gray-400 hover:text-gray-500" aria-label="Close modal">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="p-6">
          <form action="/ai-bots" method="POST" class="space-y-4">
            <div>
              <label for="bot-name" class="block text-sm font-medium text-gray-700 mb-1">Name <span class="text-red-500" aria-hidden="true">*</span></label>
              <input id="bot-name" type="text" name="name" required class="w-full rounded-md shadow-sm sm:text-sm" placeholder="My Awesome Bot" />
            </div>
            <div>
              <label for="bot-model" class="block text-sm font-medium text-gray-700 mb-1">Model <span class="text-red-500" aria-hidden="true">*</span></label>
              <input id="bot-model" type="text" name="modelName" list="available-models" value="gemini-3-flash-preview" required class="w-full rounded-md shadow-sm sm:text-sm bg-white border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
              <datalist id="available-models">
                ${availableModels.map(m => html`<option value="${m}"></option>`)}
              </datalist>
            </div>
            <div>
              <label for="bot-system-prompt" class="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
              <textarea id="bot-system-prompt" name="systemPrompt" rows="3" class="w-full rounded-md shadow-sm sm:text-sm" placeholder="You are a helpful assistant..."></textarea>
            </div>
            <div class="mt-5 sm:mt-6 flex space-x-3">
              <button type="submit" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm transition-colors">Create</button>
              <button type="button" onclick="closeModal('create-bot-modal')" class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:text-sm transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div id="api-keys-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-900">API Tokens</h3>
          <button onclick="closeModal('api-keys-modal')" class="text-gray-400 hover:text-gray-500" aria-label="Close modal">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="p-6 max-h-[70vh] overflow-y-auto">
          ${tokens.length === 0 ? html`<p class="text-gray-500 text-sm italic mb-4">No tokens created.</p>` : ''}
          <ul class="divide-y divide-gray-200 mb-6">
            ${tokens.map(t => html`
              <li class="py-3">
                <div class="flex justify-between items-start">
                  <div class="break-all pr-4">
                    <p class="text-sm font-mono text-gray-800 bg-gray-50 p-1 rounded border border-gray-100 mb-1">${t.token}</p>
                    <p class="text-xs text-gray-500">${t.description || 'No description'}</p>
                  </div>
                  <form action="/api-tokens/${t.id}/delete" method="POST" class="flex-shrink-0">
                    <button type="submit" class="text-xs text-red-600 hover:text-red-800 hover:underline">Revoke</button>
                  </form>
                </div>
              </li>
            `)}
          </ul>

          <div class="mt-4 pt-4 border-t border-gray-100">
            <form action="/api-tokens" method="POST" class="space-y-3">
              <div>
                <label for="token-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input id="token-description" type="text" name="description" class="w-full rounded-md shadow-sm sm:text-sm" placeholder="Token description" />
              </div>
              <button type="submit" class="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-colors">
                Generate Token
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div id="sessions-modal" class="fixed inset-0 bg-gray-500 bg-opacity-75 hidden flex items-center justify-center z-50">
      <div class="bg-white rounded-xl shadow-xl overflow-hidden max-w-md w-full">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 class="text-lg font-medium text-gray-900">Active Sessions</h3>
          <button onclick="closeModal('sessions-modal')" class="text-gray-400 hover:text-gray-500" aria-label="Close modal">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="p-6 max-h-[70vh] overflow-y-auto">
          <ul class="divide-y divide-gray-200">
            ${activeSessions.map(s => html`
              <li class="py-3 flex justify-between items-center">
                <div>
                  <p class="text-sm font-medium text-gray-800">
                    ${s.id.substring(0, 8)}...
                    ${s.id === sessionId ? html`<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Current</span>` : ''}
                  </p>
                  <p class="text-xs text-gray-500 mt-1">Expires: ${new Date(s.expiresAt * 1000).toLocaleDateString()}</p>
                </div>
                ${s.id !== sessionId ? html`
                <form action="/sessions/${s.id}/delete" method="POST">
                  <button type="submit" class="text-xs text-red-600 hover:text-red-800 hover:underline">Revoke</button>
                </form>
                ` : ''}
              </li>
            `)}
          </ul>
        </div>
      </div>
    </div>

    <script>
      function openModal(id) {
        document.getElementById(id).classList.remove('hidden');
      }
      function closeModal(id) {
        document.getElementById(id).classList.add('hidden');
      }
    </script>
  `;
};
