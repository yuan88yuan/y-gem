const fs = require('fs');
let code = fs.readFileSync('local-server/index.ts', 'utf8');

const search = `app.post('/ai-bots/:id/chat', async (req, res) => {
    const botId = req.params.id;
    const history = req.body.history || [];

    // console.log(\`[Local Server] Intercepted message for bot \${botId}:\`, history[history.length - 1]);

    try {
        const remoteBot = await remoteFetch(\`/api/bots/\${botId}\`);
        const bot = remoteBot.data;

        const contents: any[] = [];

        if (bot.systemPrompt) {
            contents.push({ role: 'user', parts: [{ text: \`System Prompt: \${bot.systemPrompt}\` }] });
            contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
        }

        for (const msg of history) {
            contents.push({ role: msg.role, parts: [{ text: msg.text }] });
        }`;

const replace = `app.post('/ai-bots/:id/chat', async (req, res) => {
    const botId = req.params.id;
    const prompt = req.body.prompt || '';

    // console.log(\`[Local Server] Intercepted message for bot \${botId}:\`, prompt);

    try {
        const remoteBot = await remoteFetch(\`/api/bots/\${botId}\`);
        const bot = remoteBot.data;

        const contents: any[] = [];

        if (bot.systemPrompt) {
            contents.push({ role: 'user', parts: [{ text: \`System Prompt: \${bot.systemPrompt}\` }] });
            contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
        }

        if (prompt) {
            contents.push({ role: 'user', parts: [{ text: prompt }] });
        }`;

code = code.replace(search, replace);
fs.writeFileSync('local-server/index.ts', code);
