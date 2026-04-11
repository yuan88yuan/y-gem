import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
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

app.post('/ai-bots/:id/chat', async (req, res) => {
    const botId = req.params.id;
    const history = req.body.history || [];

    console.log(`[Local Server] Intercepted message for bot ${botId}:`, history[history.length - 1]);

    try {
        const remoteBot = await remoteFetch(`/api/bots/${botId}`);
        const bot = remoteBot.data;

        const contents: any[] = [];

        if (bot.systemPrompt) {
            contents.push({ role: 'user', parts: [{ text: `System Prompt: ${bot.systemPrompt}` }] });
            contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
        }

        for (const msg of history) {
            contents.push({ role: msg.role, parts: [{ text: msg.text }] });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const responseStream = await ai.models.generateContentStream({
            model: bot.modelName,
            contents,
            config: {
                thinkingConfig: {
                    includeThoughts: true,
                },
            },
        });

        for await (const chunk of responseStream) {
            let chunkThoughts = "";
            let chunkAnswer = "";

            if (chunk.candidates && chunk.candidates.length > 0) {
                const content = chunk.candidates[0].content;
                if (content && content.parts) {
                    for (const part of content.parts) {
                        if (!part.text) {
                            continue;
                        } else if ((part as any).thought) {
                            chunkThoughts += part.text;
                        } else {
                            chunkAnswer += part.text;
                        }
                    }
                }
            }

            if (chunkThoughts || chunkAnswer) {
                res.write(`data: ${JSON.stringify({ thoughts: chunkThoughts, answer: chunkAnswer })}\n\n`);
            }
        }

        res.end();
        console.log(`[Local Server] Chat session ${botId} stream ended.`);
    } catch (error: any) {
        console.error('[Local Server] Chat AI error:', error.message);
        res.status(500).json({ error: 'Chat AI failed' });
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
