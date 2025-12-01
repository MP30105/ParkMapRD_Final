import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PaymentCancelled = () => {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/map');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#fff3e0',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 20px',
          backgroundColor: '#ff9800',
          borderRadius: '50%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'scaleIn 0.5s ease-out'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>

        <h2 style={{ 
          color: '#e65100', 
          marginBottom: '16px',
          fontSize: '28px',
          fontWeight: 'bold'
        }}>
          Pago Cancelado
        </h2>

        <p style={{ 
          color: '#666', 
          fontSize: '16px',
          lineHeight: '1.6',
          marginBottom: '24px'
        }}>
          Tu pago no ha sido procesado. No se ha realizado ningún cargo a tu tarjeta.
        </p>

        <div style={{
          backgroundColor: '#fff3e0',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '24px',
          textAlign: 'left'
        }}>
          <p style={{ 
            color: '#e65100', 
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '12px'
          }}>
            ¿Por qué cancelar?
          </p>
          <ul style={{ 
            margin: 0,
            paddingLeft: '20px',
            color: '#666',
            fontSize: '14px',
            lineHeight: '1.8'
          }}>
            <li>Encontraste un estacionamiento más cercano</li>
            <li>Cambiaste de planes</li>
            <li>Necesitas revisar los detalles</li>
          </ul>
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <button
            onClick={() => navigate('/map')}
            style={{
              flex: 1,
              padding: '14px',
              border: '2px solid #ff9800',
              borderRadius: '8px',
              backgroundColor: 'white',
              color: '#ff9800',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#fff3e0';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'white';
            }}
          >
            Ver Mapa
          </button>

          <button
            onClick={() => navigate('/home')}
            style={{
              flex: 1,
              padding: '14px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#ff9800',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f57c00';
              e.target.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#ff9800';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            Ir a Inicio
          </button>
        </div>

        <p style={{ 
          color: '#999', 
          fontSize: '14px',
          margin: 0
        }}>
          Redirigiendo al mapa en {countdown} segundo{countdown !== 1 ? 's' : ''}...
        </p>
      </div>

      <style>
        {`
          @keyframes scaleIn {
            from {
              transform: scale(0);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};

export default PaymentCancelled;
