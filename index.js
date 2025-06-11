const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ✅ Serve atlassian-connect.json with proper headers
app.get('/atlassian-connect.json', (req, res) => {
    const manifestPath = path.join(__dirname, 'atlassian-connect.json');
    fs.readFile(manifestPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Manifest read error:', err);
            return res.status(500).send('Manifest file not found.');
        }
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    });
});
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
                    description,
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
