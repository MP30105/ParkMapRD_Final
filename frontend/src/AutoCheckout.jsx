import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut } from './api';
import { useToast } from './ToastProvider';

const AutoCheckout = ({ token }) => {
  const [activeTab, setActiveTab] = useState('status');
  const [checkoutHistory, setCheckoutHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTickets, setActiveTickets] = useState([]);
  const [pendingCheckouts, setPendingCheckouts] = useState([]);
  const [locationPermission, setLocationPermission] = useState('unknown');
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check geolocation permission status
  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setLocationPermission(result.state);
      });
    }
  }, []);

  // Track user position for geolocation-based auto-checkout
  const trackPosition = useCallback(() => {
    if (!navigator.geolocation || !isTracking) return;

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000 // Cache position for 30 seconds
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await apiPost('parkmaprd/auto-checkout/position', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        } catch (error) {
          console.error('Error updating position:', error);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setLocationPermission('denied');
      },
      options
    );
  }, [isTracking]);

  // Start/stop position tracking
  useEffect(() => {
    let interval;
    if (isTracking && locationPermission === 'granted') {
      // Update position every 30 seconds
      interval = setInterval(trackPosition, 30000);
      trackPosition(); // Initial position
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTracking, locationPermission, trackPosition]);

  // Load data on component mount
  useEffect(() => {
    loadActiveTickets();
    loadCheckoutHistory();
    loadNotifications();
    loadPendingCheckouts();
  }, []);

  const loadActiveTickets = async () => {
    try {
      const response = await apiGet('parkmaprd/users/me/tickets');
      setActiveTickets(response.data.active || []);
    } catch (error) {
      console.error('Error loading active tickets:', error);
    }
  };

  const loadCheckoutHistory = async () => {
    try {
      const response = await api.get('/api/parkmaprd/auto-checkout/history');
      setCheckoutHistory(response.data || []);
    } catch (error) {
      console.error('Error loading checkout history:', error);
    }
  };

  const loadNotifications = async () => {
    try {
      const response = await apiGet('parkmaprd/notifications?limit=10');
      setNotifications(response.data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const loadPendingCheckouts = async () => {
    try {
      const response = await apiGet('parkmaprd/auto-checkout/history');
      const pending = response.data.filter(checkout => checkout.status === 'pending');
      setPendingCheckouts(pending);
    } catch (error) {
      console.error('Error loading pending checkouts:', error);
    }
  };

  const { showToast } = useToast();

  const requestLocationPermission = async () => {
    if (!navigator.geolocation) {
      showToast('error', 'Tu navegador no soporta geolocalización');
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      setLocationPermission('granted');
      setIsTracking(true);
    } catch (error) {
      setLocationPermission('denied');
      showToast('warning', 'Permiso de ubicación denegado. El auto-checkout no funcionará correctamente.');
    }
  };

  const handleManualCheckout = async (ticketId) => {
    if (!window.confirm('¿Estás seguro de que quieres hacer checkout manual de este ticket?')) {
      return;
    }

    setLoading(true);
    try {
      await apiPost(`parkmaprd/auto-checkout/manual/${ticketId}`);
      showToast('info', 'Checkout manual iniciado. Recibirás una notificación cuando se complete.');
      loadActiveTickets();
      loadPendingCheckouts();
    } catch (error) {
      console.error('Error processing manual checkout:', error);
      showToast('error', 'Error al procesar el checkout manual: ' + (error.response?.data?.error || error.message));
    }
    setLoading(false);
  };

  const handleCancelCheckout = async (checkoutId) => {
    if (!window.confirm('¿Estás seguro de que quieres cancelar este checkout?')) {
      return;
    }

    try {
      await apiPost(`parkmaprd/auto-checkout/cancel/${checkoutId}`, {
        reason: 'user_cancelled'
      });
      showToast('success', 'Checkout cancelado exitosamente.');
      loadPendingCheckouts();
    } catch (error) {
      console.error('Error cancelling checkout:', error);
      showToast('error', 'Error al cancelar el checkout: ' + (error.response?.data?.error || error.message));
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await apiPut(`parkmaprd/notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read: 1 } : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('es-DO');
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      completed: '#10b981',
      cancelled: '#6b7280',
      failed: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const getStatusText = (status) => {
    const texts = {
      pending: 'Pendiente',
      completed: 'Completado',
      cancelled: 'Cancelado',
      failed: 'Fallido'
    };
    return texts[status] || status;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#1f2937', fontSize: '28px' }}>
          🚗 Auto-Checkout
        </h2>
        <p style={{ margin: 0, color: '#6b7280' }}>
          Sistema automático de salida del estacionamiento
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '30px' }}>
        {[
          { id: 'status', label: 'Estado', icon: '📊' },
          { id: 'history', label: 'Historial', icon: '📜' },
          { id: 'notifications', label: 'Notificaciones', icon: '🔔' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
              fontWeight: activeTab === tab.id ? '600' : '400',
              cursor: 'pointer',
              fontSize: '16px',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Status Tab */}
      {activeTab === 'status' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Location Tracking Status */}
          <div style={{ 
            background: 'white', 
            padding: '25px', 
            borderRadius: '12px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1f2937', fontSize: '18px' }}>
              📍 Seguimiento de Ubicación
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: locationPermission === 'granted' ? '#10b981' : 
                                locationPermission === 'denied' ? '#ef4444' : '#f59e0b'
              }} />
              <span style={{ fontWeight: '500', color: '#000' }}>
                Estado: {locationPermission === 'granted' ? 'Autorizado' : 
                        locationPermission === 'denied' ? 'Denegado' : 'No configurado'}
              </span>
            </div>

            {locationPermission !== 'granted' && (
              <button
                onClick={requestLocationPermission}
                style={{
                  padding: '10px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Activar Seguimiento
              </button>
            )}

            {locationPermission === 'granted' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button
                  onClick={() => setIsTracking(!isTracking)}
                  style={{
                    padding: '10px 20px',
                    background: isTracking ? '#ef4444' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  {isTracking ? 'Pausar Seguimiento' : 'Iniciar Seguimiento'}
                </button>
                <span style={{ color: '#6b7280', fontSize: '14px' }}>
                  {isTracking ? '🟢 Activo' : '🔴 Pausado'}
                </span>
              </div>
            )}
          </div>

          {/* Active Tickets */}
          <div style={{ 
            background: 'white', 
            padding: '25px', 
            borderRadius: '12px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#1f2937', fontSize: '18px' }}>
              🎫 Tickets Activos
            </h3>
            
            {activeTickets.length === 0 ? (
              <p style={{ color: '#6b7280', margin: 0 }}>No tienes tickets activos</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {activeTickets.map(ticket => (
                  <div key={ticket.id} style={{
                    padding: '20px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '5px' }}>
                          {ticket.parkingName || `Parking ${ticket.parkingId}`}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '14px' }}>
                          Zona {ticket.zone} • Espacio #{ticket.spotNumber}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '14px' }}>
                          Expira: {formatTime(ticket.endTime)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleManualCheckout(ticket.id)}
                        disabled={loading}
                        style={{
                          padding: '8px 16px',
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          opacity: loading ? 0.6 : 1
                        }}
                      >
                        Checkout Manual
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Checkouts */}
          {pendingCheckouts.length > 0 && (
            <div style={{ 
              background: 'white', 
              padding: '25px', 
              borderRadius: '12px', 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#1f2937', fontSize: '18px' }}>
                ⏳ Checkouts Pendientes
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {pendingCheckouts.map(checkout => (
                  <div key={checkout.id} style={{
                    padding: '20px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    border: '1px solid #f59e0b'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '5px' }}>
                          {checkout.parkingName}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '14px' }}>
                          Método: {checkout.method} • Iniciado: {formatTime(checkout.initiatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelCheckout(checkout.id)}
                        style={{
                          padding: '8px 16px',
                          background: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div style={{ 
          background: 'white', 
          padding: '25px', 
          borderRadius: '12px', 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#1f2937', fontSize: '18px' }}>
            📜 Historial de Auto-Checkout
          </h3>
          
          {checkoutHistory.length === 0 ? (
            <p style={{ color: '#6b7280', margin: 0 }}>No hay historial de checkouts automáticos</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {checkoutHistory.map(checkout => (
                <div key={checkout.id} style={{
                  padding: '20px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: `1px solid ${getStatusColor(checkout.status)}20`,
                  borderLeft: `4px solid ${getStatusColor(checkout.status)}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                        {checkout.parkingName}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px', color: '#6b7280' }}>
                        <div>Zona {checkout.zone} • Espacio #{checkout.spotNumber}</div>
                        <div>Método: {checkout.method}</div>
                        <div>Iniciado: {formatTime(checkout.initiatedAt)}</div>
                        {checkout.completedAt && (
                          <div>Completado: {formatTime(checkout.completedAt)}</div>
                        )}
                        {checkout.finalAmount && (
                          <div>Monto final: ${checkout.finalAmount}</div>
                        )}
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      background: getStatusColor(checkout.status),
                      color: 'white',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {getStatusText(checkout.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div style={{ 
          background: 'white', 
          padding: '25px', 
          borderRadius: '12px', 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#1f2937', fontSize: '18px' }}>
            🔔 Notificaciones
          </h3>
          
          {notifications.length === 0 ? (
            <p style={{ color: '#6b7280', margin: 0 }}>No hay notificaciones</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {notifications.map(notification => (
                <div 
                  key={notification.id} 
                  onClick={() => markNotificationAsRead(notification.id)}
                  style={{
                    padding: '20px',
                    background: notification.read ? '#f8fafc' : '#eff6ff',
                    borderRadius: '8px',
                    border: notification.read ? '1px solid #e2e8f0' : '1px solid #3b82f6',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: notification.read ? '500' : '600', 
                        marginBottom: '8px',
                        color: notification.read ? '#4b5563' : '#1f2937'
                      }}>
                        {notification.title}
                      </div>
                      <div style={{ 
                        color: '#6b7280', 
                        fontSize: '14px',
                        marginBottom: '8px'
                      }}>
                        {notification.message}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                        {formatTime(notification.createdAt)}
                      </div>
                    </div>
                    {!notification.read && (
                      <div style={{
                        width: '8px',
                        height: '8px',
                        background: '#3b82f6',
                        borderRadius: '50%'
                      }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoCheckout;