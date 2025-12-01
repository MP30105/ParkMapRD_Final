import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiDelete, attachAuth } from './api';
import { useToast } from './ToastProvider';

export default function AssistantManagement({ token, managerParkings }) {
  const { showToast } = useToast();
  const [assistants, setAssistants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Check current user role
  useEffect(() => {
    const checkUser = async () => {
      try {
        const userInfo = await apiGet('parkmaprd/users/me', attachAuth(token));
        console.log('Current user role:', userInfo.role);
        if (userInfo.role !== 'parking_manager') {
          console.error('User does not have parking_manager role. Current role:', userInfo.role);
        }
      } catch (error) {
        console.log('Error getting user info:', error);
      }
    };
    checkUser();
  }, [token]);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    name: '',
    parkingId: ''
  });

  useEffect(() => {
    loadAssistants();
  }, [token]);

  const loadAssistants = async () => {
    try {
      setLoading(true);
      const data = await apiGet('parkmaprd/assistant/my-assistants', attachAuth(token));
      setAssistants(data);
    } catch (error) {
      showToast('error', 'Error al cargar asistentes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.email || !formData.password || !formData.name || !formData.parkingId) {
      showToast('error', 'Todos los campos son requeridos');
      return;
    }

    try {
      await apiPost('parkmaprd/assistant/create', formData, attachAuth(token));
      showToast('success', 'Asistente creado exitosamente');
      setShowCreateModal(false);
      setFormData({ username: '', email: '', password: '', name: '', parkingId: '' });
      loadAssistants();
    } catch (error) {
      showToast('error', error.response?.data?.error || 'Error al crear asistente');
    }
  };

  const handleDeactivate = async (assistantId) => {
    if (!window.confirm('¿Estás seguro de desactivar este asistente?')) return;
    
    try {
      await apiDelete(`parkmaprd/assistant/${assistantId}`, attachAuth(token));
      showToast('success', 'Asistente desactivado');
      loadAssistants();
    } catch (error) {
      showToast('error', 'Error al desactivar asistente');
    }
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Cargando asistentes...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#000' }}>👥 Asistentes de Parqueo</h2>
        <button 
          onClick={() => setShowCreateModal(true)}
          disabled={!managerParkings || managerParkings.length === 0}
          style={{
            padding: '12px 20px',
            background: (!managerParkings || managerParkings.length === 0) ? '#94a3b8' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: (!managerParkings || managerParkings.length === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          ➕ Crear Asistente
        </button>
      </div>

      {(!managerParkings || managerParkings.length === 0) && (
        <div style={{ 
          padding: 20, 
          background: '#fef3c7', 
          borderRadius: 8, 
          marginBottom: 20,
          color: '#92400e'
        }}>
          ⚠️ No tienes parqueos asignados. No puedes crear asistentes.
        </div>
      )}

      {assistants.length === 0 ? (
        <div style={{ 
          padding: 40, 
          textAlign: 'center', 
          background: '#f8fafc', 
          borderRadius: 12,
          color: '#64748b'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <p style={{ color: '#000' }}>No hay asistentes creados aún</p>
          {managerParkings && managerParkings.length > 0 && (
            <button 
              onClick={() => setShowCreateModal(true)}
              style={{ 
                marginTop: 16,
                padding: '12px 24px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Crear primer asistente
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {assistants.map(assistant => (
            <div 
              key={assistant.id}
              style={{
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 18, color: '#000' }}>{assistant.name}</h3>
                  <span style={{
                    padding: '4px 12px',
                    background: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    Asistente
                  </span>
                </div>
                <div style={{ color: '#000', fontSize: 14, marginBottom: 4 }}>
                  👤 Usuario: <strong>{assistant.username}</strong>
                </div>
                <div style={{ color: '#000', fontSize: 14, marginBottom: 4 }}>
                  ✉️ Email: {assistant.email}
                </div>
                <div style={{ color: '#000', fontSize: 14, marginBottom: 4 }}>
                  🏢 Parqueo: <strong>{assistant.parkingName}</strong>
                </div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                  Creado por: {assistant.createdByUsername} • {new Date(assistant.createdAt * 1000).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => handleDeactivate(assistant.id)}
                style={{ 
                  padding: '10px 16px',
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#dc2626',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                🗑️ Desactivar
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 32,
            maxWidth: 500,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginTop: 0, color: '#000' }}>➕ Crear Asistente de Parqueo</h2>
            <p style={{ color: '#64748b', marginBottom: 24 }}>
              Los asistentes podrán actualizar la cantidad de vehículos en el parqueo.
            </p>
            
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#000' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Juan Pérez"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#000'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#000' }}>
                  Nombre de usuario
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Ej: asistente_juan"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#000'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#000' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="asistente@ejemplo.com"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#000'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#000' }}>
                  Contraseña
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#000'
                  }}
                  minLength={6}
                  required
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#000' }}>
                  Asignar a parqueo
                </label>
                <select
                  value={formData.parkingId}
                  onChange={e => setFormData({ ...formData, parkingId: e.target.value })}
                  style={{
                    width: '100%',
                    padding: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 14,
                    boxSizing: 'border-box',
                    color: '#000'
                  }}
                  required
                >
                  <option value="">Seleccionar parqueo...</option>
                  {managerParkings && managerParkings.map(parking => (
                    <option key={parking.id} value={parking.id}>
                      {parking.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ username: '', email: '', password: '', name: '', parkingId: '' });
                  }}
                  style={{ 
                    flex: 1,
                    padding: '12px 20px',
                    background: '#f1f5f9',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ 
                    flex: 1,
                    padding: '12px 20px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Crear Asistente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
