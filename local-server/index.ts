import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { Layout } from '../src/templates/layout';
import { ChatPage } from '../src/templates/chat';

dotenv.config();

// Mock Hono's html tagged template for the shared templates to work in Node.js
// Since the shared templates use `html`...`
const html = (strings: TemplateStringsArray, ...values: any[]) => 
  strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');

// Attach html to global scope so it's available in the imported TS templates
(global as any).html = html;

const app = express();
const PORT = process.env.PORT || 3000;
const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || '';
const API_TOKEN = process.env.API_TOKEN || '';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function remoteFetch(endpoint: string, options: any = {}) {
    const response = await axios({
        method: options.method || 'GET',
        url: `${REMOTE_SERVER_URL}${endpoint}`,
        data: options.data,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${API_TOKEN}`
        },
        responseType: options.responseType || 'json'
    });
    return response;
}

app.get('/local-bot/:id', async (req, res) => {
    try {
        console.log(`[Local Server] Fetching bot settings for ID: ${req.params.id}`);
        const remoteBot = await remoteFetch(`/api/bots/${req.params.id}`);
        res.json(remoteBot.data);
    } catch (error: any) {
        console.error('[Local Server] Error fetching bot:', error.message);
        res.status(error.response?.status || 500).json({ error: 'Failed to fetch bot settings' });
    }
});

app.post('/local-chat/:id', async (req, res) => {
    const botId = req.params.id;
    const history = req.body.history;

    console.log(`[Local Server] Intercepted message for bot ${botId}:`, history[history.length - 1]);

    try {
        const remoteResponse = await axios({
            method: 'POST',
            url: `${REMOTE_SERVER_URL}/ai-bots/${botId}/chat`,
            data: { history },
            headers: { 'Authorization': `Bearer ${API_TOKEN}` },
            responseType: 'stream' 
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        remoteResponse.data.pipe(res);
        
        remoteResponse.data.on('end', () => {
            console.log(`[Local Server] Chat session ${botId} stream ended.`);
        });

    } catch (error: any) {
        console.error('[Local Server] Chat proxy error:', error.message);
        res.status(500).json({ error: 'Chat proxy failed' });
    }
});

app.get('/chat/:id', async (req, res) => {
    const botId = req.params.id;
    try {
        const remoteBot = await remoteFetch(`/api/bots/${botId}`);
        const bot = remoteBot.data;
        
        // Mock available models since we are only replicating the chat interface
        const availableModels = [
            'gemini-3-flash-preview',
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-2.0-pro-exp',
        ];
        
        // Use the shared templates from src/templates
        // We use await because Hono's html template can return a Promise
        const content = await ChatPage({ bot, availableModels });
        const page = await Layout(`Local Chat: ${bot.name}`, content);
        res.send(page);
    } catch (error: any) {
        console.error('[Local Server] Error loading shared templates:', error.message);
        res.status(500).send('Error loading bot info or templates');
    }
});

app.listen(PORT, () => {
    console.log(`\x1b[32mLocal Proxy Server (TSX) running at http://localhost:${PORT}\x1b[0m`);
    console.log(`Remote URL: ${REMOTE_SERVER_URL}`);
});
