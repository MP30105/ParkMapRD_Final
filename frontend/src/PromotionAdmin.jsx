import React, { useState, useEffect } from 'react';
import api from './api';

const PromotionAdmin = ({ token, user }) => {
  const [promotions, setPromotions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    description: '',
    type: 'PERCENTAGE',
    discountPercent: '',
    discountAmount: '',
    minAmount: '',
    maxUses: '',
    validFrom: '',
    validUntil: ''
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPromotions();
  }, []);

  const loadPromotions = async () => {
    try {
      const response = await api.get('/api/parkmaprd/promotions');
      setPromotions(response.data);
    } catch (error) {
      console.error('Error loading promotions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError('');
  };

  const generateRandomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    handleInputChange('code', result);
  };

  const createPromotion = async () => {
    setError('');
    
    if (!formData.code || !formData.title || !formData.type) {
      setError('Código, título y tipo son requeridos');
      return;
    }

    if (formData.type === 'PERCENTAGE' && (!formData.discountPercent || formData.discountPercent <= 0 || formData.discountPercent > 100)) {
      setError('Porcentaje de descuento debe ser entre 1 y 100');
      return;
    }

    if (formData.type === 'FIXED' && (!formData.discountAmount || formData.discountAmount <= 0)) {
      setError('Monto de descuento debe ser mayor a 0');
      return;
    }

    setCreating(true);

    try {
      const payload = {
        ...formData,
        validFrom: formData.validFrom ? new Date(formData.validFrom).getTime() : Date.now(),
        validUntil: formData.validUntil ? new Date(formData.validUntil).getTime() : (Date.now() + 30 * 24 * 60 * 60 * 1000),
        discountPercent: formData.type === 'PERCENTAGE' ? parseFloat(formData.discountPercent) : null,
        discountAmount: formData.type === 'FIXED' ? parseFloat(formData.discountAmount) : null,
        minAmount: formData.minAmount ? parseFloat(formData.minAmount) : null,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : null
      };

      await api.post('/api/parkmaprd/admin/promotions', payload);
      
      // Reset form
      setFormData({
        code: '',
        title: '',
        description: '',
        type: 'PERCENTAGE',
        discountPercent: '',
        discountAmount: '',
        minAmount: '',
        maxUses: '',
        validFrom: '',
        validUntil: ''
      });
      
      setShowCreateForm(false);
      loadPromotions();
    } catch (error) {
      setError(error.response?.data?.error || 'Error creando promoción');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (promo) => {
    const now = Date.now();
    if (!promo.isActive) return '#ef4444';
    if (now < promo.validFrom) return '#f59e0b';
    if (now > promo.validUntil) return '#6b7280';
    if (promo.maxUses && promo.currentUses >= promo.maxUses) return '#ef4444';
    return '#10b981';
  };

  const getStatusText = (promo) => {
    const now = Date.now();
    if (!promo.isActive) return 'Inactiva';
    if (now < promo.validFrom) return 'Programada';
    if (now > promo.validUntil) return 'Expirada';
    if (promo.maxUses && promo.currentUses >= promo.maxUses) return 'Agotada';
    return 'Activa';
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Cargando promociones...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>🎁 Administración de Promociones</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {showCreateForm ? '❌ Cancelar' : '➕ Nueva Promoción'}
        </button>
      </div>

      {showCreateForm && (
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <h3 style={{ marginTop: 0 }}>Crear Nueva Promoción</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Código Promocional *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => handleInputChange('code', e.target.value.toUpperCase())}
                  style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  placeholder="CODIGO123"
                />
                <button
                  type="button"
                  onClick={generateRandomCode}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  🎲
                </button>
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Título *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                placeholder="Descuento de Bienvenida"
              />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', minHeight: '60px' }}
              placeholder="Descripción de la promoción..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Tipo *
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleInputChange('type', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              >
                <option value="PERCENTAGE">Porcentaje</option>
                <option value="FIXED">Monto Fijo</option>
                <option value="FIRST_TIME">Primera Vez</option>
                <option value="LOYALTY">Lealtad</option>
                <option value="SEASONAL">Estacional</option>
              </select>
            </div>

            {formData.type === 'PERCENTAGE' && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                  Descuento (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.discountPercent}
                  onChange={(e) => handleInputChange('discountPercent', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  placeholder="20"
                />
              </div>
            )}

            {formData.type === 'FIXED' && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                  Descuento ($)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formData.discountAmount}
                  onChange={(e) => handleInputChange('discountAmount', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  placeholder="5.00"
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Compra Mínima ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.minAmount}
                onChange={(e) => handleInputChange('minAmount', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                placeholder="10.00"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Usos Máximos
              </label>
              <input
                type="number"
                min="1"
                value={formData.maxUses}
                onChange={(e) => handleInputChange('maxUses', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                placeholder="100"
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Válido Desde
              </label>
              <input
                type="datetime-local"
                value={formData.validFrom}
                onChange={(e) => handleInputChange('validFrom', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
                Válido Hasta
              </label>
              <input
                type="datetime-local"
                value={formData.validUntil}
                onChange={(e) => handleInputChange('validUntil', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={createPromotion}
              disabled={creating}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: creating ? '#9ca3af' : '#10b981',
                color: 'white',
                fontWeight: 'bold',
                cursor: creating ? 'not-allowed' : 'pointer'
              }}
            >
              {creating ? 'Creando...' : 'Crear Promoción'}
            </button>
            
            <button
              onClick={() => setShowCreateForm(false)}
              style={{
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Promotions List */}
      <div>
        <h3>Promociones Existentes ({promotions.length})</h3>
        
        {promotions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
            No hay promociones creadas
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {promotions.map((promo) => (
              <div key={promo.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: 'white'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '16px' }}>{promo.title}</h4>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        color: 'white',
                        backgroundColor: getStatusColor(promo)
                      }}>
                        {getStatusText(promo)}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', fontSize: '14px', color: '#4b5563' }}>
                      <div><strong>Código:</strong> {promo.code}</div>
                      <div><strong>Tipo:</strong> {promo.type}</div>
                      <div>
                        <strong>Descuento:</strong> {' '}
                        {promo.discountPercent ? `${promo.discountPercent}%` : `$${promo.discountAmount}`}
                      </div>
                      <div><strong>Usos:</strong> {promo.currentUses}/{promo.maxUses || '∞'}</div>
                      <div><strong>Creada:</strong> {formatDate(promo.createdAt)}</div>
                      <div><strong>Expira:</strong> {formatDate(promo.validUntil)}</div>
                    </div>
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

export default PromotionAdmin;