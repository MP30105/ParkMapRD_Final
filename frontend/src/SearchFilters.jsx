import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { apiGet, apiPost } from './api';

const SearchFilters = ({ token, onFiltersChange, initialLocation }) => {
  const [amenities, setAmenities] = useState({});
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [filters, setFilters] = useState({
    priceRange: { min: 0, max: 50 },
    radius: 5,
    sortBy: 'distance',
    onlyAvailable: true
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAmenities();
    if (token && initialLocation) {
      loadSuggestions();
    }
  }, [token, initialLocation]);

  useEffect(() => {
    // Notify parent of filter changes
    const searchParams = {
      amenities: selectedAmenities.join(','),
      priceMin: filters.priceRange.min,
      priceMax: filters.priceRange.max,
      radius: filters.radius,
      sortBy: filters.sortBy,
      onlyAvailable: filters.onlyAvailable,
      lat: initialLocation?.lat,
      lng: initialLocation?.lng
    };
    
    onFiltersChange && onFiltersChange(searchParams);
  }, [selectedAmenities, filters, initialLocation, onFiltersChange]);

  const loadAmenities = async () => {
    try {
      const data = await apiGet('parkmaprd/amenities');
      setAmenities(data);
    } catch (error) {
      console.error('Error loading amenities:', error);
    }
  };

  const loadSuggestions = async () => {
    if (!token || !initialLocation) return;
    
    setLoading(true);
    try {
      const data = await apiGet(
        `parkmaprd/search/suggestions?lat=${initialLocation.lat}&lng=${initialLocation.lng}`,
        { Authorization: `Bearer ${token}` }
      );
      setSuggestions(data);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAmenity = (amenityId) => {
    setSelectedAmenities(prev => 
      prev.includes(amenityId)
        ? prev.filter(id => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const updateFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setSelectedAmenities([]);
    setFilters({
      priceRange: { min: 0, max: 50 },
      radius: 5,
      sortBy: 'distance',
      onlyAvailable: true
    });
  };

  const { showToast } = useToast();

  const savePreferences = async () => {
    if (!token) return;
    
    try {
      await apiPost('parkmaprd/search/preferences', {
        preferredAmenities: selectedAmenities,
        maxDistance: filters.radius,
        priceRange: `${filters.priceRange.min}-${filters.priceRange.max}`,
        defaultSort: filters.sortBy
      }, { Authorization: `Bearer ${token}` });
      
      showToast('success', 'Preferencias guardadas exitosamente');
    } catch (error) {
      console.error('Error saving preferences:', error);
      showToast('error', 'Error al guardar preferencias');
    }
  };

  const applySuggestionFilter = (suggestion) => {
    // Apply filter based on suggestion type
    if (suggestion.type === 'budget') {
      updateFilter('priceRange', { min: 0, max: 5 });
      updateFilter('sortBy', 'price');
    } else if (suggestion.type === 'nearby') {
      updateFilter('radius', 2);
      updateFilter('sortBy', 'distance');
    } else if (suggestion.type === 'popular') {
      updateFilter('sortBy', 'rating');
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      security: '🛡️',
      weather: '🌤️',
      accessibility: '♿',
      services: '🔧',
      convenience: '⚡'
    };
    return icons[category] || '📍';
  };

  const getCategoryName = (category) => {
    const names = {
      security: 'Seguridad',
      weather: 'Protección Climática',
      accessibility: 'Accesibilidad',
      services: 'Servicios',
      convenience: 'Conveniencia'
    };
    return names[category] || category;
  };

  return (
    <div className="search-filters" style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      marginBottom: '20px'
    }}>
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '15px 20px',
          background: 'linear-gradient(135deg, #3498db, #2980b9)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '18px' }}>🔍 Búsqueda Inteligente</h3>
          <p style={{ margin: '5px 0 0', fontSize: '14px', opacity: 0.9 }}>
            {selectedAmenities.length > 0 
              ? `${selectedAmenities.length} filtros activos`
              : 'Filtros avanzados'
            }
          </p>
        </div>
        <span style={{ fontSize: '20px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
          ▼
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: '20px' }}>
          {/* Quick Suggestions */}
          {suggestions && !loading && (
            <div style={{ marginBottom: '25px' }}>
              <h4 style={{ margin: '0 0 15px', fontSize: '16px', color: '#333' }}>🎯 Sugerencias Rápidas</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {suggestions.nearby?.length > 0 && (
                  <button
                    onClick={() => applySuggestionFilter({ type: 'nearby' })}
                    style={{
                      padding: '8px 12px',
                      background: '#e8f4fd',
                      border: '1px solid #3498db',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#2980b9'
                    }}
                  >
                    📍 Cercanos ({suggestions.nearby.length})
                  </button>
                )}
                {suggestions.budget?.length > 0 && (
                  <button
                    onClick={() => applySuggestionFilter({ type: 'budget' })}
                    style={{
                      padding: '8px 12px',
                      background: '#e8f5e8',
                      border: '1px solid #27ae60',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#27ae60'
                    }}
                  >
                    💰 Económicos ({suggestions.budget.length})
                  </button>
                )}
                {suggestions.popular?.length > 0 && (
                  <button
                    onClick={() => applySuggestionFilter({ type: 'popular' })}
                    style={{
                      padding: '8px 12px',
                      background: '#fdf2e8',
                      border: '1px solid #f39c12',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#e67e22'
                    }}
                  >
                    ⭐ Populares ({suggestions.popular.length})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Price Range - Mejorado: campos de texto */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '16px', color: '#333' }}>💰 Rango de Precios (por hora)</h4>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Mínimo</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                  value={filters.priceRange.min}
                  onChange={(e) => {
                    let val = parseInt(e.target.value) || 0;
                    if (val < 0) val = 0;
                    if (val > filters.priceRange.max) val = filters.priceRange.max;
                    updateFilter('priceRange', { ...filters.priceRange, min: val });
                  }}
                  style={{ width: '80px', padding: '6px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#666' }}>Máximo</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="1"
                  value={filters.priceRange.max}
                  onChange={(e) => {
                    let val = parseInt(e.target.value) || 0;
                    if (val > 50) val = 50;
                    if (val < filters.priceRange.min) val = filters.priceRange.min;
                    updateFilter('priceRange', { ...filters.priceRange, max: val });
                  }}
                  style={{ width: '80px', padding: '6px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>
            </div>
          </div>

          {/* Radius */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '16px', color: '#333' }}>📏 Radio de Búsqueda</h4>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={filters.radius}
              onChange={(e) => updateFilter('radius', parseInt(e.target.value))}
              style={{ width: '100%', marginBottom: '10px' }}
            />
            <div style={{ fontSize: '14px', color: '#666' }}>
              Hasta {filters.radius} km de distancia
            </div>
          </div>

          {/* Sort Options */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '16px', color: '#333' }}>📊 Ordenar por</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { value: 'distance', label: 'Distancia', icon: '📍' },
                { value: 'price', label: 'Precio', icon: '💰' },
                { value: 'rating', label: 'Rating', icon: '⭐' },
                { value: 'amenities', label: 'Amenidades', icon: '🎯' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => updateFilter('sortBy', option.value)}
                  style={{
                    padding: '8px 12px',
                    background: filters.sortBy === option.value ? '#3498db' : '#f8f9fa',
                    color: filters.sortBy === option.value ? 'white' : '#333',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div style={{ marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px', fontSize: '16px', color: '#333' }}>🎯 Características Deseadas</h4>
            {Object.entries(amenities).map(([category, categoryAmenities]) => (
              <div key={category} style={{ marginBottom: '20px' }}>
                <h5 style={{
                  margin: '0 0 10px',
                  fontSize: '14px',
                  color: '#555',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {getCategoryIcon(category)} {getCategoryName(category)}
                </h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {categoryAmenities.map(amenity => (
                    <button
                      key={amenity.id}
                      onClick={() => toggleAmenity(amenity.id)}
                      style={{
                        padding: '6px 10px',
                        background: selectedAmenities.includes(amenity.id) ? '#3498db' : '#f8f9fa',
                        color: selectedAmenities.includes(amenity.id) ? 'white' : '#333',
                        border: '1px solid #ddd',
                        borderRadius: '15px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title={amenity.description}
                    >
                      {amenity.icon} {amenity.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '8px',
            paddingTop: '15px',
            borderTop: '1px solid #eee'
          }}>
            <button
              onClick={clearFilters}
              style={{
                flex: 1,
                padding: '8px 16px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#4b5563'}
              onMouseLeave={(e) => e.target.style.background = '#6b7280'}
            >
              🔄 Limpiar
            </button>
            {token && (
              <button
                onClick={savePreferences}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#059669'}
                onMouseLeave={(e) => e.target.style.background = '#10b981'}
              >
                💾 Guardar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchFilters;