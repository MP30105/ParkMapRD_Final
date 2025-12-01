import React, { useState, useEffect } from 'react';
import api from './api';

const PromotionsPanel = ({ token }) => {
  const [promotions, setPromotions] = useState([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState({ points: 0, totalEarned: 0, transactions: [] });
  const [promoCode, setPromoCode] = useState('');
  const [validatingCode, setValidatingCode] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPromotions();
    loadLoyaltyPoints();
  }, [token]);

  const loadPromotions = async () => {
    try {
      const response = await api.get('/api/parkmaprd/promotions');
      setPromotions(response.data);
    } catch (error) {
      console.error('Error loading promotions:', error);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLoyaltyPoints = async () => {
    try {
      const response = await api.get('/api/parkmaprd/users/me/loyalty');
      setLoyaltyPoints(response.data);
    } catch (error) {
      console.error('Error loading loyalty points:', error);
    }
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) return;
    
    setValidatingCode(true);
    setValidationResult(null);
    
    try {
      const response = await api.post('/api/parkmaprd/promotions/validate', {
        code: promoCode,
        amount: 5.00 // Example amount for validation
      });
      
      setValidationResult({
        valid: true,
        ...response.data
      });
    } catch (error) {
      setValidationResult({
        valid: false,
        error: error.response?.data?.error || 'Error validando código'
      });
    } finally {
      setValidatingCode(false);
    }
  };

  const getPromotionTypeIcon = (type) => {
    switch (type) {
      case 'PERCENTAGE': return '💯';
      case 'FIXED': return '💵';
      case 'FIRST_TIME': return '🎉';
      case 'LOYALTY': return '⭐';
      case 'SEASONAL': return '🎃';
      default: return '🎁';
    }
  };

  const getPromotionTypeLabel = (type) => {
    switch (type) {
      case 'PERCENTAGE': return 'Descuento Porcentual';
      case 'FIXED': return 'Descuento Fijo';
      case 'FIRST_TIME': return 'Primera Vez';
      case 'LOYALTY': return 'Lealtad';
      case 'SEASONAL': return 'Estacional';
      default: return type;
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎁</div>
        <div>Cargando promociones...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        🎁 Promociones y Recompensas
      </h2>

      {/* Loyalty Points Card */}
      <div style={{
        backgroundColor: '#1e293b',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        backgroundImage: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '20px' }}>⭐ Puntos de Lealtad</h3>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {loyaltyPoints.points.toLocaleString()} pts
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px', opacity: 0.9 }}>
          <div>
            <div style={{ color: '#94a3b8' }}>Total Ganados</div>
            <div style={{ fontWeight: 'bold' }}>{loyaltyPoints.totalEarned.toLocaleString()} puntos</div>
          </div>
          <div>
            <div style={{ color: '#94a3b8' }}>Próxima Recompensa</div>
            <div style={{ fontWeight: 'bold' }}>{1000 - (loyaltyPoints.points % 1000)} puntos</div>
          </div>
        </div>

        {loyaltyPoints.transactions.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #475569' }}>
            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '8px' }}>Últimas Transacciones</div>
            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
              {loyaltyPoints.transactions.slice(0, 3).map((transaction) => (
                <div key={transaction.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  fontSize: '13px'
                }}>
                  <span>{transaction.description}</span>
                  <span style={{ color: transaction.type === 'EARNED' ? '#10b981' : '#ef4444' }}>
                    {transaction.type === 'EARNED' ? '+' : '-'}{transaction.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Promo Code Validator */}
      <div style={{
        backgroundColor: '#f8fafc',
        border: '2px solid #e2e8f0',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>🏷️ Validar Código Promocional</h3>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Ingresa tu código promocional"
            style={{
              flex: 1,
              padding: '12px',
              border: '2px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '16px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          />
          <button
            onClick={validatePromoCode}
            disabled={validatingCode || !promoCode.trim()}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: validatingCode ? '#9ca3af' : '#3b82f6',
              color: 'white',
              fontWeight: 'bold',
              cursor: validatingCode ? 'not-allowed' : 'pointer'
            }}
          >
            {validatingCode ? 'Validando...' : 'Validar'}
          </button>
        </div>

        {validationResult && (
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: validationResult.valid ? '#dcfce7' : '#fef2f2',
            border: `1px solid ${validationResult.valid ? '#10b981' : '#ef4444'}`,
            color: validationResult.valid ? '#059669' : '#dc2626'
          }}>
            {validationResult.valid ? (
              <div>
                <div style={{ fontWeight: 'bold' }}>✅ Código válido: {validationResult.promotion.title}</div>
                <div style={{ fontSize: '14px', marginTop: '4px' }}>
                  Descuento: ${validationResult.discount.toFixed(2)} 
                  ({validationResult.promotion.discountPercent ? `${validationResult.promotion.discountPercent}%` : `$${validationResult.promotion.discountAmount}`})
                </div>
              </div>
            ) : (
              <div>❌ {validationResult.error}</div>
            )}
          </div>
        )}
      </div>

      {/* Active Promotions */}
      <div>
        <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>🔥 Promociones Activas</h3>
        
        {promotions.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
            <div>No hay promociones activas en este momento</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>¡Mantente atento a futuras ofertas!</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            {promotions.map((promo) => (
              <div key={promo.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px',
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '32px' }}>{getPromotionTypeIcon(promo.type)}</span>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#1f2937' }}>
                        {promo.title}
                      </h4>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#6b7280',
                        backgroundColor: '#f3f4f6',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        display: 'inline-block'
                      }}>
                        {getPromotionTypeLabel(promo.type)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{
                    backgroundColor: '#1f2937',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    letterSpacing: '1px'
                  }}>
                    {promo.code}
                  </div>
                </div>

                {promo.description && (
                  <p style={{ margin: '0 0 12px 0', color: '#4b5563', fontSize: '14px' }}>
                    {promo.description}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    <div>
                      <strong>Descuento:</strong> {' '}
                      {promo.discountPercent ? `${promo.discountPercent}% off` : `$${promo.discountAmount} off`}
                    </div>
                    {promo.minAmount && (
                      <div>Mínimo: ${promo.minAmount.toFixed(2)}</div>
                    )}
                    {promo.maxUses && (
                      <div>Usos: {promo.currentUses}/{promo.maxUses}</div>
                    )}
                  </div>
                  
                  <div style={{ textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
                    <div>Válido hasta:</div>
                    <div style={{ fontWeight: 'bold' }}>{formatDate(promo.validUntil)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PromotionsPanel;