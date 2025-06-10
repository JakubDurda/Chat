require('@testing-library/jest-dom');
require('jest-fetch-mock').enableMocks();

// Mock PubNub
global.PubNub = class PubNub {
    constructor() {}
    subscribe() {}
    publish() {}
    addListener() {}
    getUUID() { return 'test-user'; }
};

// Mock localStorage
global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn()
};

// Mock DOM elements
document.body.innerHTML = `
    <div id="messages"></div>
    <input id="message" />
    <input id="username" />
    <button id="send-button"></button>
    <div id="connection-status"></div>
    <div id="typing-status"></div>
    <div id="users-list"></div>
    <button id="theme-toggle">🌙</button>
`;

// Mock document.documentElement
Object.defineProperty(document, 'documentElement', {
    value: document.createElement('html')
});

// Mock window
global.window = {
    location: {
        href: 'http://localhost'
    }
};

// Mock timing functions
jest.useFakeTimers(); 