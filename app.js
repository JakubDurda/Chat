// Channel constants
const CHANNEL = 'chat';
const TYPING_CHANNEL = `${CHANNEL}-typing`;
const ADMIN_USERNAME = 'Admin123';

// Admin panel state
const adminState = {
    isAdmin: false
};

// PubNub setup
const pubnub = new PubNub({
    publishKey: 'pub-c-54dd99bb-2b64-496b-9279-4885b113fae6',
    subscribeKey: 'sub-c-3343b2bb-49a7-4c31-895b-cc9c45ab2054',
    uuid: generateDefaultUsername(),
    heartbeatInterval: 30,
    presenceTimeout: 60,
    keepAlive: true,
    authKey: 'sec-c-NjkyYmE3MjktYmE3OS00OTRhLWI0MGYtZjM1NzdiNTJmODUz',
    // Enable storage/persistence for history
    enableMessageStorage: true,
    // Add permissions for history and delete operations
    permissions: {
        channels: {
            [CHANNEL]: {
                read: true,
                write: true,
                manage: true,
                delete: true,
                history: true
            },
            [`${CHANNEL}-pnpres`]: {
                read: true,
                write: true
            },
            [TYPING_CHANNEL]: {
                read: true,
                write: true
            }
        }
    }
});

// Function to generate a default username
function generateDefaultUsername() {
    const savedUsername = localStorage.getItem('chat-username');
    if (savedUsername && savedUsername !== 'undefined' && savedUsername !== 'null') {
        return savedUsername;
    }
    const newUsername = `User-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chat-username', newUsername);
    return newUsername;
}

// DOM Elements
const messageInput = document.getElementById('message');
const usernameInput = document.getElementById('username');
const sendButton = document.getElementById('send-button');
const messagesContainer = document.getElementById('messages');
const connectionStatus = document.getElementById('connection-status');
const typingStatus = document.getElementById('typing-status');
const usersList = document.getElementById('users-list');
const themeToggle = document.getElementById('theme-toggle');
const clearHistoryBtn = document.getElementById('clear-history');
const html = document.documentElement;

const CONFIG = {
    connectionStatusDuration: 3000,
};

const state = {
    messageIds: new Set(),
    users: new Map(),
    currentUsername: pubnub.getUUID(),
    typingUsers: new Set(),
    typingTimeout: null
};

// Initialize username input with current value
usernameInput.value = state.currentUsername;
usernameInput.addEventListener('input', e => localStorage.setItem('chat-username', e.target.value));

usernameInput.addEventListener('change', () => {
    const newUsername = usernameInput.value.trim();
    if (!newUsername || newUsername === state.currentUsername) return;

    if (state.currentUsername && !confirm('Change your name? This will be visible to all users.')) {
        usernameInput.value = state.currentUsername;
        return;
    }

    const oldName = state.currentUsername;
    state.currentUsername = newUsername;
    localStorage.setItem('chat-username', newUsername);
    
    // Update PubNub UUID
    pubnub.setUUID(newUsername);
    
    // Check admin status after username change
    checkAdminStatus();
    
    // Then update the state and trigger presence refresh
    updatePresence().then(() => {
        // Publish name change message
        if (oldName) {
            const systemMessage = {
                type: 'system',
                text: `${oldName} changed their name to ${newUsername}`,
                time: new Date().toLocaleTimeString(),
                id: `name-change-${Date.now()}`
            };
            pubnub.publish({
                channel: CHANNEL,
                message: systemMessage
            });
        }
        
        // Update local users list
        if (state.users.has(oldName)) {
            state.users.delete(oldName);
        }
        state.users.set(newUsername, {
            name: newUsername,
            status: 'online'
        });
        updateUsersList();
        
        // Force refresh of all users
        refreshUsersList();
    });
});

function updatePresence() {
    return new Promise((resolve, reject) => {
        console.log('Updating presence for user:', state.currentUsername);
        pubnub.setState({
            state: {
                name: state.currentUsername,
                status: 'online',
                timestamp: Date.now()
            },
            channels: [CHANNEL],
            uuid: state.currentUsername
        }, (status, response) => {
            if (status.error) {
                console.error('Set state error:', status);
                reject(status);
            } else {
                console.log('Presence state updated:', response);
                resolve(response);
            }
        });
    });
}

function refreshUsersList() {
    console.log('Refreshing users list...');
    pubnub.hereNow({
        channels: [CHANNEL],
        includeUUIDs: true,
        includeState: true
    }, (status, response) => {
        if (status.error) {
            console.error('Error fetching users:', status);
            return;
        }
        console.log('hereNow response:', response);
        
        state.users.clear();

        if (response?.channels?.[CHANNEL]?.occupants) {
            response.channels[CHANNEL].occupants.forEach(occ => {
                const uuid = occ.uuid;
                const userState = occ.state || {};
                const name = userState.name || uuid;
                
                if (name && name !== 'undefined' && name !== 'null') {
                    state.users.set(name, {
                        name: name,
                        uuid: uuid,
                        status: userState.status || 'online',
                        timestamp: userState.timestamp || Date.now()
                    });
                }
            });
        }

        if (state.currentUsername && state.currentUsername !== 'undefined' && state.currentUsername !== 'null') {
            state.users.set(state.currentUsername, {
                name: state.currentUsername,
                uuid: state.currentUsername,
                status: 'online',
                timestamp: Date.now()
            });
        }

        updateUsersList();
    });
}

function updateUsersList() {
    console.log('Updating users list UI with users:', Array.from(state.users.entries()));
    usersList.innerHTML = '';
    state.users.forEach((user, name) => {
        if (name && name !== 'undefined' && name !== 'null') {
            const displayName = name === state.currentUsername ? `${name} (You)` : name;
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.innerHTML = `
                <div class="status ${user.status === 'online' ? 'online' : ''}"></div>
                <div class="name">${displayName}</div>
            `;
            usersList.appendChild(userDiv);
        }
    });
}

function initPubNub() {
    pubnub.addListener({
        status(event) {
            if (event.category === 'PNConnectedCategory') {
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'connection-status connected visible';

                messageInput.disabled = false;
                usernameInput.disabled = false;
                sendButton.disabled = false;

                // Update presence and refresh users list
                updatePresence().then(() => {
                    refreshUsersList();
                });
                loadHistory();

                setTimeout(() => {
                    connectionStatus.className = 'connection-status';
                }, CONFIG.connectionStatusDuration);
            } else if (event.category === 'PNNetworkDownCategory') {
                connectionStatus.textContent = 'Connection lost. Reconnecting...';
                connectionStatus.className = 'connection-status error visible';
                messageInput.disabled = true;
                sendButton.disabled = true;
            } else if (event.category === 'PNNetworkUpCategory') {
                connectionStatus.textContent = 'Reconnecting...';
                connectionStatus.className = 'connection-status visible';
            } else if (event.category === 'PNReconnectedCategory') {
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'connection-status connected visible';
                messageInput.disabled = false;
                sendButton.disabled = false;
                updatePresence().then(() => {
                    refreshUsersList();
                });

                setTimeout(() => {
                    connectionStatus.className = 'connection-status';
                }, CONFIG.connectionStatusDuration);
            }
        },
        message(event) {
            if (event.channel === CHANNEL) {
                handleNewMessage(event.message);
            } else if (event.channel === TYPING_CHANNEL) {
                handleTypingIndicator(event.message);
            }
        },
        presence(event) {
            console.log('Presence event:', event);
            
            switch (event.action) {
                case 'join':
                    console.log('User joined:', event);
                    if (event.state) {
                        const name = event.state.name || event.uuid;
                        if (name && name !== 'undefined' && name !== 'null') {
                            state.users.set(name, {
                                name: name,
                                uuid: event.uuid,
                                status: event.state.status || 'online',
                                timestamp: event.state.timestamp || Date.now()
                            });
                            updateUsersList();
                        }
                    }
                    break;
                    
                case 'leave':
                case 'timeout':
                    console.log('User left/timeout:', event);
                    let userName = event.uuid;
                    for (let [name, user] of state.users.entries()) {
                        if (user.uuid === event.uuid || name === event.uuid) {
                            userName = name;
                            break;
                        }
                    }
                    
                    state.users.delete(userName);
                    updateUsersList();
                    
                    pubnub.publish({
                        channel: CHANNEL,
                        message: {
                            type: 'system',
                            text: `${userName} has left the chat`,
                            time: new Date().toLocaleTimeString()
                        }
                    });
                    break;
                    
                case 'state-change':
                    console.log('User state changed:', event);
                    if (event.state) {
                        const name = event.state.name || event.uuid;
                        if (name && name !== 'undefined' && name !== 'null') {
                            state.users.set(name, {
                                name: name,
                                uuid: event.uuid,
                                status: event.state.status || 'online',
                                timestamp: event.state.timestamp || Date.now()
                            });
                            updateUsersList();
                        }
                    }
                    break;
            }
        }
    });

    connectionStatus.textContent = 'Connecting...';
    connectionStatus.className = 'connection-status visible';

    pubnub.subscribe({
        channels: [CHANNEL, TYPING_CHANNEL],
        withPresence: true
    });
}

function sendMessage() {
    const text = messageInput.value.trim();
    const username = state.currentUsername;

    if (!text) return;

    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sendButton.disabled = true;

    pubnub.publish({
        channel: CHANNEL,
        message: {
            id: messageId,
            text,
            user: username,
            time: new Date().toLocaleTimeString()
        }
    }, (status, response) => {
        sendButton.disabled = false;
        messageInput.value = '';
        publishTypingStatus(false);

        if (status.error || !response.timetoken) {
            console.error('Failed to publish message:', status);
            return;
        }

        const message = {
            id: messageId,
            text,
            user: username,
            time: new Date().toLocaleTimeString(),
            timetoken: response.timetoken
        };
        handleNewMessage(message);
    });
}

function loadHistory() {
    pubnub.fetchMessages({
        channels: [CHANNEL],
        count: 100,
        includeTimetoken: true,
        start: '0', // Start from the beginning
        end: (new Date()).getTime() * 10000 // Current time in PubNub timetoken format
    }, (status, response) => {
        if (status.error) {
            console.error('History load error:', status);
            return;
        }

        const messages = response.channels[CHANNEL];
        if (!messages || !messages.length) return;

        messages.forEach(msg => {
            try {
                if (!msg.message) {
                    console.log('Skipping empty message:', msg);
                    return;
                }

                const entry = msg.message;
                
                // Handle different message types
                switch (entry.type) {
                    case 'name_change':
                        if (!entry.oldName || !entry.newName) {
                            console.log('Skipping invalid name change message:', entry);
                            return;
                        }
                        handleNewMessage({
                            id: `history-${msg.timetoken}`,
                            text: `${entry.oldName} changed their name to ${entry.newName}`,
                            user: 'System',
                            time: entry.time || new Date(parseInt(msg.timetoken / 10000)).toLocaleTimeString(),
                            timetoken: msg.timetoken,
                            type: 'system'
                        }, true);
                        break;
                        
                    case 'system':
                        if (!entry.text) {
                            console.log('Skipping invalid system message:', entry);
                            return;
                        }
                        handleNewMessage({
                            id: `history-${msg.timetoken}`,
                            text: entry.text,
                            user: 'System',
                            time: entry.time || new Date(parseInt(msg.timetoken / 10000)).toLocaleTimeString(),
                            timetoken: msg.timetoken,
                            type: 'system'
                        }, true);
                        break;
                        
                    default:
                        // Handle regular chat messages
                        if (!entry.text || !entry.user) {
                            console.log('Skipping invalid chat message:', entry);
                            return;
                        }
                        handleNewMessage({
                            id: entry.id || `history-${msg.timetoken}`,
                            text: entry.text,
                            user: entry.user,
                            time: entry.time || new Date(parseInt(msg.timetoken / 10000)).toLocaleTimeString(),
                            timetoken: msg.timetoken
                        }, true);
                }
            } catch (error) {
                console.error('Error processing message:', error, msg);
            }
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function handleNewMessage(messageData, isHistory = false) {
    if (!messageData) {
        console.log('Skipping null/undefined message');
        return;
    }

    // Skip validation for system messages
    if (messageData.type !== 'system') {
        // Validate required message data
        if (!messageData.text || !messageData.user || !messageData.time) {
            console.log('Skipping invalid message data:', messageData);
            return;
        }
    }

    if (messageData.id && state.messageIds.has(messageData.id)) {
        console.log('Skipping duplicate message:', messageData.id);
        return; // Skip duplicate messages
    }

    const messageElement = document.createElement('div');
    const isOwnMessage = messageData.user === state.currentUsername;
    messageElement.className = `message ${isOwnMessage ? 'own' : 'other'} ${messageData.type === 'system' ? 'system' : ''}`;
    
    // Add message ID and timetoken as data attributes
    if (messageData.id) {
        messageElement.setAttribute('data-message-id', messageData.id);
    }
    if (messageData.timetoken) {
        messageElement.setAttribute('data-timetoken', messageData.timetoken);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (messageData.type === 'system') {
        const textDiv = document.createElement('div');
        textDiv.className = 'text system-text';
        textDiv.textContent = messageData.text;
        contentDiv.appendChild(textDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'time';
        timeDiv.textContent = messageData.time;
        contentDiv.appendChild(timeDiv);
    } else {
        if (!isOwnMessage) {
            const usernameDiv = document.createElement('div');
            usernameDiv.className = 'username';
            usernameDiv.textContent = messageData.user;
            usernameDiv.style.color = getColor(messageData.user);
            contentDiv.appendChild(usernameDiv);
        }

        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        
        // Format emojis in text
        const formattedText = messageData.text.replace(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}])/gu, match => {
            return `<span role="img" aria-label="emoji">${match}</span>`;
        });
        
        textDiv.innerHTML = formattedText;
        contentDiv.appendChild(textDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'time';
        timeDiv.textContent = messageData.time;
        contentDiv.appendChild(timeDiv);
    }

    messageElement.appendChild(contentDiv);
    
    if (!isHistory) {
        messageElement.style.animation = 'fadeInUp 0.3s ease-out';
    }
    
    if (messageData.id) {
        state.messageIds.add(messageData.id);
    }
    
    messagesContainer.appendChild(messageElement);
    
    // Scroll to bottom if we're already near the bottom
    const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
    if (isNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function handleTypingIndicator(data) {
    if (data.typing) {
        state.typingUsers.add(data.user);
    } else {
        state.typingUsers.delete(data.user);
    }
    updateTypingStatus();
}

function updateTypingStatus() {
    // Filter out current user from typing users
    const otherTypingUsers = Array.from(state.typingUsers).filter(user => user !== state.currentUsername);
    
    typingStatus.textContent =
        otherTypingUsers.length === 0 ? '' :
        otherTypingUsers.length === 1 ? `${otherTypingUsers[0]} is typing...` :
        otherTypingUsers.length === 2 ? `${otherTypingUsers[0]} and ${otherTypingUsers[1]} are typing...` :
        'Several people are typing...';
}

function publishTypingStatus(isTyping) {
    pubnub.publish({
        channel: TYPING_CHANNEL,
        message: {
            user: state.currentUsername,
            typing: isTyping
        }
    });
}

// Theme logic
function applyTheme(theme) {
    // Set theme
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chat-theme', theme);
    
    // Add transition class for smooth change
    requestAnimationFrame(() => {
        document.documentElement.classList.add('theme-transition');
        
        // Remove transition class after animation
        setTimeout(() => {
            document.documentElement.classList.remove('theme-transition');
        }, 300);
    });
}

// Toggle theme
themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Message input handling
messageInput.addEventListener('keypress', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent form submission
        sendMessage();
    }
});

// Typing indicator
messageInput.addEventListener('input', () => {
    clearTimeout(state.typingTimeout);
    publishTypingStatus(true);
    state.typingTimeout = setTimeout(() => publishTypingStatus(false), 1500);
});

// Form submission handling
document.getElementById('message-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); // Prevent form submission
    return false;
});

// Send button click handler
sendButton.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent any default behavior
    sendMessage();
});

// Init
initPubNub();

// Check for saved theme preference
const savedThemePreference = localStorage.getItem('theme');
if (savedThemePreference) {
    html.setAttribute('data-theme', savedThemePreference);
    themeToggle.checked = savedThemePreference === 'light';
}

// Theme toggle handler
themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// Initialize admin panel immediately
createAdminPanel();
checkAdminStatus();

function getColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);  // Make sure hue is positive
    return `hsl(${hue}, 70%, 45%)`;
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getColor };
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Remove the message after animation completes (2.5s = 2s delay + 0.5s fade)
    setTimeout(() => {
        messageDiv.remove();
    }, 2500);
    
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Update clear history functionality to actually delete messages from PubNub
clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
        try {
            await pubnub.deleteMessages({
                channel: CHANNEL,
                start: '0',
                end: (new Date()).getTime() * 10000
            });

            messagesContainer.innerHTML = '';
            state.messageIds.clear();
            
            const systemMessage = {
                type: 'system',
                text: 'Chat history has been cleared',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(systemMessage);
        } catch (error) {
            console.error('Error deleting messages:', error);
            const errorMessage = {
                type: 'system',
                text: 'Failed to clear chat history. Please try again.',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(errorMessage);
        }
    }
});

// Check if current user is admin
function checkAdminStatus() {
    adminState.isAdmin = state.currentUsername === ADMIN_USERNAME;
    updateAdminPanel();
}

function updateAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) return;
    
    if (adminState.isAdmin) {
        adminPanel.classList.add('visible');
    } else {
        adminPanel.classList.remove('visible');
    }
}

// Create and update admin panel
function createAdminPanel() {
    const adminPanel = document.createElement('div');
    adminPanel.id = 'admin-panel';
    adminPanel.className = 'admin-panel';
    
    adminPanel.innerHTML = `
        <div class="admin-header">
            <h3>Admin Panel</h3>
        </div>
        <div class="admin-controls">
            <button id="admin-clear-history" class="admin-btn">
                <span>🧹</span> Clear Chat History
            </button>
            <button id="admin-download-logs" class="admin-btn">
                <span>💾</span> Download Chat Logs
            </button>
        </div>
    `;
    
    document.body.appendChild(adminPanel);
    
    // Add event listeners for admin buttons
    document.getElementById('admin-clear-history').addEventListener('click', () => {
        if (!adminState.isAdmin) return;
        clearChatHistory();
    });
    
    document.getElementById('admin-download-logs').addEventListener('click', async () => {
        if (!adminState.isAdmin) return;
        
        try {
            const messages = await pubnub.fetchMessages({
                channels: [CHANNEL],
                count: 100,
                includeTimetoken: true
            });

            const chatHistory = messages.channels[CHANNEL].map(msg => {
                const entry = msg.message;
                const time = new Date(parseInt(msg.timetoken / 10000)).toISOString();
                return `[${time}] ${entry.user}: ${entry.text}`;
            }).join('\n');

            const blob = new Blob([chatHistory], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat-logs-${new Date().toISOString()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            const systemMessage = {
                type: 'system',
                text: 'Admin logs have been downloaded',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(systemMessage);
        } catch (error) {
            console.error('Error downloading logs:', error);
            const errorMessage = {
                type: 'system',
                text: 'Failed to download chat logs. Please try again.',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(errorMessage);
        }
    });
    
    // Initial visibility check
    updateAdminPanel();
}

// Modified clear history function
async function clearChatHistory() {
    if (!adminState.isAdmin) {
        addSystemMessage('Only admin can clear chat history');
        return;
    }

    if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
        try {
            await pubnub.deleteMessages({
                channel: CHANNEL,
                start: '0',
                end: (new Date()).getTime() * 10000
            });

            messagesContainer.innerHTML = '';
            state.messageIds.clear();
            
            const systemMessage = {
                type: 'system',
                text: 'Chat history has been cleared by admin',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(systemMessage);
        } catch (error) {
            console.error('Error deleting messages:', error);
            const errorMessage = {
                type: 'system',
                text: 'Failed to clear chat history. Please try again.',
                time: new Date().toLocaleTimeString()
            };
            handleNewMessage(errorMessage);
        }
    }
}
