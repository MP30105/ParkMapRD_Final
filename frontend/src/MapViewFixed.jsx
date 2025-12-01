import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { apiGet, apiPost, apiDelete, attachAuth } from './api';
import { haversineKm, etaMinutes } from './utils/distance';
import { useToast } from './ToastProvider';
import ReservationModal from './ReservationModal';
import StripeCheckout from './StripeCheckout';
import TicketQR from './TicketQR';
import ParkingRating from './ParkingRating';

const defaultCenter = { lat: 18.4861, lng: -69.9312 };

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

function ParkingSearchMenu({ onSearch, onFilter, showAvailableOnly, setShowAvailableOnly, totalParkings, filteredCount, parkings = [], onSelectParking, onSelectLocation }) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('nearest');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);

  // Filtrar sugerencias de parqueos basadas en el texto de búsqueda
  const parkingSuggestions = useMemo(() => {
    if (!search || search.length < 1) return [];
    const term = search.toLowerCase();
    return parkings
      .filter(p => p.name && p.name.toLowerCase().includes(term))
      .slice(0, 3); // Máximo 3 sugerencias de parqueos
  }, [search, parkings]);

  // Buscar lugares con Nominatim (OpenStreetMap) con debounce
  useEffect(() => {
    if (!search || search.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      setIsSearchingLocations(true);
      try {
        // Buscar en República Dominicana principalmente
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(search)}&countrycodes=do&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'es' } }
        );
        const data = await response.json();
        setLocationSuggestions(data.map(item => ({
          id: item.place_id,
          name: item.display_name,
          shortName: item.name || item.display_name.split(',')[0],
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type,
          address: item.address
        })));
      } catch (e) {
        console.error('Error buscando lugares:', e);
        setLocationSuggestions([]);
      } finally {
        setIsSearchingLocations(false);
      }
    }, 400); // Esperar 400ms después de que el usuario deje de escribir

    return () => clearTimeout(timeoutId);
  }, [search]);

  const handleSelectParking = (parking) => {
    setSearch(parking.name);
    onSearch(parking.name);
    setShowSuggestions(false);
    if (onSelectParking) onSelectParking(parking);
  };

  const handleSelectLocation = (location) => {
    setSearch(location.shortName);
    setShowSuggestions(false);
    if (onSelectLocation) onSelectLocation(location);
  };

  const hasSuggestions = parkingSuggestions.length > 0 || locationSuggestions.length > 0;

  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px #0002', padding: 16, maxWidth: 400, margin: '16px auto', zIndex: 1000 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Buscar lugar o parqueo..."
          value={search}
          onChange={e => { setSearch(e.target.value); onSearch(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: showSuggestions && hasSuggestions ? 0 : 12 }}
        />
        {isSearchingLocations && (
          <div style={{ position: 'absolute', right: 10, top: 10, fontSize: 12, color: '#64748b' }}>Buscando...</div>
        )}
        {showSuggestions && hasSuggestions && (
          <ul style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 1001,
            maxHeight: 280,
            overflowY: 'auto'
          }}>
            {/* Sugerencias de parqueos */}
            {parkingSuggestions.length > 0 && (
              <>
                <li style={{ padding: '6px 12px', background: '#f1f5f9', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  🅿️ Parqueos
                </li>
                {parkingSuggestions.map(p => (
                  <li
                    key={p.id}
                    onClick={() => handleSelectParking(p)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: p.availableSpots > 0 ? '#22c55e' : '#ef4444' }}>
                      {p.availableSpots}/{p.totalSpots}
                    </span>
                  </li>
                ))}
              </>
            )}
            {/* Sugerencias de lugares */}
            {locationSuggestions.length > 0 && (
              <>
                <li style={{ padding: '6px 12px', background: '#f1f5f9', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  📍 Lugares
                </li>
                {locationSuggestions.map(loc => (
                  <li
                    key={loc.id}
                    onClick={() => handleSelectLocation(loc)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ fontWeight: 500, color: '#1e293b', marginBottom: 2 }}>{loc.shortName}</div>
                    <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {loc.name.length > 60 ? loc.name.substring(0, 60) + '...' : loc.name}
                    </div>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </div>
      {(!showSuggestions || !hasSuggestions) && <div style={{ height: 12 }} />}
      <div style={{ fontWeight: 'bold', color: '#0d6efd', marginBottom: 8 }}>Filtros Rápidos</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          style={{ flex: 1, background: activeFilter === 'nearest' ? '#22c55e' : '#f3f4f6', color: activeFilter === 'nearest' ? '#fff' : '#222', border: 'none', borderRadius: 8, padding: 8, fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => { setActiveFilter('nearest'); onFilter('nearest'); }}
        >Más Cercanos</button>
        <button
          style={{ flex: 1, background: activeFilter === 'availability' ? '#3b82f6' : '#f3f4f6', color: activeFilter === 'availability' ? '#fff' : '#222', border: 'none', borderRadius: 8, padding: 8, fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => { setActiveFilter('availability'); onFilter('availability'); }}
        >Mayor Disponibilidad</button>
        <button
          style={{ flex: 1, background: activeFilter === 'advanced' ? '#e11d48' : '#f3f4f6', color: activeFilter === 'advanced' ? '#fff' : '#222', border: 'none', borderRadius: 8, padding: 8, fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => { setActiveFilter('advanced'); onFilter('advanced'); }}
        >Avanzada</button>
      </div>
      <div style={{ fontWeight: 'bold', color: '#0d6efd', marginBottom: 8 }}>Disponibilidad</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={showAvailableOnly}
          onChange={e => setShowAvailableOnly(e.target.checked)}
          id="availableOnly"
        />
        <label htmlFor="availableOnly" style={{ color: '#22c55e', fontWeight: 'bold' }}>Solo parqueos disponibles</label>
      </div>
      <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>
        <span>Mostrando {filteredCount} de {totalParkings} parqueos</span>
      </div>
    </div>
  );
}

export default function MapView({ token, parkings = [], selectedParking, setSelectedParking, darkMode }) {
  const { showToast } = useToast();
  const [favorites, setFavorites] = useState([]);
  const [hoveredId, setHoveredId] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [userPos, setUserPos] = useState(defaultCenter);
  const [showReservationModal, setShowReservationModal] = useState(null);
  const [showStripeCheckout, setShowStripeCheckout] = useState(null);
  const [lastTicket, setLastTicket] = useState(null);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('nearest');

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    apiGet('parkmaprd/users/me/favorites', attachAuth(token))
      .then(data => Array.isArray(data) ? data : [])
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [token]);

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

  const filteredParkings = useMemo(() => {
    let result = parkings
      .map(p => {
        if (userPos) {
          const d = haversineKm(userPos.lat, userPos.lng, p.lat, p.lng);
          return { ...p, distanceKm: d, etaMin: etaMinutes(d) };
        }
        return { ...p, distanceKm: undefined, etaMin: undefined };
      })
      .filter(p => {
        if (showAvailableOnly && p.availableSpots === 0) return false;
        if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (activeFilter === 'nearest') {
          return (a.distanceKm || Infinity) - (b.distanceKm || Infinity);
        } else if (activeFilter === 'availability') {
          return (b.availableSpots - a.availableSpots);
        }
        return 0;
      });
    // Fallback: if no results, show all parkings
    if (result.length === 0 && parkings.length > 0) {
      result = parkings.map(p => {
        if (userPos) {
          const d = haversineKm(userPos.lat, userPos.lng, p.lat, p.lng);
          return { ...p, distanceKm: d, etaMin: etaMinutes(d) };
        }
        return { ...p, distanceKm: undefined, etaMin: undefined };
      });
    }
    return result;
  }, [parkings, userPos, showAvailableOnly, searchTerm, activeFilter]);

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
      <MapContainer
        center={[defaultCenter.lat, defaultCenter.lng]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution={darkMode ? '&copy; CARTO' : '&copy; OpenStreetMap contributors'}
          url={darkMode ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <RecenterMap position={userPos} />
        <ZoomHandler setZoomLevel={setZoomLevel} />

      {filteredParkings.map(p => {
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
                {p.availableSpots === 0 && (
                  <div className="popup-actions" style={{display:'flex',gap:8}}>
                    <button
                      className="btn btn--outline"
                      onClick={() => showToast('info','Busca otro parqueo')}
                    >
                      Lleno
                    </button>
                  </div>
                )}
                {p.availableSpots > 0 && (
                  <div className="popup-actions" style={{display:'flex',gap:8}}>
                    <button
                      className="btn btn--outline"
                      onClick={() => setShowReservationModal(p)}
                    >
                      📅 Reservar
                    </button>
                    <button
                      className="btn btn--outline"
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, '_blank')}
                    >
                      📍 Dirección
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
      })}

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
          setShowAuth={typeof window.setShowAuth === 'function' ? window.setShowAuth : undefined}
          setAuthMode={typeof window.setAuthMode === 'function' ? window.setAuthMode : undefined}
        />
      )}

      {showStripeCheckout && (
        <StripeCheckout
          parking={showStripeCheckout.parking}
          duration={showStripeCheckout.duration}
          zone={showStripeCheckout.zone}
          spotNumber={showStripeCheckout.spotNumber}
          onSuccess={(ticket) => {
            showToast('success','Pago procesado');
            setShowStripeCheckout(null);
            setLastTicket(ticket);
          }}
          onCancel={() => setShowStripeCheckout(null)}
        />
      )}

      {lastTicket && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:1002,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',padding:32,borderRadius:16,boxShadow:'0 8px 32px rgba(0,0,0,0.15)',maxWidth:340,width:'100%',textAlign:'center'}}>
            <TicketQR ticket={lastTicket} />
            <button className="btn primary" style={{marginTop:16}} onClick={()=>setLastTicket(null)}>Cerrar</button>
          </div>
        </div>
      )}
      </MapContainer>

      <div style={{position:'absolute',right:16,top:16,zIndex:4001,display:'flex',flexDirection:'column',gap:8}}>
        <button className="btn tool-btn" onClick={locateMe}>📍</button>
      </div>

      <div style={{position:'absolute',top:24,left:24,zIndex:2000,display:'flex',flexDirection:'column',alignItems:'flex-start',pointerEvents:'auto'}}>
        <ParkingSearchMenu
          onSearch={setSearchTerm}
          onFilter={setActiveFilter}
          showAvailableOnly={showAvailableOnly}
          setShowAvailableOnly={setShowAvailableOnly}
          totalParkings={parkings.length}
          filteredCount={filteredParkings.length}
          parkings={parkings}
          onSelectParking={(p) => { setSelectedParking(p); setUserPos({ lat: p.lat, lng: p.lng }); }}
          onSelectLocation={(loc) => {
            // Mover el mapa a la ubicación seleccionada
            setUserPos({ lat: loc.lat, lng: loc.lng });
            // Buscar el parqueo más cercano a esa ubicación
            const nearest = parkings
              .map(p => ({ ...p, dist: haversineKm(loc.lat, loc.lng, p.lat, p.lng) }))
              .filter(p => p.availableSpots > 0)
              .sort((a, b) => a.dist - b.dist)[0];
            if (nearest) {
              setSelectedParking(nearest);
              showToast('info', `Parqueo más cercano: ${nearest.name} (${nearest.dist.toFixed(2)} km)`);
            } else {
              showToast('info', 'No hay parqueos disponibles cerca de esta ubicación');
            }
          }}
        />
      </div>
    </div>
  );
}
