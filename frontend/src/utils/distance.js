// Utility functions for distance & time calculations (Haversine + travel time)
export function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371; // Earth radius km
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function etaMinutes(distanceKm, speedKmH = 30) { // default urban speed
  return (distanceKm / speedKmH) * 60;
}

export function formatKm(distanceKm, fractionDigits = 2) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(fractionDigits)} km`;
}

export function formatEta(minutes) {
  return `${Math.round(minutes)} min`;
}
