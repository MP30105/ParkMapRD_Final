import { useState, useEffect } from 'react';

/**
 * Hook personalizado para obtener la geolocalización del usuario
 * @returns {Object} Estado de la geolocalización
 */
export const useGeolocation = () => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalización no soportada por el navegador');
      setLoading(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000, // Cache por 5 minutos
    };

    const handleSuccess = (position) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setError(null);
      setLoading(false);
    };

    const handleError = (error) => {
      let errorMessage = 'Error obteniendo ubicación';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Permiso de ubicación denegado. Por favor habilítalo en la configuración del navegador.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Información de ubicación no disponible.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Tiempo de espera agotado al obtener la ubicación.';
          break;
        default:
          errorMessage = 'Error desconocido obteniendo ubicación.';
      }
      
      setError(errorMessage);
      setLoading(false);
    };

    // Obtener ubicación inicial
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);

    // Vigilar cambios de ubicación
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, options);

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return { location, error, loading };
};

/**
 * Calcula la distancia entre dos puntos usando la fórmula de Haversine
 * @param {number} lat1 - Latitud del punto 1
 * @param {number} lon1 - Longitud del punto 1
 * @param {number} lat2 - Latitud del punto 2
 * @param {number} lon2 - Longitud del punto 2
 * @returns {number} Distancia en kilómetros
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
};

/**
 * Convierte grados a radianes
 * @param {number} deg - Grados
 * @returns {number} Radianes
 */
const toRad = (deg) => {
  return deg * (Math.PI / 180);
};

/**
 * Calcula el tiempo estimado de viaje en minutos
 * @param {number} distanceKm - Distancia en kilómetros
 * @param {string} mode - Modo de transporte ('driving', 'walking', 'transit')
 * @returns {number} Tiempo en minutos
 */
export const calculateEstimatedTime = (distanceKm, mode = 'driving') => {
  // Velocidades promedio en km/h
  const speeds = {
    driving: 40, // Velocidad promedio en ciudad
    walking: 5,
    transit: 25,
  };
  
  const speed = speeds[mode] || speeds.driving;
  const timeInHours = distanceKm / speed;
  const timeInMinutes = Math.ceil(timeInHours * 60);
  
  return timeInMinutes;
};

/**
 * Formatea la distancia para mostrar
 * @param {number} distanceKm - Distancia en kilómetros
 * @returns {string} Distancia formateada
 */
export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
};

/**
 * Formatea el tiempo para mostrar
 * @param {number} minutes - Tiempo en minutos
 * @returns {string} Tiempo formateado
 */
export const formatTime = (minutes) => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};
