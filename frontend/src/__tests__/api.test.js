import { apiGet, apiPost, apiPut, apiDelete, attachAuth, backendHealth } from '../api';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Module', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  afterEach(() => {
    fetch.mockRestore?.();
  });

  describe('apiGet', () => {
    test('should make GET request successfully', async () => {
      const mockData = { id: 1, name: 'Test' };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockData
      });

      const result = await apiGet('test-endpoint');
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/test-endpoint',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(mockData);
    });

    test('should handle GET request with headers', async () => {
      const mockData = { success: true };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockData
      });

      const customHeaders = { Authorization: 'Bearer token123' };
      await apiGet('protected-endpoint', customHeaders);
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/protected-endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          })
        })
      );
    });
  });

  describe('apiPost', () => {
    test('should make POST request with body', async () => {
      const mockResponse = { id: 123, created: true };
      const requestBody = { name: 'Test Item', value: 42 };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockResponse
      });

      const result = await apiPost('create-item', requestBody);
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/create-item',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('apiPut', () => {
    test('should make PUT request with body', async () => {
      const mockResponse = { id: 123, updated: true };
      const updateData = { name: 'Updated Item' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockResponse
      });

      const result = await apiPut('update-item/123', updateData);
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/update-item/123',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updateData)
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('apiDelete', () => {
    test('should make DELETE request', async () => {
      const mockResponse = { deleted: true };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockResponse
      });

      const result = await apiDelete('delete-item/123');
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/delete-item/123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('Error Handling', () => {
    test('should handle HTTP errors', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Resource not found'
      });

      await expect(apiGet('non-existent')).rejects.toThrow('HTTP 404 Not Found');
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(apiGet('test')).rejects.toThrow('Error de conexión');
    });

    test('should handle offline mode', async () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      await expect(apiGet('test')).rejects.toThrow('Sin conexión a Internet');
      
      // Restore
      navigator.onLine = true;
    });

    test('should handle service worker offline responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service is offline'
      });

      await expect(apiGet('test')).rejects.toThrow('Servicio no disponible');
    });
  });

  describe('attachAuth', () => {
    test('should return authorization header with token', () => {
      const token = 'test-jwt-token';
      const result = attachAuth(token);
      
      expect(result).toEqual({
        Authorization: 'Bearer test-jwt-token'
      });
    });

    test('should return empty object for null token', () => {
      const result = attachAuth(null);
      expect(result).toEqual({});
    });

    test('should return empty object for undefined token', () => {
      const result = attachAuth(undefined);
      expect(result).toEqual({});
    });
  });

  describe('backendHealth', () => {
    test('should return true for healthy backend', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => []
      });

      const result = await backendHealth();
      expect(result).toBe(true);
    });

    test('should return false for unhealthy backend', async () => {
      fetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await backendHealth();
      expect(result).toBe(false);
    });
  });

  describe('Response Content Types', () => {
    test('should handle JSON responses', async () => {
      const mockData = { test: 'data' };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => mockData
      });

      const result = await apiGet('test');
      expect(result).toEqual(mockData);
    });

    test('should handle text responses', async () => {
      const mockText = 'Plain text response';
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => mockText
      });

      const result = await apiGet('test');
      expect(result).toEqual(mockText);
    });
  });
});
