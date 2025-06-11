// Handles chat UI and backend API calls
const chatbox = document.getElementById('chatbox');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');

function addMsg(sender, text) {
    const div = document.createElement('div');
    div.className = sender;
    div.innerHTML = (sender === 'user' ? 'You: ' : 'Bot: ') + text;
    chatbox.appendChild(div);
    chatbox.scrollTop = chatbox.scrollHeight;
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = input.value.trim();
    if (!msg) return;
    addMsg('user', msg);
    input.value = '';

    // If user types special commands, call backend Jira endpoints directly:
    // Example: /create Story|My summary|My description
    // Example: /get ABC-123

    if (msg.startsWith('/create')) {
        // Parse command: /create type|summary|desc
        // Example: /create Story|Add login|User should log in with email
        const parts = msg.split('|');
        if (parts.length === 3) {
            const type = parts[0].split(' ')[1] || 'Story';
            const summary = parts[1];
            const description = parts[2];
            addMsg('bot', 'Creating Jira issue...');
            try {
                const resp = await fetch('/api/jira/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ summary, description, issuetype: type })
                });
                const data = await resp.json();
                if (data.key) {
                    addMsg('bot', `Created Jira issue: <a href="${data.url}" target="_blank">${data.key}</a>`);
                } else {
                    addMsg('bot', 'Failed to create Jira issue: ' + (data.error || 'Unknown error'));
                }
            } catch (error) {
                addMsg('bot', 'Error creating Jira issue: ' + error.message);
            }
            return;
        } else {
            addMsg('bot', 'Usage: /create Type|Summary|Description');
            return;
        }
    }

    if (msg.startsWith('/get')) {
        // Parse command: /get ABC-123
        const parts = msg.split(' ');
        if (parts.length === 2) {
            addMsg('bot', 'Fetching Jira issue...');
            try {
                const resp = await fetch('/api/jira/issue/' + parts[1]);
                const data = await resp.json();
                if (data.key) {
                    const description = data.fields.description?.content?.[0]?.content?.[0]?.text || 'No description';
                    addMsg('bot', `Issue ${data.key}: ${data.fields.summary}<br>Status: ${data.fields.status.name}<br>Description: ${description}`);
                } else {
                    addMsg('bot', 'Failed to fetch Jira issue: ' + (data.error || 'Issue not found'));
                }
            } catch (error) {
                addMsg('bot', 'Error fetching Jira issue: ' + error.message);
            }
            return;
        } else {
            addMsg('bot', 'Usage: /get ISSUE-KEY');
            return;
        }
    }

    // Otherwise, send to Gemini
    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
        const data = await resp.json();
        addMsg('bot', data.reply || data.error);
    } catch (error) {
        addMsg('bot', 'Error: ' + error.message);
    }
});
