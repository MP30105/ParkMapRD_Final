import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SearchFilters from '../SearchFilters';
import { mockApiResponse, cleanup } from './testUtils';

// Mock CSS import
jest.mock('../SearchFilters.css', () => ({}));

describe('SearchFilters Component', () => {
  const mockOnFiltersChange = jest.fn();
  
  beforeEach(() => {
    cleanup();
    mockOnFiltersChange.mockClear();
    // Mock amenities API response
    mockApiResponse({
      results: [
        { id: 1, name: 'Seguridad 24/7', category: 'security', weight: 0.9 },
        { id: 2, name: 'Techado', category: 'comfort', weight: 0.7 },
        { id: 3, name: 'Cámaras de vigilancia', category: 'security', weight: 0.8 }
      ]
    });
  });

  test('renders search filters component', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    expect(screen.getByText('Filtros de Búsqueda')).toBeInTheDocument();
    expect(screen.getByText('Ubicación')).toBeInTheDocument();
    expect(screen.getByText('Precio')).toBeInTheDocument();
    expect(screen.getByText('Comodidades')).toBeInTheDocument();
  });

  test('updates location filters', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    const radiusSlider = screen.getByLabelText(/Radio de búsqueda/);
    fireEvent.change(radiusSlider, { target: { value: '2000' } });
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ radius: 2000 })
      );
    });
  });

  test('updates price range filters', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    const minPriceInput = screen.getByLabelText(/Precio mínimo/);
    fireEvent.change(minPriceInput, { target: { value: '10' } });
    
    const maxPriceInput = screen.getByLabelText(/Precio máximo/);
    fireEvent.change(maxPriceInput, { target: { value: '50' } });
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ 
          minPrice: 10,
          maxPrice: 50
        })
      );
    });
  });

  test('filters by availability', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    const availableOnlyCheckbox = screen.getByLabelText(/Solo disponibles/);
    fireEvent.click(availableOnlyCheckbox);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ availableOnly: true })
      );
    });
  });

  test('selects and deselects amenities', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    await waitFor(() => {
      expect(screen.getByText('Seguridad 24/7')).toBeInTheDocument();
    });
    
    const securityAmenity = screen.getByText('Seguridad 24/7');
    fireEvent.click(securityAmenity);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ 
          amenities: expect.arrayContaining([1])
        })
      );
    });
    
    // Deselect the amenity
    fireEvent.click(securityAmenity);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ 
          amenities: expect.not.arrayContaining([1])
        })
      );
    });
  });

  test('clears all filters', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    // First set some filters
    const availableOnlyCheckbox = screen.getByLabelText(/Solo disponibles/);
    fireEvent.click(availableOnlyCheckbox);
    
    await waitFor(() => {
      expect(screen.getByText('Limpiar Filtros')).toBeInTheDocument();
    });
    
    const clearButton = screen.getByText('Limpiar Filtros');
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        radius: 1000,
        minPrice: '',
        maxPrice: '',
        amenities: [],
        availableOnly: false,
        sortBy: 'distance'
      });
    });
  });

  test('saves search preferences', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    // Mock API response for saving preferences
    mockApiResponse({ message: 'Preferences saved successfully' });
    
    await waitFor(() => {
      const saveButton = screen.getByText('Guardar Preferencias');
      fireEvent.click(saveButton);
    });
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/preferences'),
        expect.objectContaining({
          method: 'PUT'
        })
      );
    });
  });

  test('handles API errors when loading amenities', async () => {
    // Mock API error
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Error al cargar comodidades/)).toBeInTheDocument();
    });
  });

  test('groups amenities by category', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    await waitFor(() => {
      expect(screen.getByText('Seguridad')).toBeInTheDocument();
      expect(screen.getByText('Comodidad')).toBeInTheDocument();
    });
  });

  test('applies sorting options', async () => {
    render(<SearchFilters onFiltersChange={mockOnFiltersChange} />);
    
    const sortSelect = screen.getByLabelText(/Ordenar por/);
    fireEvent.change(sortSelect, { target: { value: 'price' } });
    
    await waitFor(() => {
      expect(mockOnFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'price' })
      );
    });
  });
});