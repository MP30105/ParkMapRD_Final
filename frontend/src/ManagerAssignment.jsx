import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiDelete, apiPost as apiLogin, attachAuth } from './api';
import { useToast } from './ToastProvider';

const ManagerAssignment = ({ token: initialToken }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [managers, setManagers] = useState([]);
  const [parkings, setParkings] = useState([]);
  const [users, setUsers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedParking, setSelectedParking] = useState('');

  const [token, setToken] = useState(initialToken || "");

  useEffect(() => {
    // Si no hay token, hacer login automático como admin
    if (!token) {
      apiLogin('parkmaprd/auth/login', { username: 'admin', password: 'admin' })
        .then(data => {
          if (data.token) {
            setToken(data.token);
            loadData(data.token);
          } else {
            showToast('error', 'No se pudo hacer login automático como admin');
          }
        })
        .catch(() => showToast('error', 'No se pudo hacer login automático como admin'));
    } else {
      loadData(token);
    }
  }, [token]);

  const loadData = async (activeToken = token) => {
    try {
      setLoading(true);
      const [managersData, parkingsData, usersData] = await Promise.all([
        apiGet('parkmaprd/manager/admin/managers', attachAuth(activeToken)),
        apiGet('parkmaprd/parkings', attachAuth(activeToken)),
        apiGet('parkmaprd/manager/admin/eligible-users', attachAuth(activeToken))
      ]);
      setManagers(Array.isArray(managersData) ? managersData : []);
      // Si la respuesta de parkings tiene 'results', usar esa propiedad
      if (parkingsData && Array.isArray(parkingsData.results)) {
        setParkings(parkingsData.results);
      } else if (Array.isArray(parkingsData)) {
        setParkings(parkingsData);
      } else {
        setParkings([]);
      }
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      console.error('Error loading data:', error);
      showToast('error', 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUser || !selectedParking) {
      showToast('error', 'Selecciona usuario y parqueo');
      return;
    }

    try {
      setLoading(true);
      await apiPost('parkmaprd/manager/admin/assign', {
        userId: selectedUser,
        parkingId: selectedParking
      }, attachAuth(token));

      // Forzar actualización de rol del usuario
      try {
        await apiPost(`parkmaprd/manager/admin/fix-role/${selectedUser}`, {}, attachAuth(token));
        console.log('Rol actualizado para usuario:', selectedUser);
      } catch (roleError) {
        console.warn('Error actualizando rol:', roleError);
      }
      
      showToast('success', 'Manager asignado exitosamente');
      setShowAssignModal(false);
      setSelectedUser('');
      setSelectedParking('');
      await loadData();
    } catch (error) {
      console.error('Error assigning manager:', error);
      showToast('error', error.message || 'Error al asignar manager');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (assignmentId) => {
    if (!confirm('¿Remover este manager del parqueo?')) return;

    try {
      setLoading(true);
      await apiDelete(`parkmaprd/manager/admin/assign/${assignmentId}`, attachAuth(token));
      showToast('success', 'Manager removido exitosamente');
      await loadData();
    } catch (error) {
      console.error('Error removing manager:', error);
      showToast('error', 'Error al remover manager');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('es-DO', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Group managers by parking
  const managersByParking = {};
  managers.forEach(m => {
    if (!managersByParking[m.parkingId]) {
      managersByParking[m.parkingId] = [];
    }
    managersByParking[m.parkingId].push(m);
  });

  if (loading && managers.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <div style={{ fontSize: '18px', color: '#666' }}>Cargando managers...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#333' }}>
            👥 Gestión de Managers
          </h2>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            Asigna managers a parqueos específicos
          </p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          style={{
            padding: '12px 24px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          ➕ Asignar Manager
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>👥</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3498db', marginBottom: '4px' }}>
            {managers.length}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>Asignaciones Activas</div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏢</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9b59b6', marginBottom: '4px' }}>
            {Object.keys(managersByParking).length}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>Parqueos con Managers</div>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)'
        }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>👤</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60', marginBottom: '4px' }}>
            {new Set(managers.map(m => m.userId)).size}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>Usuarios Managers</div>
        </div>
      </div>

      {/* Managers List */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px',
          background: '#f8f9fa',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 'bold',
          color: '#333'
        }}>
          Managers Asignados por Parqueo
        </div>
        
        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {parkings.map(parking => {
            const parkingManagers = managersByParking[parking.id] || [];
            if (parkingManagers.length === 0) return null;

            return (
              <div
                key={parking.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #f0f0f0'
                }}
              >
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  color: '#333', 
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🏢 {parking.name}
                  <span style={{ 
                    fontSize: '12px', 
                    background: '#e0e7ff', 
                    color: '#3730a3',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 'normal'
                  }}>
                    {parkingManagers.length} manager{parkingManagers.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '20px' }}>
                  {parkingManagers.map(manager => (
                    <div
                      key={manager.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        background: '#f8f9fa',
                        borderRadius: '8px',
                        border: '1px solid #e0e0e0'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                          👤 {manager.name || manager.username}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {manager.email}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                          Asignado: {formatDate(manager.assignedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(manager.id)}
                        disabled={loading}
                        style={{
                          padding: '8px 16px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          opacity: loading ? 0.5 : 1
                        }}
                      >
                        🗑️ Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {Object.keys(managersByParking).length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
              <div>No hay managers asignados</div>
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                Haz clic en "Asignar Manager" para comenzar
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
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
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '20px', color: '#333' }}>
              ➕ Asignar Manager a Parqueo
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Usuario
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="">Seleccionar usuario...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.email}) {user.role === 'parking_manager' ? '✓ Manager' : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                El usuario recibirá automáticamente el rol "parking_manager"
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#666', fontWeight: '500' }}>
                Parqueo
              </label>
              <select
                value={selectedParking}
                onChange={(e) => setSelectedParking(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="">Seleccionar parqueo...</option>
                {parkings.map(parking => (
                  <option key={parking.id} value={parking.id}>
                    {parking.name} - {parking.address}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUser('');
                  setSelectedParking('');
                }}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  opacity: loading ? 0.5 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAssign}
                disabled={loading || !selectedUser || !selectedParking}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: (loading || !selectedUser || !selectedParking) ? 0.5 : 1
                }}
              >
                {loading ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerAssignment;
