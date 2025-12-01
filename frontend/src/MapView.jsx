// ...existing code...
// Selecciona el parqueo más cercano cada vez que cambia la ubicación
// Este useEffect debe ir después de declarar los hooks y variables
import React, { useEffect, useState, useMemo } from 'react';
// Simple geocoding function using OpenStreetMap Nominatim
async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
    }
  } catch (e) {}
  return null;
}
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, CircleMarker, useMapEvents } from 'react-leaflet';
// Agrupamiento deshabilitado por incompatibilidad
import L from 'leaflet';
// Eliminado agrupamiento por incompatibilidad
// import MarkerClusterGroup from 'react-leaflet-cluster';
import { apiGet, apiPost, apiDelete, attachAuth } from './api';
import { haversineKm, etaMinutes } from './utils/distance';
import { useToast } from './ToastProvider';
import ReservationModal from './ReservationModal';
import StripeCheckout from './StripeCheckout';
import ParkingRating from './ParkingRating';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';

const defaultCenter = null;

try {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  });
} catch (_) {}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.setView([position.lat, position.lng], map.getZoom()); }, [position, map]);
  return null;
}

function ZoomHandler({ setZoomLevel }) {
  const map = useMapEvents({
    zoomend: () => {
      setZoomLevel(map.getZoom());
    },
  });
  return null;
}

export default function MapView({ token, parkings = [], selectedParking, setSelectedParking, darkMode }) {
    // Reviews for similar-named places
    const [similarReviews, setSimilarReviews] = useState([]);
  const { showToast } = useToast();
  const [favorites, setFavorites] = useState([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [userPos, setUserPos] = useState(null);
  const [showReservationModal, setShowReservationModal] = useState(null);
  const [showStripeCheckout, setShowStripeCheckout] = useState(null);
  // Basic search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [radiusKm, setRadiusKm] = useState(5);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  // Advanced search integration
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedParams, setAdvancedParams] = useState(null);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  // Loader and error state for parkings
  const [parkingsLoading, setParkingsLoading] = useState(true);
  const [backendError, setBackendError] = useState(null);

  // Selecciona el parqueo más cercano cada vez que cambia la ubicación
  useEffect(() => {
    if (!userPos || !parkings.length) return;
    const nearest = findNearestParking(userPos.lat, userPos.lng);
    if (nearest) setSelectedParking(nearest);
  }, [userPos, parkings]);
  const [smartResults, setSmartResults] = useState([]);
  const [locationPermissionAsked, setLocationPermissionAsked] = useState(false);
  const [locationError, setLocationError] = useState("");

  // Interpret search input: coordinates or location name
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const match = trimmed.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        setUserPos({ lat, lng });
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
    }
    // Si es texto, buscar sugerencias en Nominatim
    let cancelled = false;
    (async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
              // Filtrar solo lugares en República Dominicana
              const filtered = data.filter(
                (item) =>
                  item.display_name &&
                  item.display_name.toLowerCase().includes("dominican republic")
              );
              setSuggestions(filtered);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchQuery]);
  // Fetch reviews for similar-named places when searchQuery changes
  useEffect(() => {
    if (!searchQuery || !parkings.length) {
      setSimilarReviews([]);
      return;
    }
    // Find parkings with similar names
    const q = searchQuery.trim().toLowerCase();
    const similarParkings = parkings.filter(p => p.name && p.name.toLowerCase().includes(q));
    if (!similarParkings.length) {
      setSimilarReviews([]);
      return;
    }
    // Fetch reviews for all similar parkings
    Promise.all(similarParkings.map(p =>
      apiGet(`parkmaprd/parkings/${p.id}/reviews`).then(revs => ({ parking: p, reviews: revs })).catch(() => null)
    )).then(results => {
      setSimilarReviews(results.filter(Boolean));
    });
  }, [searchQuery, parkings]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserPos({ lat: 18.4861, lng: -69.9312 }); // fallback SD
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError("");
      },
      err => {
        setUserPos({ lat: 18.4861, lng: -69.9312 }); // fallback SD
        setLocationError("No se pudo obtener tu ubicación. Actívala en el navegador.");
      }
    );
  }, []);
  // Función para encontrar el parqueo más cercano a un punto
  const findNearestParking = (lat, lng) => {
    if (!parkings.length) return null;
    let minDist = Infinity;
    let nearest = null;
    for (const p of parkings) {
      const d = haversineKm(lat, lng, p.lat, p.lng);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }
    return nearest;
  };

  // Handler para el botón "Parqueo más cercano"
  const handleNearestParking = () => {
    let target = null;
    // Si el usuario buscó una coordenada, usar esa
    const trimmed = searchQuery.trim();
    const match = trimmed.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        target = { lat, lng };
      }
    }
    // Si no, usar la ubicación actual
    if (!target) {
      if (!userPos || userPos === defaultCenter) {
        if (!locationPermissionAsked) {
          setLocationPermissionAsked(true);
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              pos => {
                setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocationError("");
                // Intentar de nuevo con la nueva ubicación
                setTimeout(handleNearestParking, 500);
              },
              err => {
                setLocationError("No se pudo obtener tu ubicación. Actívala en el navegador.");
                showToast('error', 'No se pudo obtener tu ubicación. Actívala en el navegador.');
              }
            );
          } else {
            setLocationError("Este navegador no soporta geolocalización.");
            showToast('error', 'Este navegador no soporta geolocalización.');
          }
        } else {
          showToast('error', 'No se pudo obtener tu ubicación. Actívala en el navegador.');
        }
        return;
      }
      target = userPos;
    }
    // Buscar el parqueo más cercano
    const nearest = findNearestParking(target.lat, target.lng);
    if (nearest) {
      setSelectedParking(nearest);
      showToast('success', `Parqueo más cercano: ${nearest.name}`);
    } else {
      showToast('info', 'No hay parqueos disponibles.');
    }
  };

  useEffect(() => {
    if (!token) return;
    apiGet('parkmaprd/users/me/favorites', attachAuth(token))
      .then(data => Array.isArray(data) ? data : [])
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [token]);

  // Load parkings with loader and error
  useEffect(() => {
    setParkingsLoading(true);
    setBackendError(null);
    apiGet('parkmaprd/parkings')
      .then(data => {
        setParkingsLoading(false);
        setBackendError(null);
        // parkings are passed as prop, so you may need to lift this state up if not already
      })
      .catch(err => {
        setParkingsLoading(false);
        setBackendError(err.message || 'No se pudo cargar parqueos');
      });
  }, []);

  const toggleFavorite = async (parkingId) => {
    if (!token) { showToast('info', 'Inicia sesión para guardar favoritos'); return; }
    const isFav = favorites.includes(parkingId);
    try {
      if (isFav) {
        await apiDelete(`parkmaprd/users/me/favorites/${parkingId}`, attachAuth(token));
        setFavorites(favorites.filter(id => id !== parkingId));
        showToast('success', 'Favorito removido');
      } else {
        await apiPost(`parkmaprd/users/me/favorites/${parkingId}`, {}, attachAuth(token));
        setFavorites([...favorites, parkingId]);
        showToast('success', 'Añadido a favoritos');
      }
    } catch (e) {
      showToast('error', 'Error al actualizar favorito');
    }
  };

  // Track map bounds for marker limiting
  const [mapBounds, setMapBounds] = useState(null);
  // Helper to update bounds on map move
  function BoundsUpdater() {
    const map = useMap();
    useEffect(() => {
      const update = () => {
        const newBounds = map.getBounds();
        setMapBounds(prevBounds => {
          // Only update if bounds are different
          if (!prevBounds || !prevBounds.equals(newBounds)) {
            return newBounds;
          }
          return prevBounds;
        });
      };
      map.on('moveend', update);
      update();
      return () => map.off('moveend', update);
    }, [map]);
    return null;
  }

  // Enrich parkings with distance/eta
  const enrichedParkings = useMemo(() => {
    return parkings.map(p => {
      if (userPos) {
        const d = haversineKm(userPos.lat, userPos.lng, p.lat, p.lng);
        return { ...p, distanceKm: d, etaMin: etaMinutes(d) };
      }
      return { ...p, distanceKm: undefined, etaMin: undefined };
    });
  }, [parkings, userPos]);

  // Limit markers to those in current map bounds and near searched location, but always show matching names
  const visibleParkings = useMemo(() => {
    let list = enrichedParkings;
    const trimmed = searchQuery.trim().toLowerCase();
    // Find parkings with matching names
    const nameMatches = trimmed ? list.filter(p => p.name && p.name.toLowerCase().includes(trimmed)) : [];
    // If user searched for a location, filter by radius
    let nearby = list;
    if (userPos && searchQuery) {
      nearby = list.filter(p => {
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
        const d = haversineKm(userPos.lat, userPos.lng, p.lat, p.lng);
        return d <= radiusKm;
      });
    }
    // Combine: always show name matches, plus nearby
    let combined = [...nearby];
    nameMatches.forEach(p => {
      if (!combined.find(x => x.id === p.id)) combined.push(p);
    });
    // Then filter by map bounds
    if (mapBounds) {
      combined = combined.filter(p => {
        if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
        return mapBounds.contains([p.lat, p.lng]);
      });
    }
    return combined;
  }, [enrichedParkings, mapBounds, userPos, searchQuery, radiusKm]);

  const finalParkings = useMemo(() => {
    let list = enrichedParkings;
    // Apply simple filters when advanced not active
    if (!advancedParams) {
      list = list.filter(p => {
        if (p.distanceKm !== undefined && p.distanceKm > radiusKm) return false;
        if (showAvailableOnly && p.availableSpots === 0) return false;
        if (searchQuery && !/^(-?\d+(?:\.\d+)?),/.test(searchQuery)) {
          const q = searchQuery.toLowerCase();
          if (!p.name.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      return list;
    }
    // Advanced filters
    list = list.filter(p => {
      if (advancedParams.radius && p.distanceKm !== undefined && p.distanceKm > advancedParams.radius) return false;
      if (advancedParams.onlyAvailable && p.availableSpots === 0) return false;
      // Price filtering (attempt multiple field names)
      const price = p.hourlyRate ?? p.price ?? p.rate;
      if (price !== undefined) {
        if (advancedParams.priceMin !== undefined && price < advancedParams.priceMin) return false;
        if (advancedParams.priceMax !== undefined && price > advancedParams.priceMax) return false;
      }
      // Amenities filtering
      if (advancedParams.amenities) {
        const reqIds = advancedParams.amenities.split(',').filter(Boolean);
        if (reqIds.length) {
          const parkingAmenityIds = (p.amenities || []).map(a => a.id || a);
          const missing = reqIds.some(id => !parkingAmenityIds.includes(id));
          if (missing) return false;
        }
      }
      return true;
    });
    // Sorting
    switch (advancedParams.sortBy) {
      case 'distance':
        list = [...list].sort((a,b)=>(a.distanceKm??999)-(b.distanceKm??999));
        break;
      case 'price':
        list = [...list].sort((a,b)=>((a.hourlyRate??a.price??a.rate??999)-(b.hourlyRate??b.price??b.rate??999)));
        break;
      case 'rating':
        list = [...list].sort((a,b)=>(b.rating??0)-(a.rating??0));
        break;
      case 'amenities':
        list = [...list].sort((a,b)=>((b.amenities?.length??0)-(a.amenities?.length??0)));
        break;
      default:
        // keep as-is
        break;
    }
    return list;
  }, [enrichedParkings, radiusKm, showAvailableOnly, searchQuery, advancedParams]);

  const handleAdvancedFilters = (params) => {
    setAdvancedParams(params);
    // Smart search remote call
    if (!params) return;
    setSmartLoading(true);
    const queryParts = [];
    if (params.lat) queryParts.push(`lat=${params.lat}`);
    if (params.lng) queryParts.push(`lng=${params.lng}`);
    if (params.radius) queryParts.push(`radius=${params.radius}`);
    if (params.priceMin !== undefined) queryParts.push(`priceMin=${params.priceMin}`);
    if (params.priceMax !== undefined) queryParts.push(`priceMax=${params.priceMax}`);
    if (params.amenities) queryParts.push(`amenities=${encodeURIComponent(params.amenities)}`);
    if (params.sortBy) queryParts.push(`sortBy=${params.sortBy}`);
    if (params.onlyAvailable) queryParts.push(`onlyAvailable=${params.onlyAvailable}`);
    const qs = queryParts.join('&');
    apiGet(`parkmaprd/parkings/search?${qs}`)
      .then(data => {
        if (Array.isArray(data)) setSmartResults(data); else setSmartResults([]);
      })
      .catch(()=> setSmartResults([]))
      .finally(()=> setSmartLoading(false));
  };

  const baseIconUrl = process.env.PUBLIC_URL + '/pin.svg';
  const createIcon = (isSelected, isHovered) => {
    const base = Math.max(18, Math.min(60, 24 + (zoomLevel - 12) * 4));
    let size = base;
    if (isSelected) size *= 1.4; else if (isHovered) size *= 1.2;
    const iconSize = [size, size];
    return L.icon({
      iconUrl: baseIconUrl,
      iconSize,
      iconAnchor: [iconSize[0] / 2, iconSize[1]],
      popupAnchor: [0, -iconSize[1] * 0.6],
      className: `parking-marker-icon${isSelected ? ' selected' : ''}${isHovered ? ' hovered' : ''}`
    });
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setUserPos(next);
    });
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {/* Loader while loading parkings */}
      {parkingsLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#fff',
          padding: '32px',
          borderRadius: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          zIndex: 5000,
          color: '#0369a1',
          fontWeight: 600
        }}>
          Cargando parqueos...
        </div>
      )}
      {/* Error message if parkings fail to load */}
      {backendError && !parkingsLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#fff',
          padding: '32px',
          borderRadius: '12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          zIndex: 5000,
          color: '#ef4444',
          fontWeight: 600
        }}>
          Error: {backendError}
        </div>
      )}
      <MapContainer
        center={userPos ? [userPos.lat, userPos.lng] : [18.4861, -69.9312]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution={darkMode ? '&copy; CARTO' : '&copy; OpenStreetMap contributors'}
          url={darkMode ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <RecenterMap position={userPos} />
        <ZoomHandler setZoomLevel={setZoomLevel} />
        <BoundsUpdater />

      {/* Only render markers in current map bounds */}
      {visibleParkings.length > 0 ? visibleParkings.map(p => {
        const isSelected = selectedParking && selectedParking.id === p.id;
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={createIcon(isSelected, hoveredId === p.id)}
            eventHandlers={{
              click: () => setSelectedParking(p),
              mouseover: () => setHoveredId(p.id),
              mouseout: () => setHoveredId(null)
            }}
          >
            <Popup>
              <div style={{ minWidth: 220 }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div style={{flex: 1}}>
                    <h4 style={{ margin: '0 0 4px 0' }}>{p.name}</h4>
                    <ParkingRating parkingId={p.id} size="normal" />
                  </div>
                  {token && (
                    <button
                      onClick={() => toggleFavorite(p.id)}
                      style={{background:'none',border:'none',fontSize:20,cursor:'pointer',padding:0,flexShrink:0,marginLeft:8}}
                      title={favorites.includes(p.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    >
                      {favorites.includes(p.id) ? '⭐' : '☆'}
                    </button>
                  )}
                </div>
                <p style={{ margin: '6px 0', color: '#94a3b8' }}>
                  {p.availableSpots} / {p.totalSpots} espacios disponibles
                </p>
                {p.distanceKm !== undefined && (
                  <p style={{ margin: '6px 0', color: '#06b6d4', fontWeight: 600 }}>
                    ⏱ ETA: {Math.round(p.etaMin || 0)} min
                  </p>
                )}
                {p.availableSpots === 0 ? (
                  <div className="popup-actions"><button className="btn" onClick={() => showToast('info','Busca otro parqueo')}>Lleno</button></div>
                ) : (
                  <div style={{display:'flex', gap:8}}>
                    <button
                      className="btn primary"
                      onClick={() => setShowStripeCheckout({ parking: p, duration: 60, zone: 'A', spotNumber: Math.floor(Math.random()*50)+1 })}
                    >
                      💳 Comprar
                    </button>
                    <button
                      className="btn btn--outline"
                      onClick={() => setShowReservationModal(p)}
                    >
                      📅 Reservar
                    </button>
                  </div>
                )}
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0,-10]} opacity={0.94}>
              <div style={{fontSize:'12px',lineHeight:'1.25',minWidth:'150px'}}>
                <strong style={{display:'block',fontSize:'13px'}}>🏙 {p.name}</strong>
                {(() => {
                  const ratio = p.totalSpots ? p.availableSpots / p.totalSpots : 0;
                  const pct = Math.round(ratio * 100);
                  return <span>Libre: {pct}%</span>;
                })()}
                {p.distanceKm !== undefined && (
                  <span style={{display:'block',color:'#64748b'}}>Distancia: {p.distanceKm.toFixed(2)} km</span>
                )}
              </div>
            </Tooltip>
          </Marker>
        );
      }) : (
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',background:'#fff',padding:'24px',borderRadius:'10px',boxShadow:'0 2px 12px rgba(0,0,0,0.10)',color:'#ef4444',fontWeight:600,zIndex:5000}}>
          No hay parqueos cerca de esta ubicación o con ese nombre.
        </div>
      )}

      {selectedParking && (
        <CircleMarker
          center={[selectedParking.lat, selectedParking.lng]}
          radius={14}
          pathOptions={{ color: '#06b6d4', weight: 2, opacity: 0.6, fillOpacity: 0.08 }}
        />
      )}

      {showReservationModal && (
        <ReservationModal
          parking={showReservationModal}
          token={token}
          onClose={() => setShowReservationModal(null)}
          onSuccess={() => { showToast('success','Reserva creada'); setShowReservationModal(null); }}
        />
      )}

      {showStripeCheckout && (
        <StripeCheckout
          parking={showStripeCheckout.parking}
          duration={showStripeCheckout.duration}
          zone={showStripeCheckout.zone}
          spotNumber={showStripeCheckout.spotNumber}
          onSuccess={() => { showToast('success','Pago procesado'); setShowStripeCheckout(null); }}
          onCancel={() => setShowStripeCheckout(null)}
        />
      )}
      </MapContainer>

      <div style={{position:'absolute',right:16,top:16,zIndex:4001,display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn tool-btn" onClick={locateMe}>📍</button>
        <button className="btn tool-btn" onClick={()=>setShowAdvanced(s=>!s)} title="Filtros avanzados">{showAdvanced ? '🧪' : '⚙️'}</button>
        <button className="btn tool-btn" onClick={()=>setShowResultsPanel(s=>!s)} title="Resultados">{showResultsPanel ? '🗺️' : '📋'}</button>
      </div>
      {/* Collapsible filters panel */}
      <div style={{position:'absolute',left:16,top:16,zIndex:4001,width:'280px'}}>
        <div style={{background:darkMode?'#1e293b':'#ffffff',color:darkMode?'#f1f5f9':'#0f172a',borderRadius:12,boxShadow:'0 6px 24px rgba(0,0,0,0.15)',overflow:'hidden'}}>
          {/* Header - always visible */}
          <div 
            style={{
              padding:'12px 16px',
              background:darkMode?'#334155':'#f1f5f9',
              cursor:'pointer',
              display:'flex',
              alignItems:'center',
              justifyContent:'space-between',
              borderBottom:showAdvanced?'1px solid rgba(148,163,184,0.2)':'none'
            }}
            onClick={()=>setShowAdvanced(s=>!s)}
          >
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:18}}>⚙️</span>
              <span style={{fontWeight:600,fontSize:14}}>Filtros de Búsqueda</span>
            </div>
            <span style={{fontSize:14,opacity:0.7}}>{showAdvanced ? '▼' : '▶'}</span>
          </div>
          {/* Botón para parqueo más cercano */}
          {/* Botón para parqueo más cercano eliminado */}
          {locationError && (
            <div style={{padding:'8px 16px',color:'#ef4444',fontSize:12}}>{locationError}</div>
          )}
          {/* Collapsible content */}
          {showAdvanced && (
            <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:12}}>
              {/* Search input */}
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:12,opacity:0.7,fontWeight:500}}>🔍 Buscar ubicación o referencia</label>
                <input
                  value={searchQuery}
                  onChange={e=>{
                    setSearchQuery(e.target.value);
                    setActiveSuggestion(-1);
                  }}
                  onKeyDown={e=>{
                    if (showSuggestions && suggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
                        e.preventDefault();
                      } else if (e.key === 'ArrowUp') {
                        setActiveSuggestion(prev => Math.max(prev - 1, 0));
                        e.preventDefault();
                      } else if (e.key === 'Enter' && activeSuggestion >= 0) {
                        const sug = suggestions[activeSuggestion];
                        setUserPos({lat:parseFloat(sug.lat),lng:parseFloat(sug.lon)});
                        setSearchQuery(sug.display_name);
                        setShowSuggestions(false);
                        setActiveSuggestion(-1);
                        e.preventDefault();
                      } else if (e.key === 'Escape') {
                        setShowSuggestions(false);
                        setActiveSuggestion(-1);
                      }
                    }
                  }}
                  placeholder="Ej: Plaza Central, negocio, dirección o 18.48,-69.93"
                  style={{
                    padding:'8px 10px',
                    border:'1px solid #94a3b8',
                    borderRadius:8,
                    fontSize:13,
                    background:darkMode?'#0f172a':'#f8fafc',
                    color:'inherit',
                    outline:'none'
                  }}
                  autoComplete="off"
                />
                {/* Lista de parqueos más cercanos */}
                {userPos && parkings.length > 0 && (
                  (() => {
                    // Calcular los 3 parqueos más cercanos
                    const sorted = [...parkings].map(p => {
                      const distKm = haversineKm(userPos.lat, userPos.lng, p.lat, p.lng);
                      return { ...p, distKm };
                    }).sort((a, b) => a.distKm - b.distKm).slice(0, 3);
                    return (
                      <div style={{marginTop:12}}>
                        <label style={{fontSize:12,opacity:0.7,fontWeight:500}}>🅿️ Parqueos más cercanos</label>
                        <ul style={{listStyle:'none',margin:0,padding:0}}>
                          {sorted.map((p, i) => (
                            <li key={p.id} style={{padding:'6px 0',borderBottom:'1px solid #eee',cursor:'pointer'}} onClick={()=>setSelectedParking(p)}>
                              <span style={{fontWeight:500}}>{p.name}</span>
                              <span style={{fontSize:12,opacity:0.7,marginLeft:8}}>{p.availableSpots} libres</span>
                              <span style={{fontSize:12,opacity:0.7,marginLeft:8}}>{p.distKm.toFixed(2)} km</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{position:'relative',zIndex:1000}}>
                    <ul style={{listStyle:'none',margin:0,padding:0,background:'#fff',border:'1px solid #ddd',borderRadius:8,maxHeight:180,overflowY:'auto',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                      {suggestions.length > 0 ? (
                        suggestions.map((sug,i)=>(
                          <li key={i}
                            style={{
                              padding:'8px 12px',
                              cursor:'pointer',
                              borderBottom:'1px solid #eee',
                              background: i === activeSuggestion ? '#e0e7ff' : 'transparent'
                            }}
                            onMouseEnter={()=>setActiveSuggestion(i)}
                            onMouseLeave={()=>setActiveSuggestion(-1)}
                            onClick={()=>{
                              setUserPos({lat:parseFloat(sug.lat),lng:parseFloat(sug.lon)});
                              setSearchQuery(sug.display_name);
                              setShowSuggestions(false);
                              setActiveSuggestion(-1);
                            }}>
                            <span style={{fontWeight:500}}>{sug.display_name}</span>
                          </li>
                        ))
                      ) : (
                        <li style={{padding:'10px',color:'#888',textAlign:'center'}}>No se encontraron coincidencias</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
              {/* Radius slider */}
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:12,opacity:0.7,fontWeight:500}}>📍 Radio de búsqueda</label>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,opacity:0.6}}>1 km</span>
                  <span style={{fontSize:13,fontWeight:'bold',color:'#06b6d4'}}>{radiusKm} km</span>
                  <span style={{fontSize:11,opacity:0.6}}>20 km</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={radiusKm}
                  onChange={e=>setRadiusKm(parseInt(e.target.value))}
                  style={{width:'100%'}}
                />
              </div>
              {/* Availability filter */}
              <div style={{
                display:'flex',
                alignItems:'center',
                gap:10,
                padding:'10px 12px',
                background:darkMode?'#0f172a':'#f8fafc',
                borderRadius:8,
                border:'1px solid '+(darkMode?'#334155':'#e2e8f0')
              }}>
                <input
                  id="onlyAvailable"
                  type="checkbox"
                  checked={showAvailableOnly}
                  onChange={e=>setShowAvailableOnly(e.target.checked)}
                  style={{margin:0,cursor:'pointer',width:16,height:16}}
                />
                <label htmlFor="onlyAvailable" style={{fontSize:13,cursor:'pointer',flex:1,userSelect:'none'}}>
                  ✓ Solo mostrar parqueos disponibles
                </label>
              </div>
              {/* Results count */}
              <div style={{
                padding:'8px 12px',
                background:darkMode?'#0f172a':'#f0f9ff',
                borderRadius:8,
                border:'1px solid '+(darkMode?'#334155':'#bae6fd'),
                fontSize:12,
                color:darkMode?'#93c5fd':'#0369a1',
                fontWeight:500,
                textAlign:'center'
              }}>
                📊 {finalParkings.length} parqueos encontrados
              </div>
              {/* Advanced filters section */}
              <div style={{marginTop:8,paddingTop:12,borderTop:'1px solid rgba(148,163,184,0.2)'}}>
                <SearchFilters
                  token={token}
                  initialLocation={userPos}
                  onFiltersChange={handleAdvancedFilters}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {showResultsPanel && (
        <div style={{position:'absolute',left:16,bottom:16,zIndex:4001,width:'360px',maxHeight:'55%'}}>
            <SearchResults
              results={advancedParams ? (smartResults.length ? smartResults : finalParkings) : finalParkings}
              loading={smartLoading}
              onParkingSelect={(p)=>{ setSelectedParking(p); setShowResultsPanel(false); }}
              userLocation={userPos}
              similarReviews={similarReviews}
              searchQuery={searchQuery}
            />
        </div>
      )}
    </div>
  );
}
