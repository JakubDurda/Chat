require('@testing-library/jest-dom');
require('jest-fetch-mock').enableMocks();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock timing functions
jest.useFakeTimers(); 