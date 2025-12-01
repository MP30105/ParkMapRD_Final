import React from 'react';

// Componente reutilizable para mostrar calificaciones con estrellas estilo Google Maps
export const ParkingRating = ({ parkingId, showLabel = false, size = 'normal' }) => {
  // Función para obtener calificaciones de Google Maps (simuladas)
  const getParkingRating = (parkingId) => {
    // Datos simulados basados en calificaciones típicas de Google Maps
    const googleMapsRatings = {
      'p1': { average: 4.3, count: 127 },          // Main Street Parking
      'p2': { average: 4.1, count: 89 },           // Downtown Garage
      'p1763175281341': { average: 4.6, count: 234 }, // Pollo (muy popular)
      'p1763243907352': { average: 4.2, count: 156 }, // Mirador
      'p3': { average: 3.9, count: 67 },           // Centro Comercial
      'p4': { average: 4.4, count: 203 },          // Plaza Central
      'p5': { average: 3.8, count: 45 },           // Zona Colonial
      'p6': { average: 4.0, count: 78 }
    };
    return googleMapsRatings[parkingId] || { average: 0, count: 0 };
  };

  const { average: rating, count } = getParkingRating(parkingId);

  // Configuraciones de tamaño
  const sizeConfig = {
    small: {
      starSize: '12px',
      fontSize: '11px',
      gap: '3px',
      starGap: '0px'
    },
    normal: {
      starSize: '14px',
      fontSize: '13px',
      gap: '6px',
      starGap: '1px'
    },
    large: {
      starSize: '16px',
      fontSize: '14px',
      gap: '8px',
      starGap: '2px'
    }
  };

  const config = sizeConfig[size] || sizeConfig.normal;

  // Si no hay reseñas
  if (count === 0) {
    return (
      <span style={{
        color: '#9ca3af', 
        fontSize: config.fontSize, 
        fontStyle: 'italic'
      }}>
        {showLabel ? 'Nuevo • Sin calificar' : 'Sin calificar'}
      </span>
    );
  }

  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div style={{
      display: 'flex', 
      alignItems: 'center', 
      gap: config.gap
    }}>
      <div style={{
        display: 'flex', 
        alignItems: 'center', 
        gap: config.starGap
      }}>
        {/* Estrellas llenas */}
        {Array(fullStars).fill().map((_, i) => (
          <span key={`full-${i}`} style={{
            color: '#fbbc04', 
            fontSize: config.starSize, 
            lineHeight: 1
          }}>★</span>
        ))}
        
        {/* Media estrella */}
        {hasHalfStar && (
          <span style={{
            color: '#fbbc04', 
            fontSize: config.starSize, 
            lineHeight: 1, 
            position: 'relative'
          }}>
            <span style={{
              color: '#e5e5e5', 
              position: 'absolute'
            }}>★</span>
            <span style={{
              clipPath: 'inset(0 50% 0 0)', 
              display: 'inline-block'
            }}>★</span>
          </span>
        )}
        
        {/* Estrellas vacías */}
        {Array(emptyStars).fill().map((_, i) => (
          <span key={`empty-${i}`} style={{
            color: '#e5e5e5', 
            fontSize: config.starSize, 
            lineHeight: 1
          }}>★</span>
        ))}
      </div>
      
      <span style={{
        color: '#5f6368', 
        fontSize: config.fontSize, 
        fontWeight: '400',
        marginLeft: '2px'
      }}>
        {rating.toFixed(1)} ({count.toLocaleString()})
      </span>
    </div>
  );
};

export default ParkingRating;