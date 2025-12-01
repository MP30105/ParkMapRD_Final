import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock implementations for testing
export const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock geolocation API
const mockGeolocation = {
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn()
};

Object.defineProperty(global.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Test utilities
export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  licensePlate: 'TEST123'
};

export const mockToken = 'mock-jwt-token-12345';

export const mockParking = {
  id: 'parking-123',
  name: 'Test Parking',
  lat: 18.4861,
  lon: -69.9312,
  hourlyRate: 25,
  availability: 10,
  totalSpaces: 50
};

export const mockApiResponse = (data, ok = true) => {
  mockFetch.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 400,
    json: async () => data,
    text: async () => JSON.stringify(data)
  });
};

export const mockApiError = (message = 'API Error', status = 500) => {
  mockFetch.mockRejectedValueOnce(new Error(message));
};

export const renderWithProps = (Component, props = {}) => {
  const defaultProps = {
    token: mockToken,
    user: mockUser,
    ...props
  };
  
  return render(<Component {...defaultProps} />);
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
global.sessionStorage = localStorageMock;

// Cleanup function
export const cleanup = () => {
  mockFetch.mockClear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  mockGeolocation.getCurrentPosition.mockClear();
  mockGeolocation.watchPosition.mockClear();
};