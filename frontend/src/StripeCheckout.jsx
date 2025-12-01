import React, { useState } from 'react';
import api from './api';
import ParkingRating from './ParkingRating';

const StripeCheckout = ({ parking, duration, zone, spotNumber, onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  const baseAmount = (duration / 60) * 2.5;
  const finalAmount = promoValidation?.valid ? promoValidation.finalAmount : baseAmount;
  const discount = promoValidation?.valid ? promoValidation.discount : 0;

  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoValidation(null);
      return;
    }
    
    setValidatingPromo(true);
    try {
      const response = await api.post('/api/parkmaprd/promotions/validate', {
        code: promoCode,
        amount: baseAmount
      });
      
      setPromoValidation(response.data);
      setError(null);
    } catch (err) {
      setPromoValidation({
        valid: false,
        error: err.response?.data?.error || 'Código inválido'
      });
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        parkingId: parking.id,
        duration,
        zone,
        spotNumber,
        promoCode: promoValidation?.valid ? promoCode : null,
        finalAmount: finalAmount
      };

      const response = await api.post('/api/parkmaprd/tickets/checkout', payload);

      // Apply promotion if valid
      if (promoValidation?.valid && promoCode) {
        await api.post('/api/parkmaprd/promotions/apply', {
          promotionId: promoValidation.promotion.id,
          ticketId: response.data.ticketId,
          discountApplied: discount
        });
      }

      // Redirect to Stripe Checkout
      if (response.data.url) {
        window.location.href = response.data.url;
      } else if (response.data.sessionId) {
        window.location.href = `https://checkout.stripe.com/pay/${response.data.sessionId}`;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || 'Error al procesar el pago');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1001
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '12px',
        maxWidth: '450px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '24px', color: '#333' }}>
          💳 Confirmar Pago
        </h3>

        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666', fontWeight: '500' }}>Estacionamiento:</span>
            <span style={{ fontWeight: 'bold', color: '#333' }}>{parking.name}</span>
            <div style={{ marginTop: '4px' }}>
              <ParkingRating parkingId={parking.id} size="small" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666', fontWeight: '500' }}>Zona:</span>
            <span style={{ color: '#333' }}>{zone}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666', fontWeight: '500' }}>Espacio:</span>
            <span style={{ color: '#333' }}>#{spotNumber}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666', fontWeight: '500' }}>Duración:</span>
            <span style={{ color: '#333' }}>{duration} minutos</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666', fontWeight: '500' }}>Subtotal:</span>
            <span style={{ color: '#333' }}>${baseAmount.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#10b981', fontWeight: '500' }}>Descuento ({promoCode}):</span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '2px solid #dee2e6',
            marginTop: '12px'
          }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>Total:</span>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
              ${finalAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Promo Code Section */}
        <div style={{
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>🏷️</span>
            <span style={{ fontWeight: '600', color: '#0c4a6e' }}>Código Promocional</span>
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              onBlur={validatePromoCode}
              placeholder="Ingresa tu código"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '14px',
                textTransform: 'uppercase'
              }}
            />
            <button
              onClick={validatePromoCode}
              disabled={validatingPromo || !promoCode.trim()}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: validatingPromo ? '#94a3b8' : '#0ea5e9',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: validatingPromo ? 'not-allowed' : 'pointer'
              }}
            >
              {validatingPromo ? '...' : 'Aplicar'}
            </button>
          </div>
          
          {promoValidation && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '13px',
              backgroundColor: promoValidation.valid ? '#dcfce7' : '#fef2f2',
              color: promoValidation.valid ? '#166534' : '#dc2626'
            }}>
              {promoValidation.valid ? (
                <span>✅ Código aplicado: {promoValidation.promotion.title}</span>
              ) : (
                <span>❌ {promoValidation.error}</span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '15px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{
          backgroundColor: '#e3f2fd',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '20px',
          fontSize: '13px',
          color: '#1565c0'
        }}>
          <strong>🔒 Pago seguro:</strong> Tu información está protegida por Stripe, 
          la plataforma de pagos más segura del mundo.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px',
              border: '2px solid #ddd',
              borderRadius: '8px',
              backgroundColor: 'white',
              color: '#666',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.borderColor = '#999';
                e.target.style.color = '#333';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#ddd';
              e.target.style.color = '#666';
            }}
          >
            Cancelar
          </button>

          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              flex: 2,
              padding: '14px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: loading ? '#ccc' : '#4CAF50',
              color: 'white',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(76, 175, 80, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.backgroundColor = '#45a049';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.target.style.backgroundColor = '#4CAF50';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
              }
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid white',
                  borderRadius: '50%',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Procesando...
              </span>
            ) : (
              'Proceder al Pago'
            )}
          </button>
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: '15px',
          marginBottom: 0,
          fontSize: '12px',
          color: '#999'
        }}>
          Al continuar, aceptas nuestros términos y condiciones
        </p>
      </div>

      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default StripeCheckout;
