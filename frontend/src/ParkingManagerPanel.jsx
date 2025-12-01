import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, attachAuth } from './api';
import { useToast } from './ToastProvider';
import AssistantManagement from './AssistantManagement';
import ReservationQR from './ReservationQR';
import QRScanner from './QRScanner';

const ParkingManagerPanel = ({ token, onLogout }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tickets'); // tickets, reservations, stats, assistants
  const [tickets, setTickets] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState(null);
  const [parkings, setParkings] = useState([]);
  const [selectedParking, setSelectedParking] = useState('all');
  const [mapCenter, setMapCenter] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadData();
  }, [token]);

  // Centrar mapa en el parqueo gestionado al entrar
  useEffect(() => {
    if (parkings.length === 1) {
      const p = parkings[0];
      if (p.lat && p.lng) setMapCenter({ lat: p.lat, lng: p.lng });
      setSelectedParking(p.id);
    }
  }, [parkings]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ticketsData, reservationsData, statsData, parkingsData] = await Promise.all([
        apiGet('parkmaprd/manager/tickets', attachAuth(token)),
        apiGet('parkmaprd/manager/reservations', attachAuth(token)),
        apiGet('parkmaprd/manager/stats', attachAuth(token)),
        apiGet('parkmaprd/manager/my-parkings', attachAuth(token))
      ]);
      setTickets(Array.isArray(ticketsData) ? ticketsData : []);
      setReservations(Array.isArray(reservationsData) ? reservationsData : []);
      setStats(statsData);
      setParkings(Array.isArray(parkingsData) ? parkingsData : []);
      
      console.log('Loaded parkings for manager:', parkingsData.length);
    } catch (error) {
      console.error('Error loading manager data:', error);
      showToast('error', 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('es-DO', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime * 1000);
    const end = new Date(endTime * 1000);
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getRemainingTime = (endTime) => {
    const now = Date.now();
    const end = endTime * 1000;
    const diffMs = end - now;
    
    if (diffMs < 0) return 'Expirado';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m restantes`;
    return `${minutes}m restantes`;
  };

  const filteredTickets = selectedParking === 'all' 
    ? tickets 
    : tickets.filter(t => t.parkingId === selectedParking);

  const filteredReservations = selectedParking === 'all'
    ? reservations
    : reservations.filter(r => r.parkingId === selectedParking);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <div style={{ fontSize: '18px', color: '#666' }}>Cargando datos del panel...</div>
      </div>
    );
  }

  // Función para actualizar carros disponibles (envía el valor final)
  const updateAvailableSpots = async (parkingId, delta) => {
    const parking = parkings.find(p => p.id === parkingId);
    if (!parking) return showToast('error', 'Parqueo no encontrado');
    const nuevoValor = Math.max(0, Math.min(parking.totalSpots, parking.availableSpots + delta));
    try {
      // Usar el endpoint de asistente para actualizar disponibilidad
      const result = await apiPost(
        'parkmaprd/assistant/update-count',
        { parkingId, availableSpots: nuevoValor },
        attachAuth(token)
      );
      showToast('success', `Carros ${delta > 0 ? 'sumados' : 'restados'} correctamente`);
      loadData();
    } catch (e) {
      showToast('error', e.message || 'Error al actualizar disponibilidad');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      {/* Mapa centrado en el parqueo gestionado */}
      {mapCenter && (
        <div style={{marginBottom:24}}>
          <h3 style={{marginBottom:8}}>🅿️ Vista de tu parqueo</h3>
          <div style={{height:320, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 12px rgba(0,0,0,0.08)'}}>
            <iframe
              title="Mapa Parqueo"
              width="100%"
              height="320"
              style={{border:0}}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCenter.lng-0.0005},${mapCenter.lat-0.0005},${mapCenter.lng+0.0005},${mapCenter.lat+0.0005}&layer=mapnik&marker=${mapCenter.lat},${mapCenter.lng}`}
              allowFullScreen
            />
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: '#333' }}>
            🅿️ Panel de Manager
          </h1>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            Gestión de tickets y reservas en tiempo real
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            value={selectedParking}
            onChange={(e) => setSelectedParking(e.target.value)}
            style={{
              padding: '10px 16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <option value="all">Todos los parqueos</option>
            {parkings.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={loadData}
            style={{
              padding: '10px 16px',
              background: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔄 Actualizar
          </button>
          <button
            onClick={() => setShowScanner(true)}
            style={{
              padding: '10px 16px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            📷 Escanear QR
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: '10px 16px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScanner
          token={token}
          onScanSuccess={(reservation) => {
            showToast('success', `Reserva ${reservation.id} verificada`);
            loadData();
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Stats Cards */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {parkings.map(p => (
            <div key={p.id} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: 6 }}>{p.name}</div>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🚗</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3498db', marginBottom: '4px' }}>
                Carros disponibles: {p.availableSpots}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>updateAvailableSpots(p.id,1)} style={{padding:'6px 12px',background:'#10b981',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>+ Agregar</button>
                <button onClick={()=>updateAvailableSpots(p.id,-1)} style={{padding:'6px 12px',background:'#ef4444',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>- Quitar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          borderBottom: '2px solid #f0f0f0',
          background: '#f8f9fa'
        }}>
          <button
            onClick={() => setActiveTab('tickets')}
            style={{
              flex: 1,
              padding: '16px',
              border: 'none',
              background: activeTab === 'tickets' ? 'white' : 'transparent',
              color: activeTab === 'tickets' ? '#3498db' : '#666',
              fontWeight: activeTab === 'tickets' ? 'bold' : 'normal',
              fontSize: '16px',
              cursor: 'pointer',
              borderBottom: activeTab === 'tickets' ? '3px solid #3498db' : '3px solid transparent',
              transition: 'all 0.3s'
            }}
          >
            🎫 Tickets Activos ({filteredTickets.length})
          </button>
          <button
            onClick={() => setActiveTab('reservations')}
            style={{
              flex: 1,
              padding: '16px',
              border: 'none',
              background: activeTab === 'reservations' ? 'white' : 'transparent',
              color: activeTab === 'reservations' ? '#9b59b6' : '#666',
              fontWeight: activeTab === 'reservations' ? 'bold' : 'normal',
              fontSize: '16px',
              cursor: 'pointer',
              borderBottom: activeTab === 'reservations' ? '3px solid #9b59b6' : '3px solid transparent',
              transition: 'all 0.3s'
            }}
          >
            📅 Reservas ({filteredReservations.length})
          </button>
          <button
            onClick={() => setActiveTab('assistants')}
            style={{
              flex: 1,
              padding: '16px',
              border: 'none',
              background: activeTab === 'assistants' ? 'white' : 'transparent',
              color: activeTab === 'assistants' ? '#10b981' : '#666',
              fontWeight: activeTab === 'assistants' ? 'bold' : 'normal',
              fontSize: '16px',
              cursor: 'pointer',
              borderBottom: activeTab === 'assistants' ? '3px solid #10b981' : '3px solid transparent',
              transition: 'all 0.3s'
            }}
          >
            👥 Asistentes
          </button>
        </div>

        <div style={{ padding: '20px', maxHeight: '600px', overflowY: 'auto' }}>
          {activeTab === 'tickets' && (
            <div>
              {filteredTickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎫</div>
                  <div>No hay tickets activos</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredTickets.map(ticket => (
                    <div
                      key={ticket.id}
                      style={{
                        background: '#f8f9fa',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid #e0e0e0',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>
                            {ticket.parkingName || 'Parking'}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            Cliente: {ticket.userName || ticket.username || ticket.email}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '12px', 
                            padding: '4px 12px', 
                            background: '#10b981', 
                            color: 'white', 
                            borderRadius: '12px',
                            marginBottom: '4px'
                          }}>
                            ACTIVO
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Zona {ticket.zone} - Spot {ticket.spotNumber}
                          </div>
                        </div>
                      </div>

                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                        gap: '12px',
                        padding: '12px',
                        background: 'white',
                        borderRadius: '8px'
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Inicio</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                            {formatDate(ticket.startTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Fin Programado</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                            {formatDate(ticket.endTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Duración</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                            {formatDuration(ticket.startTime, ticket.endTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Tiempo Restante</div>
                          <div style={{ fontSize: '13px', color: '#e67e22', fontWeight: 'bold' }}>
                            {getRemainingTime(ticket.endTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Monto</div>
                          <div style={{ fontSize: '13px', color: '#27ae60', fontWeight: 'bold' }}>
                            ${parseFloat(ticket.amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reservations' && (
            <div>
              {filteredReservations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                  <div>No hay reservas pendientes</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {filteredReservations.map(reservation => (
                    <div
                      key={reservation.id}
                      style={{
                        background: '#f8f9fa',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>
                            {reservation.parkingName || 'Parking'}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            Cliente: {reservation.userName || reservation.username || reservation.email}
                          </div>
                        </div>
                        <div style={{ 
                          fontSize: '12px', 
                          padding: '4px 12px', 
                          background: reservation.status === 'confirmed' ? '#3498db' : '#f39c12', 
                          color: 'white', 
                          borderRadius: '12px',
                          height: 'fit-content'
                        }}>
                          {reservation.status === 'confirmed' ? 'CONFIRMADA' : 'PENDIENTE'}
                        </div>
                      </div>

                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                        gap: '12px',
                        padding: '12px',
                        background: 'white',
                        borderRadius: '8px'
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Inicio</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                            {formatDate(reservation.startTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Fin</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                          {/* QR de la reserva */}
                          {reservation.qrData && (
                            <ReservationQR qrData={reservation.qrData} />
                          )}
                            {formatDate(reservation.endTime)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#999', marginBottom: '2px' }}>Duración</div>
                          <div style={{ fontSize: '13px', color: '#333', fontWeight: '500' }}>
                            {formatDuration(reservation.startTime, reservation.endTime)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'assistants' && (
            <AssistantManagement token={token} managerParkings={parkings} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ParkingManagerPanel;
