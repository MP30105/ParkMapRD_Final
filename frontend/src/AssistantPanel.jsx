import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, attachAuth } from './api';
import { useToast } from './ToastProvider';
import QRScanner from './QRScanner';

export default function AssistantPanel({ token }) {
  const { showToast } = useToast();
  const [parkings, setParkings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadParkings();
    const interval = setInterval(loadParkings, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [token]);

  const loadParkings = async () => {
    try {
      // Get all parkings first
      const allParkings = await apiGet('parkmaprd/parkings', attachAuth(token));
      
      // Get assistant's assigned parkings
      try {
        const assistantAssignments = await apiGet('parkmaprd/assistant/my-parkings', attachAuth(token));
        const assistantParkingIds = assistantAssignments.map(a => a.parkingId);
        const filteredParkings = allParkings.filter(p => assistantParkingIds.includes(p.id));
        setParkings(filteredParkings);
      } catch (err) {
        console.error('Error getting assistant parkings:', err);
        // Assistant doesn't have assignments yet, show empty
        setParkings([]);
      }
      
      setLoading(false);
    } catch (error) {
      showToast('error', 'Error al cargar parqueos');
      setLoading(false);
    }
  };

  const updateCount = async (parkingId, action) => {
    try {
      setUpdating(parkingId);
      const result = await apiPost(
        'parkmaprd/assistant/update-count',
        { parkingId, action },
        attachAuth(token)
      );
      
      // Update local state
      setParkings(prev => prev.map(p => 
        p.id === parkingId 
          ? { ...p, availableSpots: result.availableSpots }
          : p
      ));
      
      showToast('success', action === 'vehicle_entered' ? 'Vehículo registrado' : 'Vehículo salió');
    } catch (error) {
      showToast('error', 'Error al actualizar conteo');
    } finally {
      setUpdating(null);
    }
  };

  const getOccupancyPercentage = (available, total) => {
    if (!total) return 0;
    return Math.round(((total - available) / total) * 100);
  };

  const getStatusColor = (available, total) => {
    const percentage = getOccupancyPercentage(available, total);
    if (percentage >= 90) return '#dc2626'; // Red
    if (percentage >= 70) return '#f59e0b'; // Orange
    return '#10b981'; // Green
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: 18,
        color: '#64748b'
      }}>
        Cargando...
      </div>
    );
  }

  if (parkings.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        padding: 20
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🅿️</div>
        <h2>No tienes parqueos asignados</h2>
        <p style={{ color: '#64748b' }}>Contacta a tu manager para obtener acceso</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>🅿️ Panel de Asistente</h1>
        <button
          onClick={() => setShowScanner(true)}
          style={{
            padding: '12px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          📷 Escanear QR
        </button>
      </div>
      <p style={{ color: '#64748b', marginBottom: 32 }}>
        Controla el flujo de vehículos en tiempo real
      </p>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScanner
          token={token}
          onScanSuccess={(reservation) => {
            showToast('success', `Reserva ${reservation.id} verificada`);
            loadParkings();
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
        {parkings.map(parking => {
          const occupancyPct = getOccupancyPercentage(parking.availableSpots, parking.totalSpots);
          const statusColor = getStatusColor(parking.availableSpots, parking.totalSpots);
          const isUpdating = updating === parking.id;

          return (
            <div
              key={parking.id}
              style={{
                background: 'white',
                border: '2px solid #e2e8f0',
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
              }}
            >
              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: 20, color: '#000000' }}>
                  {parking.name}
                </h2>
                <div style={{ 
                  display: 'inline-block',
                  padding: '6px 14px',
                  background: statusColor + '20',
                  color: statusColor,
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600
                }}>
                  {occupancyPct}% Ocupado
                </div>
              </div>

              {/* Stats */}
              <div style={{
                background: '#f8fafc',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20
              }}>
                <div style={{ 
                  fontSize: 48, 
                  fontWeight: 700, 
                  color: statusColor,
                  textAlign: 'center',
                  marginBottom: 8
                }}>
                  {parking.availableSpots}
                </div>
                <div style={{ 
                  textAlign: 'center', 
                  color: '#64748b',
                  fontSize: 14,
                  marginBottom: 16
                }}>
                  espacios disponibles de {parking.totalSpots}
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%',
                  height: 8,
                  background: '#e2e8f0',
                  borderRadius: 4,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${occupancyPct}%`,
                    height: '100%',
                    background: statusColor,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="btn primary"
                  onClick={() => updateCount(parking.id, 'vehicle_entered')}
                  disabled={isUpdating || parking.availableSpots === 0}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '16px 12px',
                    fontSize: 13,
                    background: parking.availableSpots === 0 ? '#e2e8f0' : '#3b82f6',
                    opacity: isUpdating ? 0.6 : 1
                  }}
                >
                  <span style={{ fontSize: 24 }}>🚗</span>
                  <span>Entró vehículo</span>
                </button>

                <button
                  className="btn"
                  onClick={() => updateCount(parking.id, 'vehicle_exited')}
                  disabled={isUpdating || parking.availableSpots === parking.totalSpots}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '16px 12px',
                    fontSize: 13,
                    background: parking.availableSpots === parking.totalSpots ? '#e2e8f0' : '#10b981',
                    color: 'white',
                    opacity: isUpdating ? 0.6 : 1
                  }}
                >
                  <span style={{ fontSize: 24 }}>✅</span>
                  <span>Salió vehículo</span>
                </button>
              </div>

              {/* Info */}
              <div style={{
                marginTop: 16,
                padding: 12,
                background: '#fef3c7',
                borderRadius: 8,
                fontSize: 12,
                color: '#92400e'
              }}>
                💡 Los cambios se reflejan inmediatamente en el sistema
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
