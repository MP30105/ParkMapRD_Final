import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AutoCheckout from '../AutoCheckout';
import { mockApiResponse, mockApiError, cleanup, mockToken, mockUser } from './testUtils';

// Mock the CSS import
jest.mock('../AutoCheckout.css', () => ({}));

describe('AutoCheckout Component', () => {
  beforeEach(() => {
    cleanup();
    // Mock successful API responses by default
    mockApiResponse({ data: [] }); // for tickets
    mockApiResponse({ data: [] }); // for history
    mockApiResponse({ data: [] }); // for notifications
  });

  test('renders auto-checkout component with tabs', async () => {
    render(<AutoCheckout token={mockToken} />);
    
    expect(screen.getByText('Auto-Checkout')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
    expect(screen.getByText('Notificaciones')).toBeInTheDocument();
  });

  test('switches between tabs correctly', async () => {
    render(<AutoCheckout token={mockToken} />);
    
    // Default tab should be 'status'
    expect(screen.getByText('Estado de Seguimiento')).toBeInTheDocument();
    
    // Click on history tab
    fireEvent.click(screen.getByText('Historial'));
    await waitFor(() => {
      expect(screen.getByText('Historial de Salida Automática')).toBeInTheDocument();
    });
    
    // Click on notifications tab
    fireEvent.click(screen.getByText('Notificaciones'));
    await waitFor(() => {
      expect(screen.getByText('Notificaciones de Auto-Checkout')).toBeInTheDocument();
    });
  });

  test('requests location permission', async () => {
    const mockGetCurrentPosition = jest.fn();
    global.navigator.geolocation.getCurrentPosition = mockGetCurrentPosition;
    
    render(<AutoCheckout token={mockToken} />);
    
    const enableButton = screen.getByText('Habilitar Seguimiento');
    fireEvent.click(enableButton);
    
    expect(mockGetCurrentPosition).toHaveBeenCalled();
  });

  test('handles geolocation permission denied', async () => {
    const mockGetCurrentPosition = jest.fn((success, error) => {
      error({ code: 1, message: 'Permission denied' });
    });
    global.navigator.geolocation.getCurrentPosition = mockGetCurrentPosition;
    
    render(<AutoCheckout token={mockToken} />);
    
    const enableButton = screen.getByText('Habilitar Seguimiento');
    fireEvent.click(enableButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Permisos de ubicación denegados/)).toBeInTheDocument();
    });
  });

  test('displays active tickets for manual checkout', async () => {
    const mockTickets = [
      { id: 'ticket-1', parkingName: 'Test Parking', licensePlate: 'ABC123' }
    ];
    mockApiResponse({ data: mockTickets });
    
    render(<AutoCheckout token={mockToken} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test Parking')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
  });

  test('performs manual checkout', async () => {
    const mockTickets = [
      { id: 'ticket-1', parkingName: 'Test Parking', licensePlate: 'ABC123' }
    ];
    mockApiResponse({ data: mockTickets });
    
    render(<AutoCheckout token={mockToken} />);
    
    await waitFor(() => {
      const checkoutButton = screen.getByText('Salir Manualmente');
      fireEvent.click(checkoutButton);
    });
    
    // Should call the API
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auto-checkout/manual/ticket-1'),
        expect.any(Object)
      );
    });
  });

  test('displays checkout history', async () => {
    const mockHistory = [
      {
        id: 'checkout-1',
        parkingName: 'Test Parking',
        exitTime: new Date().toISOString(),
        method: 'geolocation',
        amount: 25.50
      }
    ];
    
    render(<AutoCheckout token={mockToken} />);
    
    // Switch to history tab
    fireEvent.click(screen.getByText('Historial'));
    
    // Mock the history API response
    mockApiResponse({ data: mockHistory });
    
    await waitFor(() => {
      expect(screen.getByText('Test Parking')).toBeInTheDocument();
      expect(screen.getByText('$25.50')).toBeInTheDocument();
      expect(screen.getByText('Geolocalización')).toBeInTheDocument();
    });
  });

  test('handles API errors gracefully', async () => {
    mockApiError('Network error');
    
    render(<AutoCheckout token={mockToken} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Error al cargar tickets activos/)).toBeInTheDocument();
    });
  });

  test('tracks position when enabled', async () => {
    const mockWatchPosition = jest.fn(() => 1);
    global.navigator.geolocation.watchPosition = mockWatchPosition;
    
    render(<AutoCheckout token={mockToken} />);
    
    const enableButton = screen.getByText('Habilitar Seguimiento');
    fireEvent.click(enableButton);
    
    await waitFor(() => {
      expect(mockWatchPosition).toHaveBeenCalled();
    });
  });

  test('stops tracking when disabled', async () => {
    const mockClearWatch = jest.fn();
    global.navigator.geolocation.clearWatch = mockClearWatch;
    
    render(<AutoCheckout token={mockToken} />);
    
    // First enable tracking
    const enableButton = screen.getByText('Habilitar Seguimiento');
    fireEvent.click(enableButton);
    
    await waitFor(() => {
      const disableButton = screen.getByText('Detener Seguimiento');
      fireEvent.click(disableButton);
    });
    
    expect(mockClearWatch).toHaveBeenCalled();
  });
});