import React, { useState, useMemo } from 'react';
import ParkingRating from './ParkingRating';
import { 
  useGeolocation, 
  calculateDistance, 
  calculateEstimatedTime, 
  formatDistance, 
  formatTime 
} from './hooks/useGeolocation';

const SearchResults = ({ results = [], loading, onParkingSelect, userLocation, similarReviews = [], searchQuery = '' }) => {
    // Helper to render reviews for similar-named places
    const renderSimilarReviews = () => {
      if (!similarReviews.length || !searchQuery) return null;
      return (
        <div style={{ margin: '18px 0 0 0', padding: '16px', background: '#f8fafc', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '15px', color: '#0369a1' }}>📝 Reseñas de lugares similares</h4>
          {similarReviews.map(({ parking, reviews }) => (
            <div key={parking.id} style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>{parking.name}</div>
              {reviews && reviews.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {reviews.slice(0, 3).map(r => (
                    <li key={r.id} style={{ marginBottom: '6px', fontSize: '13px', color: '#334155' }}>
                      <span style={{ color: '#f59e42', fontWeight: 500 }}>★ {r.rating}</span> {r.comment ? `- ${r.comment}` : ''}
                    </li>
                  ))}
                  {reviews.length > 3 && <li style={{ fontSize: '12px', color: '#64748b' }}>...y {reviews.length - 3} más</li>}
                </ul>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>Sin reseñas aún</div>
              )}
            </div>
          ))}
        </div>
      );
    };
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [sortBy, setSortBy] = useState('score');
  
  // Obtener geolocalización del usuario
  const { location, error: geoError, loading: geoLoading } = useGeolocation();

  const formatPrice = (price) => {
    return `$${price}/h`;
  };
  
  // Enriquecer resultados con distancia y tiempo calculados
  const enrichedResults = useMemo(() => {
    if (!location || !results) return results;
    
    return results.map(parking => {
      if (!parking.latitude || !parking.longitude) return parking;
      
      const distanceKm = calculateDistance(
        location.latitude,
        location.longitude,
        parking.latitude,
        parking.longitude
      );
      
      const estimatedTime = calculateEstimatedTime(distanceKm, 'driving');
      
      return {
        ...parking,
        calculatedDistance: distanceKm,
        estimatedTime: estimatedTime
      };
    });
  }, [results, location]);

  const getScoreColor = (score) => {
    if (score >= 120) return '#27ae60'; // Green
    if (score >= 100) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  };

  const getScoreLabel = (score) => {
    if (score >= 120) return 'Excelente';
    if (score >= 100) return 'Bueno';
    return 'Básico';
  };

  const sortedResults = [...enrichedResults].sort((a, b) => {
    switch (sortBy) {
      case 'score':
        return (b.searchScore || 0) - (a.searchScore || 0);
      case 'distance':
        // Priorizar distancia calculada si está disponible
        const distA = a.calculatedDistance ?? a.distance ?? 999;
        const distB = b.calculatedDistance ?? b.distance ?? 999;
        return distA - distB;
      case 'price':
        return (a.hourlyRate || 999) - (b.hourlyRate || 999);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔍</div>
        <div style={{ fontSize: '18px', color: '#666' }}>Buscando estacionamientos...</div>
        <div style={{ fontSize: '14px', color: '#999', marginTop: '10px' }}>
          Analizando ubicación, precios y características
        </div>
        {geoLoading && (
          <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
            📍 Obteniendo tu ubicación...
          </div>
        )}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>😕</div>
        <div style={{ fontSize: '18px', color: '#666', marginBottom: '10px' }}>
          No se encontraron estacionamientos
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          Intenta ajustar los filtros o ampliar el radio de búsqueda
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#f8f9fa'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
            📍 {results.length} Estacionamientos Encontrados
          </h3>
          <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#666' }}>
            {location ? '✓ Ubicación detectada - Distancias calculadas' : 'Ordenados por relevancia'}
          </p>
          {geoError && (
            <p style={{ margin: '5px 0 0', fontSize: '12px', color: '#e74c3c' }}>
              ⚠️ {geoError}
            </p>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Sort Options */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '12px'
            }}
          >
            <option value="score">Relevancia</option>
            <option value="distance">Distancia</option>
            <option value="price">Precio</option>
            <option value="rating">Rating</option>
          </select>
          
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: '6px' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 12px',
                background: viewMode === 'list' ? '#3498db' : 'transparent',
                color: viewMode === 'list' ? 'white' : '#666',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              📋
            </button>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '8px 12px',
                background: viewMode === 'grid' ? '#3498db' : 'transparent',
                color: viewMode === 'grid' ? 'white' : '#666',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ⊞
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{
        maxHeight: '600px',
        overflowY: 'auto',
        padding: viewMode === 'grid' ? '15px' : '0'
      }}>
        {viewMode === 'list' ? (
          // List View
          <div>
            {sortedResults.map((parking, index) => (
              <div
                key={parking.id}
                onClick={() => onParkingSelect && onParkingSelect(parking)}
                style={{
                  padding: '20px',
                  borderBottom: index < sortedResults.length - 1 ? '1px solid #eee' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  ':hover': { background: '#f8f9fa' }
                }}
                onMouseEnter={(e) => e.target.style.background = '#f8f9fa'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {/* Title and Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#333' }}>{parking.name}</h4>
                      <ParkingRating parkingId={parking.id} size="normal" />
                      {parking.searchScore && (
                        <span
                          style={{
                            background: getScoreColor(parking.searchScore),
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }}
                          title={`Puntuación: ${parking.searchScore}/150`}
                        >
                          {getScoreLabel(parking.searchScore)}
                        </span>
                      )}
                    </div>

                    {/* Stats Row */}
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                      <div>💰 {formatPrice(parking.hourlyRate)}</div>
                      {parking.calculatedDistance !== undefined ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span>📏 {formatDistance(parking.calculatedDistance)}</span>
                          <span style={{ color: '#3498db' }}>🚗 ~{formatTime(parking.estimatedTime)}</span>
                        </div>
                      ) : parking.distance && <div>📏 {formatDistance(parking.distance)}</div>}
                      <div>🅿️ {parking.availableSpots} disponibles</div>
                      {parking.rating && <div>⭐ {parking.rating.toFixed(1)}</div>}
                    </div>

                    {/* Amenities */}
                    {parking.amenities && parking.amenities.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {parking.amenities.slice(0, 6).map(amenity => (
                          <span
                            key={amenity.id}
                            style={{
                              background: '#e8f4fd',
                              color: '#2980b9',
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            title={amenity.name}
                          >
                            {amenity.icon}
                          </span>
                        ))}
                        {parking.amenities.length > 6 && (
                          <span style={{
                            background: '#f0f0f0',
                            color: '#666',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '11px'
                          }}>
                            +{parking.amenities.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onParkingSelect && onParkingSelect(parking);
                    }}
                    style={{
                      background: '#3498db',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Ver Detalles
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Grid View
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '15px'
          }}>
            {sortedResults.map(parking => (
              <div
                key={parking.id}
                onClick={() => onParkingSelect && onParkingSelect(parking)}
                style={{
                  background: '#f9f9f9',
                  borderRadius: '8px',
                  padding: '15px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  border: '1px solid #eee'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                {/* Header */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', color: '#333' }}>{parking.name}</h4>
                    {parking.searchScore && (
                      <span
                        style={{
                          background: getScoreColor(parking.searchScore),
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}
                      >
                        {Math.round(parking.searchScore)}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3498db' }}>
                    {formatPrice(parking.hourlyRate)}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#666' }}>
                  {parking.calculatedDistance !== undefined ? (
                    <>
                      <div>📏 {formatDistance(parking.calculatedDistance)}</div>
                      <div style={{ color: '#3498db' }}>🚗 ~{formatTime(parking.estimatedTime)}</div>
                    </>
                  ) : (
                    <div>📏 {parking.distance ? formatDistance(parking.distance) : 'N/A'}</div>
                  )}
                  <div>🅿️ {parking.availableSpots} espacios</div>
                  {parking.rating && <div>⭐ {parking.rating.toFixed(1)}</div>}
                </div>

                {/* Amenities */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                  {(parking.amenities || []).slice(0, 4).map(amenity => (
                    <span
                      key={amenity.id}
                      style={{
                        background: '#e8f4fd',
                        padding: '2px 6px',
                        borderRadius: '8px',
                        fontSize: '10px'
                      }}
                      title={amenity.name}
                    >
                      {amenity.icon}
                    </span>
                  ))}
                </div>

                {/* Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onParkingSelect && onParkingSelect(parking);
                  }}
                  style={{
                    width: '100%',
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Show reviews for similar-named places below results */}
        {renderSimilarReviews()}
      </div>
    </div>
  );
};

export default SearchResults;