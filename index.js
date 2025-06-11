const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// ✅ Middleware for Atlassian Connect
app.use((req, res, next) => {
  // Remove X-Frame-Options to allow iframe embedding in Jira
  res.removeHeader('X-Frame-Options');
  // Set CSP to allow framing by Atlassian domains
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.atlassian.net https://*.jira.com");
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Generate a shared secret for JWT authentication
const SHARED_SECRET = process.env.ATLASSIAN_SHARED_SECRET || crypto.randomBytes(32).toString('hex');

// ✅ Serve atlassian-connect.json with proper headers
app.get('/atlassian-connect.json', (req, res) => {
    const manifestPath = path.join(__dirname, 'atlassian-connect.json');
    fs.readFile(manifestPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Manifest read error:', err);
            return res.status(500).send('Manifest file not found.');
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(data);
    });
});

// ✅ Lifecycle endpoints for Atlassian Connect
app.post('/installed', (req, res) => {
    console.log('App installed:', req.body);
    // Store installation details (clientKey, sharedSecret, etc.)
    // In production, save this to a database
    const { clientKey, sharedSecret, baseUrl } = req.body;
    console.log(`Installed for: ${baseUrl} with clientKey: ${clientKey}`);
    res.status(200).send('OK');
});

app.post('/uninstalled', (req, res) => {
    console.log('App uninstalled:', req.body);
    res.status(200).send('OK');
});

// ✅ Main assistant page (served within Jira iframe)
app.get('/assistant', (req, res) => {
    // This endpoint serves the main app within Jira
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Default route for testing outside Jira
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// 🔹 Gemini AI Chat Handler
app.post('/api/chat', async (req, res) => {
    try {
        const userMsg = req.body.message;

        const geminiResp = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: userMsg }] }]
            },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const reply = geminiResp.data.candidates[0].content.parts[0].text;
        res.json({ reply });
    } catch (error) {
        console.error('Gemini API Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to get response from Gemini' });
    }
});

// 🔹 Jira Ticket Creation
app.post('/api/jira/create', async (req, res) => {
    try {
        const { summary, description, issuetype } = req.body;

        const response = await axios.post(
            `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
            {
                fields: {
                    project: { key: process.env.JIRA_PROJECT_KEY },
                    summary,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [
                            {
                                type: "paragraph",
                                content: [
                                    {
                                        type: "text",
                                        text: description
                                    }
                                ]
                            }
                        ]
                    },
                    issuetype: { name: issuetype }
                }
            },
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json({
            key: response.data.key,
            url: `${process.env.JIRA_BASE_URL}/browse/${response.data.key}`
        });
    } catch (error) {
        console.error('Jira Create Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Jira ticket creation failed' });
    }
});

// 🔹 Jira Issue Fetching
app.get('/api/jira/issue/:key', async (req, res) => {
    try {
        const key = req.params.key;

        const response = await axios.get(
            `${process.env.JIRA_BASE_URL}/rest/api/3/issue/${key}`,
            {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64')}`,
                    'Accept': 'application/json'
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Jira Fetch Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch Jira issue' });
    }
});

// Serve frontend for all other unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
