import { html } from 'hono/html';

export const EditBotPage = (data: {
  bot: any;
  availableModels: string[];
}) => {
  const { bot, availableModels } = data;
  return html`
    <main class="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div class="bg-white shadow rounded-xl overflow-hidden border border-gray-100">
        <div class="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 class="text-lg font-semibold text-gray-800">Edit Bot: ${bot.name}</h2>
        </div>
        <div class="p-6">
          <form action="/ai-bots/${bot.id}/edit" method="POST" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" name="name" value="${bot.name}" required class="w-full rounded-md shadow-sm sm:text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <input type="text" name="modelName" list="available-models" value="${bot.modelName}" required class="w-full rounded-md shadow-sm sm:text-sm bg-white border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
              <datalist id="available-models">
                ${availableModels.map((m: string) => html`<option value="${m}"></option>`)}
              </datalist>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
              <textarea name="systemPrompt" rows="5" class="w-full rounded-md shadow-sm sm:text-sm">${bot.systemPrompt || ''}</textarea>
            </div>
            <div class="flex items-center gap-4">
              <button type="submit" class="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors">
                Save Changes
              </button>
              <a href="/" class="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Cancel</a>
            </div>
          </form>
        </div>
      </div>
    </main>
  `;
};
