import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost, apiGet, attachAuth } from './api';

// Importar QRCodeSVG de forma segura
let QRCodeSVG = null;
try {
  QRCodeSVG = require('qrcode.react').QRCodeSVG;
} catch (e) {
  console.warn('qrcode.react no disponible:', e);
}

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(30);
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const sessionId = searchParams.get('session_id');
  const reservationId = searchParams.get('reservationId');
  const isMockPayment = sessionId?.startsWith('mock_');

  // Auto-confirmar pago simulado para reservas y obtener datos
  useEffect(() => {
    const confirmAndFetch = async () => {
      const token = localStorage.getItem('token');
      
      try {
        if (isMockPayment && reservationId && token) {
          await apiPost(`parkmaprd/reservations/${reservationId}/confirm-mock`, {}, attachAuth(token));
          console.log('✓ Reserva confirmada automáticamente (modo desarrollo)');
        }
        
        // Obtener los datos de la reserva para mostrar el QR
        if (reservationId && token) {
          const reservations = await apiGet('parkmaprd/users/me/reservations', attachAuth(token));
          const res = reservations?.find(r => r.id === reservationId);
          if (res) {
            setReservation(res);
          }
        }
      } catch (err) {
        console.error('Error:', err);
        setError(err.message || 'Error al confirmar reserva');
      } finally {
        setLoading(false);
      }
    };
    
    confirmAndFetch();
  }, [isMockPayment, reservationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  // Generar datos del QR
  const qrData = reservation?.qrData || (reservationId ? JSON.stringify({
    reservationId,
    type: 'parking_reservation',
    timestamp: Date.now()
  }) : null);

  return (
    <div style={{
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      minHeight:'80vh',
      padding: 24,
      background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%)'
    }}>
      <div style={{
        background: 'white',
        padding: 32,
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: 400,
        width: '100%'
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{color:'#10b981', margin: '0 0 8px 0'}}>¡Pago exitoso!</h2>
        <p style={{ color: '#64748b', marginBottom: 24 }}>Tu reserva ha sido confirmada.</p>
        
        {loading ? (
          <div style={{ padding: 20, color: '#64748b' }}>Cargando tu boleta...</div>
        ) : error ? (
          <div style={{ padding: 20, color: '#ef4444' }}>
            <p>⚠️ {error}</p>
            <p style={{ fontSize: 13, color: '#64748b' }}>Tu reserva fue procesada. ID: {reservationId}</p>
          </div>
        ) : (
          <>
            {/* Código QR */}
            {qrData && (
              <div style={{
                background: '#f8fafc',
                padding: 24,
                borderRadius: 12,
                marginBottom: 24,
                border: '2px dashed #cbd5e1'
              }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#000', fontSize: 16 }}>
                  🎫 Tu Boleta de Entrada
                </h3>
                <div style={{
                  background: 'white',
                  padding: 16,
                  borderRadius: 8,
                  display: 'inline-block',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                  {QRCodeSVG ? (
                    <QRCodeSVG 
                      value={qrData} 
                      size={180}
                      level="H"
                      includeMargin={true}
                    />
                  ) : (
                    <div style={{ padding: 20, background: '#f1f5f9', borderRadius: 8 }}>
                      <p style={{ fontSize: 12, color: '#000', margin: 0 }}>Código: {reservationId}</p>
                    </div>
                  )}
                </div>
                <p style={{ 
                  fontSize: 13, 
                  color: '#64748b', 
                  marginTop: 16,
                  marginBottom: 0
                }}>
                  📱 Escanea este código al llegar al parqueo
                </p>
              </div>
            )}

            {/* Detalles de la reserva */}
            {reservation && (
              <div style={{
                background: '#f0f9ff',
                padding: 16,
                borderRadius: 8,
                marginBottom: 24,
                textAlign: 'left'
              }}>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'black' }}>
                  <strong style={{ color: 'black' }}>ID:</strong> <span style={{ color: 'black' }}>{reservation.id}</span>
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'black' }}>
                  <strong style={{ color: 'black' }}>Parqueo:</strong> <span style={{ color: 'black' }}>{reservation.parkingId}</span>
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'black' }}>
                  <strong style={{ color: 'black' }}>Espacio:</strong> <span style={{ color: 'black' }}>#{reservation.spotNumber}</span>
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'black' }}>
                  <strong style={{ color: 'black' }}>Fecha:</strong> <span style={{ color: 'black' }}>{new Date(reservation.startTime).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: 'black' }}>
                  <strong style={{ color: 'black' }}>Hora:</strong> <span style={{ color: 'black' }}>{new Date(reservation.startTime).toLocaleTimeString()} - {new Date(reservation.endTime).toLocaleTimeString()}</span>
                </div>
                <div style={{ fontSize: 14, color: 'black', fontWeight: 600 }}>
                  <strong style={{ color: 'black' }}>Total:</strong> <span style={{ color: 'black' }}>RD${reservation.amount?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            )}

            {!reservation && reservationId && (
              <p style={{ color: '#64748b', marginBottom: 16 }}>
                ID de reserva: <strong>{reservationId}</strong>
              </p>
            )}

            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              💡 Guarda una captura de pantalla del código QR
            </p>
          </>
        )}
        
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>
          Redirigiendo al inicio en {countdown} segundos...
        </p>
        
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button 
            style={{
              padding:'12px 24px',
              background:'#10b981',
              color:'white',
              border:'none',
              borderRadius:8,
              fontSize:15,
              fontWeight: 600,
              cursor:'pointer'
            }} 
            onClick={()=>navigate('/home')}
          >
            Ir al inicio
          </button>
          <button 
            style={{
              padding:'12px 24px',
              background:'#3b82f6',
              color:'white',
              border:'none',
              borderRadius:8,
              fontSize:15,
              fontWeight: 600,
              cursor:'pointer'
            }} 
            onClick={() => window.print()}
          >
            🖨️ Imprimir
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
