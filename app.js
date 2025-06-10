// PubNub setup
const pubnub = new PubNub({
    publishKey: 'pub-c-54dd99bb-2b64-496b-9279-4885b113fae6',
    subscribeKey: 'sub-c-3343b2bb-49a7-4c31-895b-cc9c45ab2054',
    uuid: localStorage.getItem('chat-username') || `User-${Math.random().toString(36).substr(2, 9)}`,
    heartbeatInterval: 30,
    presenceTimeout: 60,
    keepAlive: true,
    authKey: 'sec-c-NjkyYmE3MjktYmE3OS00OTRhLWI0MGYtZjM1NzdiNTJmODUz'
});

const CHANNEL = 'chat';
const TYPING_CHANNEL = `${CHANNEL}-typing`;

// DOM Elements
const messageInput = document.getElementById('message');
const usernameInput = document.getElementById('username');
const sendButton = document.getElementById('send-button');
const messagesContainer = document.getElementById('messages');
const connectionStatus = document.getElementById('connection-status');
const typingStatus = document.getElementById('typing-status');
const usersList = document.getElementById('users-list');
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Admin Panel Elements
const adminPanel = document.getElementById('admin-panel');
const clearHistoryBtn = document.getElementById('clear-history');
const exportChatBtn = document.getElementById('export-chat');
const deleteAllMessagesBtn = document.getElementById('delete-all-messages');

// Modal Elements
const dateRangeModal = document.getElementById('date-range-modal');
const cancelClearBtn = document.getElementById('cancel-clear');
const confirmClearBtn = document.getElementById('confirm-clear');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

// Set default date range
const today = new Date();
const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
if (startDateInput && endDateInput) {
    startDateInput.value = sevenDaysAgo.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];
}

let isAdmin = false;

const state = {
    messageIds: new Set(),
    users: new Map(),
    currentUsername: pubnub.getUUID(),
    typingUsers: new Set(),
    typingTimeout: null
};

usernameInput.value = state.currentUsername;
usernameInput.addEventListener('input', e => localStorage.setItem('chat-username', e.target.value));

function checkAdminStatus(username) {
    console.log('Checking admin status for:', username);
    isAdmin = username === 'Admin123';
    console.log('Is admin:', isAdmin);
    
    if (adminPanel) {
        if (isAdmin) {
            adminPanel.classList.add('visible');
            document.body.classList.add('admin');
        } else {
            adminPanel.classList.remove('visible');
            document.body.classList.remove('admin');
        }
    }
}

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
    
    // Check admin status immediately after username change
    checkAdminStatus(newUsername);
    
    // First update PubNub UUID
    pubnub.setUUID(newUsername);
    
    // Then update the state and trigger presence refresh
    updatePresence().then(() => {
        // Publish name change message
        if (oldName) {
            pubnub.publish({
                channel: CHANNEL,
                message: {
                    type: 'name_change',
                    oldName,
                    newName: newUsername,
                    time: new Date().toLocaleTimeString()
                }
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

const CONFIG = {
    connectionStatusDuration: 3000,
};

function initPubNub() {
    pubnub.addListener({
        status(event) {
            if (event.category === 'PNConnectedCategory') {
                connectionStatus.textContent = 'Connected';
                connectionStatus.className = 'connection-status visible';

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
                connectionStatus.className = 'connection-status visible';
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
            timetoken: response.timetoken // ✅ capture timetoken here
        };
        handleNewMessage(message);
    });
}

function loadHistory() {
    pubnub.history({
        channel: CHANNEL,
        count: 100,
        stringifiedTimeToken: true,
    }, (status, response) => {
        if (status.error) {
            console.error('History load error:', status);
            return;
        }

        const messages = response.messages;
        if (!messages || !messages.length) return;

        messages.forEach(msg => {
            try {
                if (!msg.entry) {
                    console.log('Skipping empty message:', msg);
                    return;
                }

                if (typeof msg.entry === 'string') {
                    // Handle legacy string format
                    const [timestamp, user, text] = msg.entry.split('|');
                    if (!timestamp || !user || !text) {
                        console.log('Skipping invalid legacy message format:', msg.entry);
                        return;
                    }
                    handleNewMessage({
                        id: `history-${msg.timetoken}`,
                        time: new Date(parseInt(timestamp)).toLocaleTimeString(),
                        user: user,
                        text: text,
                        timetoken: msg.timetoken
                    }, true);
                } else if (typeof msg.entry === 'object' && msg.entry !== null) {
                    const entry = msg.entry;
                    
                    // Skip empty objects
                    if (Object.keys(entry).length === 0) {
                        console.log('Skipping empty object message:', entry);
                        return;
                    }
                    
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
                            
                        case 'delete_all':
                            if (!entry.deletedBy) {
                                console.log('Skipping invalid delete all message:', entry);
                                return;
                            }
                            handleNewMessage({
                                id: `history-${msg.timetoken}`,
                                text: `All messages were deleted by ${entry.deletedBy}`,
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
                } else {
                    console.log('Skipping unknown message format:', msg);
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

    // Handle delete_all messages
    if (messageData.type === 'delete_all') {
        console.log('Received delete_all message, clearing chat');
        messagesContainer.innerHTML = '';
        state.messageIds.clear();
        return;
    }

    if (messageData.type === 'delete_message') {
        console.log('Skipping delete message');
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

    const contentHtml = `
        <div class="content">
            ${!isOwnMessage && messageData.type !== 'system' ? `<div class="username">${messageData.user}</div>` : ''}
            <div class="text">${messageData.text}</div>
            ${isAdmin && messageData.type !== 'system' ? `
                <button class="delete-message" onclick="deleteMessage('${messageData.id}')">
                    🗑️
                </button>
            ` : ''}
        </div>
        <div class="time">${messageData.time}</div>
    `;

    messageElement.innerHTML = contentHtml;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (messageData.id) {
        state.messageIds.add(messageData.id);
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
    // Add transition class
    document.documentElement.classList.add('theme-transition');
    
    // Force a reflow
    document.documentElement.offsetHeight;
    
    // Apply theme
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chat-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    
    // Remove transition class after transition completes
    setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
    }, 300);
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
document.getElementById('message-form').addEventListener('submit', (e) => {
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

// Export chat functionality
function exportChat() {
    // Get selected date range
    const startDate = new Date(startDateInput.value);
    startDate.setHours(0, 0, 0, 0); // Start of day
    
    const endDate = new Date(endDateInput.value);
    endDate.setHours(23, 59, 59, 999); // End of day

    // Validate date range
    if (startDate > endDate) {
        alert('Start date must be before end date');
        return;
    }

    pubnub.history({
        channel: CHANNEL,
        count: 100,
        stringifiedTimeToken: true,
        start: endDate.getTime() * 10000,
        end: startDate.getTime() * 10000
    }, (status, response) => {
        if (status.error) {
            console.error('Export error:', status);
            return;
        }

        const dateRange = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
        let chatText = `Chat History (${dateRange}):\n\n`;
        
        response.messages.forEach(msg => {
            const entry = msg.entry;
            const messageTime = new Date(entry.time);
            
            // Only include messages within date range
            if (messageTime >= startDate && messageTime <= endDate) {
                chatText += `[${entry.time}] ${entry.user}: ${entry.text}\n`;
            }
        });

        if (chatText === `Chat History (${dateRange}):\n\n`) {
            chatText += 'No messages in the selected date range.';
        }

        // Create and trigger download
        const blob = new Blob([chatText], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = `chat-history-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.txt`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    });
}

// Add export button event listener if it doesn't exist
if (exportChatBtn) {
    exportChatBtn.addEventListener('click', exportChat);
}

// Add initial admin check when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, checking initial admin status');
    const currentUsername = localStorage.getItem('chat-username') || state.currentUsername;
    checkAdminStatus(currentUsername);
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    
    // Initialize admin status
    const currentUsername = localStorage.getItem('chat-username') || state.currentUsername;
    checkAdminStatus(currentUsername);

    // Initialize admin buttons
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearHistory);
    }

    if (deleteAllMessagesBtn) {
        deleteAllMessagesBtn.addEventListener('click', deleteAllMessages);
    }

    // Initialize modal listeners
    initializeModalListeners();
});

function deleteAllMessages() {
    if (!isAdmin) return;
    
    if (confirm('Are you sure you want to delete all messages? This cannot be undone.')) {
        // First clear local messages
        messagesContainer.innerHTML = '';
        state.messageIds.clear();

        // Delete messages from storage using REST API
        const timestamp = Math.floor(Date.now() / 1000);
        fetch(`https://ps.pndsn.com/v1/history/sub-key/${pubnub.getSubscribeKey()}/channel/${CHANNEL}?uuid=admin&timestamp=${timestamp}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${pubnub.getAuthKey()}`
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('Delete response:', data);
            
            // Notify other users
            pubnub.publish({
                channel: CHANNEL,
                message: {
                    type: 'delete_all',
                    deletedBy: state.currentUsername,
                    time: new Date().toLocaleTimeString()
                }
            }, (status) => {
                if (status.error) {
                    console.error('Failed to publish delete_all message:', status);
                    return;
                }
                console.log('Successfully deleted all messages and notified users');
            });
        })
        .catch(error => {
            console.error('Failed to delete messages:', error);
        });
    }
}

function clearHistory() {
    if (!isAdmin) {
        alert('Only administrators can clear chat history.');
        return;
    }

    if (confirm('Are you sure you want to delete all messages? This cannot be undone.')) {
        // First clear local messages
        messagesContainer.innerHTML = '';
        state.messageIds.clear();

        // Delete messages from storage using REST API
        const timestamp = Math.floor(Date.now() / 1000);
        fetch(`https://ps.pndsn.com/v1/history/sub-key/${pubnub.getSubscribeKey()}/channel/${CHANNEL}?uuid=admin&timestamp=${timestamp}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${pubnub.getAuthKey()}`
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('Delete response:', data);
            
            // Notify other users
            pubnub.publish({
                channel: CHANNEL,
                message: {
                    type: 'delete_all',
                    deletedBy: state.currentUsername,
                    time: new Date().toLocaleTimeString()
                }
            }, (status) => {
                if (status.error) {
                    console.error('Failed to publish delete_all message:', status);
                    return;
                }
                console.log('Successfully deleted all messages and notified users');
            });
        })
        .catch(error => {
            console.error('Failed to delete messages:', error);
        });
    }
}

function deleteMessage(messageId) {
    if (!isAdmin) {
        alert('Only administrators can delete messages.');
        return;
    }

    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }

    // Find the message element
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found:', messageId);
        return;
    }

    // Get the message timetoken from the element
    const timetoken = messageElement.getAttribute('data-timetoken');
    if (!timetoken) {
        console.error('Message timetoken not found:', messageId);
        return;
    }

    // Delete the message using PubNub
    pubnub.deleteMessages({
        channel: CHANNEL,
        start: timetoken,
        end: timetoken
    }, (status) => {
        if (status.error) {
            console.error('Delete error:', status);
            alert('Failed to delete message. Please try again.');
            return;
        }

        // Remove message from UI
        messageElement.remove();
        // Remove from tracked messages
        state.messageIds.delete(messageId);
    });
}

// Initialize modal event listeners
function initializeModalListeners() {
    console.log('Initializing modal listeners');
    console.log('Modal elements:', { dateRangeModal, cancelClearBtn, confirmClearBtn });

    if (cancelClearBtn) {
        cancelClearBtn.addEventListener('click', () => {
            console.log('Cancel clicked');
            if (dateRangeModal) {
                dateRangeModal.classList.remove('show');
            }
        });
    }

    if (dateRangeModal) {
        dateRangeModal.addEventListener('click', (e) => {
            if (e.target === dateRangeModal) {
                dateRangeModal.classList.remove('show');
            }
        });
    }

    if (confirmClearBtn) {
        confirmClearBtn.addEventListener('click', () => {
            const startDate = new Date(startDateInput.value);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(endDateInput.value);
            endDate.setHours(23, 59, 59, 999);

            if (startDate > endDate) {
                alert('Start date must be before end date');
                return;
            }

            const dateRange = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
            if (!confirm(`Are you sure you want to clear all messages from ${dateRange}?`)) {
                return;
            }

            // Delete messages from storage using REST API
            const timestamp = Math.floor(Date.now() / 1000);
            const start = Math.floor(startDate.getTime() / 1000);
            const end = Math.floor(endDate.getTime() / 1000);

            fetch(`https://ps.pndsn.com/v1/history/sub-key/${pubnub.getSubscribeKey()}/channel/${CHANNEL}?uuid=admin&start=${start}&end=${end}&timestamp=${timestamp}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${pubnub.getAuthKey()}`
                }
            })
            .then(response => response.json())
            .then(data => {
                console.log('Delete response:', data);
                
                // Clear local messages
                messagesContainer.innerHTML = '';
                state.messageIds.clear();

                // Notify other users
                pubnub.publish({
                    channel: CHANNEL,
                    message: {
                        type: 'delete_all',
                        deletedBy: state.currentUsername,
                        time: new Date().toLocaleTimeString()
                    }
                }, (status) => {
                    if (status.error) {
                        console.error('Failed to publish delete_all message:', status);
                        return;
                    }
                    console.log('Successfully deleted messages and notified users');
                    dateRangeModal.classList.remove('show');
                });
            })
            .catch(error => {
                console.error('Failed to delete messages:', error);
            });
        });
    }
}

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
