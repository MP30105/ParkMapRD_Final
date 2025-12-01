import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import PromotionAdmin from './PromotionAdmin';
import AuditDashboard from './AuditDashboard';
import ComparisonCenter from './ComparisonCenter';
import PromotionsPanel from './PromotionsPanel';
import SmartReminders from './SmartReminders';
import AutoCheckout from './AutoCheckout';
import Home from './Home';
import Wallet from './Wallet';
import ManagerAssignment from './ManagerAssignment';
import { useToast } from './ToastProvider';
import { apiGet, apiPost, apiPut, apiDelete, attachAuth } from './api';
import 'leaflet/dist/leaflet.css';

export default function AdminPanel({ token, user, onParkingUpdate }) {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [parkings, setParkings] = useState([]);
  const [addingParking, setAddingParking] = useState(false);
  const [newParking, setNewParking] = useState({ name: '', totalSpots: 10, securityVideoUrl: '', hourlyRate: 100 });
  const [clickPosition, setClickPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', password: '', name: '' });
  const [hoveredId, setHoveredId] = useState(null);
  const [editingParking, setEditingParking] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [activeTab, setActiveTab] = useState('parkings');
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ 
    email: '', 
    password: '', 
    name: '', 
    username: '',
    role: 'user' 
  });
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  
  const deleteUserById = async (targetUser) => {
    try {
      await apiDelete(`parkmaprd/admin/users/${targetUser.id}`, attachAuth(token));
      setUsers(prev => prev.filter(x => x.id !== targetUser.id));
      if (selectedUser?.id === targetUser.id) setSelectedUser(null);
      showToast('success', `Usuario eliminado: ${targetUser.username || targetUser.email || targetUser.id}`);
    } catch (e) {
      showToast('error', e.message || 'Error eliminando usuario');
    }
  };
  const [occupancyOpen, setOccupancyOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchUsers();
    fetchParkings();
  }, [token]);

  const fetchUsers = async () => {
    try {
      const data = await apiGet('parkmaprd/admin/users', attachAuth(token));
      setUsers(data);
    } catch (e) {
      console.error(e);
      showToast('error', 'No se pudieron cargar usuarios');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.password || !newUserForm.username) {
      showToast('warning', 'Email, username y contraseña son requeridos');
      return;
    }
    try {
      await apiPost('parkmaprd/admin/users', newUserForm, attachAuth(token));
      showToast('success', `✅ Usuario ${newUserForm.username} creado exitosamente`);
      setNewUserForm({ email: '', password: '', name: '', username: '', role: 'user' });
      setShowNewUserForm(false);
      fetchUsers();
    } catch (e) {
      showToast('error', e.message || 'Error al crear usuario');
    }
  };

  const fetchParkings = async () => {
    try {
      const data = await apiGet('parkmaprd/parkings');
      setParkings(data);
    } catch (e) { console.error(e); }
  };

  const createParking = async (e) => {
    e.preventDefault();
    if (!newParking.name || !clickPosition) { showToast('info','Nombre y posición requeridos'); return; }
    if (!Number.isInteger(Number(newParking.totalSpots)) || Number(newParking.totalSpots) <= 0) { showToast('error','Total de espacios debe ser > 0'); return; }
    setLoading(true);
    try {
      const id = 'p' + Date.now();
      const payload = {
        id,
        name: newParking.name,
        lat: clickPosition.lat.toFixed(6),
        lng: clickPosition.lng.toFixed(6),
        totalSpots: Number(newParking.totalSpots),
        availableSpots: Number(newParking.totalSpots),
        securityVideoUrl: newParking.securityVideoUrl || '',
        hourlyRate: Number(newParking.hourlyRate) || 100,
        sellsTickets: newParking.sellsTickets !== false
      };
      await apiPost('parkmaprd/admin/parkings', payload, attachAuth(token));
      fetchParkings();
      if (onParkingUpdate) onParkingUpdate();
      setNewParking({ name: '', totalSpots: 10, securityVideoUrl: '', hourlyRate: 100 });
      setClickPosition(null);
      setAddingParking(false);
    } catch (e) {
      showToast('error', e.message || 'Error creando parqueo');
    } finally {
      setLoading(false);
    }
  };

  const updateAvailability = async (id, spots) => {
    try {
      await apiPut(`parkmaprd/admin/parkings/${id}`, { availableSpots: spots }, attachAuth(token));
      fetchParkings();
    } catch (e) { showToast('error', 'No se pudo actualizar'); }
  };

  const updateSecurityVideo = async (id, securityVideoUrl) => {
    try {
      setLoading(true);
      await apiPut(`parkmaprd/admin/parkings/${id}`, { securityVideoUrl }, attachAuth(token));
      fetchParkings();
    } catch (e) {
      showToast('error', e.message || 'No se pudo actualizar');
    } finally {
      setLoading(false);
    }
  };

  const updateHourlyRate = async (id, hourlyRate) => {
    try {
      setLoading(true);
      await apiPut(`parkmaprd/admin/parkings/${id}`, { hourlyRate: parseInt(hourlyRate) }, attachAuth(token));
      fetchParkings();
    } catch (e) {
      showToast('error', e.message || 'No se pudo actualizar precio');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (parking) => {
    setEditingParking(parking.id);
    setEditForm({
      name: parking.name,
      totalSpots: parking.totalSpots,
      availableSpots: parking.availableSpots,
      lat: parking.lat,
      lng: parking.lng,
      hourlyRate: parking.hourlyRate || 100,
      securityVideoUrl: parking.securityVideoUrl || ''
    });
  };

  const cancelEditing = () => {
    setEditingParking(null);
    setEditForm({});
  };

  const saveEditing = async (id) => {
    try {
      setLoading(true);
      await apiPut(`parkmaprd/admin/parkings/${id}`, editForm, attachAuth(token));
      fetchParkings();
      if (onParkingUpdate) onParkingUpdate();
      setEditingParking(null);
      setEditForm({});
    } catch (e) {
      showToast('error', e.message || 'No se pudo actualizar el parqueo');
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      showToast('error','Por favor selecciona un archivo CSV válido');
      return;
    }
    
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const csv = e.target.result;
      const lines = csv.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1, 6).map(line => { // Preview only first 5 rows
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });
      setCsvPreview({ headers, rows });
    };
    reader.readAsText(file);
  };

  const importCsvParkings = async () => {
    if (!csvFile) return;
    
    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const parkings = [];
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          if (values.length < 2) continue; // Skip empty rows
          
          const parking = {};
          headers.forEach((header, index) => {
            parking[header] = values[index] || '';
          });
          
          // Map CSV headers to expected fields
          const parkingData = {
            id: parking.id || parking.codigo || `csv_${Date.now()}_${i}`,
            name: parking.name || parking.nombre || parking.parking || 'Parqueo Sin Nombre',
            lat: parseFloat(parking.lat || parking.latitud || parking.latitude || '18.4861'),
            lng: parseFloat(parking.lng || parking.longitud || parking.longitude || '-69.9312'),
            totalSpots: parseInt(parking.totalspots || parking.total_spots || parking.espacios || parking.spaces || '10'),
            availableSpots: parseInt(parking.availablespots || parking.available_spots || parking.disponibles || parking.available || parking.totalspots || parking.total_spots || parking.espacios || parking.spaces || '10'),
            hourlyRate: parseInt(parking.hourlyrate || parking.hourly_rate || parking.precio || parking.price || '100'),
            securityVideoUrl: parking.securityvideourl || parking.security_video_url || parking.video || parking.camera || ''
          };
          
          parkings.push(parkingData);
        }
        
        // Send bulk import request
        try {
          const result = await apiPost('parkmaprd/admin/parkings/bulk', { parkings }, attachAuth(token));
          if (result.errors > 0) {
            console.log('Errores de importación:', result.results.errors);
          }
          showToast('success', `Importación: ${result.imported} ok, ${result.errors} errores`);
          fetchParkings();
          // Notificar al componente padre para actualizar la lista general
          if (onParkingUpdate) onParkingUpdate();
          setCsvFile(null);
          setCsvPreview([]);
        } catch (e) {
          showToast('error', 'Error en la importación: ' + (e.message || 'desconocido'));
        }
      } catch (e) {
        showToast('error', 'Error procesando el archivo CSV: ' + e.message);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(csvFile);
  };

  function MapClickHandler() {
    useMapEvents({
      click: (e) => {
        if (addingParking) {
          setClickPosition(e.latlng);
        }
      }
    });
    return clickPosition && addingParking ? (
      <Marker position={[clickPosition.lat, clickPosition.lng]} icon={L.icon({
        iconUrl: process.env.PUBLIC_URL + '/parking-marker.png',
        iconSize: [60,60], iconAnchor: [30,60], popupAnchor: [0,-48],
        className: 'parking-marker-icon adding'
      })}>
        <Tooltip direction="top" offset={[0,-10]} opacity={0.95}>Nuevo parqueo (haz clic en Crear)</Tooltip>
      </Marker>
    ) : null;
  }

  const deleteParking = async (id) => {
    if (!confirm('Eliminar parking ' + id + '?')) return;
    try {
      await apiDelete(`parkmaprd/admin/parkings/${id}`, attachAuth(token));
      fetchParkings();
      if (onParkingUpdate) onParkingUpdate();
    } catch (e) { showToast('error', e.message || 'No se pudo eliminar el parqueo'); }
  };

  const createAdmin = async (e) => {
    e.preventDefault();
    try {
      const data = await apiPost('parkmaprd/admin/admins', { ...adminForm, role: 'admin' }, attachAuth(token));
      showToast('success','Admin creado: ' + data.email);
      setAdminForm({ email: '', password: '', name: '' });
      fetchUsers();
    } catch (e) {
      showToast('error', e.message || 'No se pudo crear admin');
    }
  };

  // Calculate metrics
  const totalSpots = parkings.reduce((sum, p) => sum + (p.totalSpots || 0), 0);
  const occupiedSpots = parkings.reduce((sum, p) => sum + ((p.totalSpots || 0) - (p.availableSpots || 0)), 0);
  const occupancyRate = totalSpots > 0 ? ((occupiedSpots / totalSpots) * 100).toFixed(1) : 0;
  const totalRevenue = users.reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  const exportCSV = () => {
    const headers = ['ID', 'Nombre', 'Latitud', 'Longitud', 'Total Espacios', 'Disponibles', 'Ocupación %'];
    const rows = parkings.map(p => [
      p.id,
      p.name,
      p.lat,
      p.lng,
      p.totalSpots,
      p.availableSpots,
      p.totalSpots > 0 ? (((p.totalSpots - p.availableSpots) / p.totalSpots) * 100).toFixed(1) : 0
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parkings_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTabContent = () => {
    switch(activeTab) {
      case 'parkings':
        return renderParkingsTab();
      case 'csv':
        return renderCsvTab();
      case 'tickets':
        return <Home token={token} user={user} />;
      case 'wallet':
        return <Wallet token={token} />;
      case 'managers':
        return <ManagerAssignment token={token} />;
      case 'comparison':
        return <ComparisonCenter token={token} />;
      case 'promotions-admin':
        return (
          <div>
            <PromotionAdmin token={token} user={user} />
            <div style={{marginTop: 30, borderTop: '2px solid #e5e7eb', paddingTop: 30}}>
              <PromotionsPanel token={token} />
            </div>
          </div>
        );
      case 'reminders':
        return <SmartReminders token={token} />;
      case 'auto-checkout':
        return <AutoCheckout token={token} />;
      case 'audit':
        return <AuditDashboard token={token} user={user} />;
      case 'users':
        return renderUsersTab();
      default:
        return renderParkingsTab();
    }
  };

  const renderCsvTab = () => (
    <div style={{padding:20}}>
      <h3 style={{color:'#f8fafc'}}>📊 Importar Parqueos desde CSV</h3>
      
      <div style={{marginBottom:20,padding:16,background:'#f0f9ff',border:'1px solid #0ea5e9',borderRadius:8}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
          <h4 style={{margin:0,color:'#0c4a6e'}}>📋 Formato del CSV</h4>
          <a 
            href="/sample_parkings.csv" 
            download="ejemplo_parqueos.csv"
            style={{
              padding:'6px 12px',
              background:'#0ea5e9',
              color:'white',
              textDecoration:'none',
              borderRadius:4,
              fontSize:12,
              fontWeight:'bold'
            }}
          >
            📥 Descargar Ejemplo
          </a>
        </div>
        <p style={{margin:'0 0 8px 0',fontSize:14,color:'#075985'}}>
          Tu archivo CSV debe incluir las siguientes columnas (el orden no importa):
        </p>
        <code style={{display:'block',background:'white',padding:12,borderRadius:4,fontSize:12,color:'#1e40af'}}>
          id,name,lat,lng,totalSpots,availableSpots,hourlyRate,securityVideoUrl
        </code>
        <p style={{margin:'8px 0 0 0',fontSize:12,color:'#0369a1'}}>
          <strong>Columnas alternativas:</strong> nombre, latitud, longitude, espacios, disponibles, precio, video
        </p>
      </div>

      <div style={{marginBottom:20}}>
        <label style={{display:'block',marginBottom:8,fontWeight:'bold'}}>Seleccionar archivo CSV:</label>
        <input 
          type="file" 
          accept=".csv"
          onChange={handleCsvUpload}
          style={{marginBottom:12}}
        />
        
        {csvPreview.headers && (
          <div style={{marginTop:16}}>
            <h4>Vista Previa:</h4>
            <div style={{overflow:'auto',maxHeight:300,border:'1px solid #ddd',borderRadius:4}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'#f8fafc'}}>
                    {csvPreview.headers.map((header, i) => (
                      <th key={i} style={{padding:8,border:'1px solid #e2e8f0',fontWeight:'bold'}}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.map((row, i) => (
                    <tr key={i}>
                      {csvPreview.headers.map((header, j) => (
                        <td key={j} style={{padding:8,border:'1px solid #e2e8f0'}}>{row[header] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{marginTop:16,display:'flex',gap:12}}>
              <button
                onClick={importCsvParkings}
                disabled={importLoading}
                style={{
                  padding:'10px 20px',
                  background: importLoading ? '#94a3b8' : '#10b981',
                  color:'white',
                  border:'none',
                  borderRadius:6,
                  cursor: importLoading ? 'not-allowed' : 'pointer',
                  fontWeight:'bold'
                }}
              >
                {importLoading ? '⏳ Importando...' : '📥 Importar Parqueos'}
              </button>
              
              <button
                onClick={() => {setCsvFile(null); setCsvPreview([]);}}
                style={{
                  padding:'10px 20px',
                  background:'#6b7280',
                  color:'white',
                  border:'none',
                  borderRadius:6,
                  cursor:'pointer'
                }}
              >
                ❌ Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderParkingsTab = () => (
    <div style={{display:'flex',gap:16,height:'100%',minHeight:0}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
        <h3 style={{color:'#f8fafc'}}>🅿️ Gestión de Parqueos</h3>

        {/* Metrics Dashboard */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12,marginBottom:20}}>
          <div style={{background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',padding:16,borderRadius:10,color:'white'}}>
            <div style={{fontSize:13,opacity:0.9}}>Total Parqueos</div>
            <div style={{fontSize:32,fontWeight:700}}>{parkings.length}</div>
          </div>
          <div style={{background:'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',padding:16,borderRadius:10,color:'white'}}>
            <div style={{fontSize:13,opacity:0.9,color:'#000'}}>Ocupación Global</div>
            <div style={{fontSize:32,fontWeight:700}}>{occupancyRate}%</div>
            <div style={{fontSize:11,opacity:0.8}}>{occupiedSpots} de {totalSpots} espacios</div>
          </div>
          <div style={{background:'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',padding:16,borderRadius:10,color:'white'}}>
            <div style={{fontSize:13,opacity:0.9}}>Total Usuarios</div>
            <div style={{fontSize:32,fontWeight:700}}>{users.length}</div>
          </div>
          <div style={{background:'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',padding:16,borderRadius:10,color:'white'}}>
            <div style={{fontSize:13,opacity:0.9}}>Revenue Total</div>
            <div style={{fontSize:32,fontWeight:700}}>${totalRevenue.toFixed(0)}</div>
          </div>
        </div>

        {/* Occupancy Bar Chart (collapsible) */}
        <div style={{background:'rgba(255,255,255,0.05)',padding:16,borderRadius:10,marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: occupancyOpen ? 12 : 0}}>
            <button
              onClick={() => setOccupancyOpen(v => !v)}
              style={{
                display:'flex',
                alignItems:'center',
                gap:8,
                padding:0,
                border:'none',
                background:'transparent',
                cursor:'pointer',
                color:'#f8fafc',
                fontSize:16,
                fontWeight:700
              }}
              aria-expanded={occupancyOpen}
              aria-controls="occupancy-list"
            >
              <span style={{fontSize:18}}>{occupancyOpen ? '▾' : '▸'}</span>
              <span>Ocupación por Parqueo</span>
            </button>
            <button 
              onClick={exportCSV}
              style={{padding:'8px 12px',background:'#10b981',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:13}}
            >
              📊 Exportar CSV
            </button>
          </div>
          {occupancyOpen && (
            <div id="occupancy-list">
              {parkings.map(p => {
                const occ = p.totalSpots > 0 ? ((p.totalSpots - p.availableSpots) / p.totalSpots) * 100 : 0;
                return (
                  <div key={p.id} style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                      <span>{p.name}</span>
                      <span>{occ.toFixed(0)}% ({p.totalSpots - p.availableSpots}/{p.totalSpots})</span>
                    </div>
                    <div style={{background:'rgba(255,255,255,0.1)',borderRadius:4,height:8,overflow:'hidden'}}>
                      <div style={{
                        width: `${occ}%`,
                        height:'100%',
                        background: occ > 80 ? '#ef4444' : occ > 50 ? '#f59e0b' : '#10b981',
                        transition:'width 0.3s ease'
                      }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <section style={{marginTop:12,marginBottom:12}}>
          <h3 style={{color:'#f8fafc'}}>Agregar Parqueo</h3>
          <button 
            onClick={() => { setAddingParking(!addingParking); setClickPosition(null); }}
            style={{padding:'10px 16px',background:addingParking?'#ef4444':'#06b6d4',color:'white',border:'none',borderRadius:6,cursor:'pointer',marginBottom:8}}
          >
            {addingParking ? 'Cancelar' : 'Agregar parqueo en mapa'}
          </button>
          {addingParking && (
            <div style={{background:'#fef3c7',padding:12,borderRadius:6,marginBottom:8,fontSize:14,color:'#000'}}>
              Haz clic en el mapa para seleccionar la ubicación del parqueo
            </div>
          )}
          {clickPosition && (
            <form onSubmit={createParking} style={{display:'flex',flexDirection:'column',gap:8,maxWidth:400}}>
              <input placeholder="Nombre del parqueo" value={newParking.name} onChange={e=>setNewParking({...newParking,name:e.target.value})} required style={{padding:8}} />
              <input placeholder="Total de espacios" type="number" value={newParking.totalSpots} onChange={e=>setNewParking({...newParking,totalSpots:Number(e.target.value)})} style={{padding:8}} />
              <input placeholder="Precio por hora (RD$)" type="number" value={newParking.hourlyRate} onChange={e=>setNewParking({...newParking,hourlyRate:Number(e.target.value)})} style={{padding:8}} />
              <input placeholder="URL video seguridad (opcional)" value={newParking.securityVideoUrl} onChange={e=>setNewParking({...newParking,securityVideoUrl:e.target.value})} style={{padding:8}} />
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#374151',cursor:'pointer'}}>
                <input 
                  type="checkbox" 
                  checked={newParking.sellsTickets !== false}
                  onChange={e=>setNewParking({...newParking,sellsTickets:e.target.checked})}
                  style={{cursor:'pointer'}}
                />
                <span>🎫 Vende Tickets</span>
              </label>
              <div style={{fontSize:12,color:'#666'}}>Ubicación: {clickPosition.lat.toFixed(6)}, {clickPosition.lng.toFixed(6)}</div>
              <button type="submit" disabled={loading} style={{padding:'10px',background:'#10b981',color:'white',border:'none',borderRadius:6,cursor:'pointer'}}>
                {loading ? 'Creando...' : 'Crear Parqueo'}
              </button>
            </form>
          )}
        </section>

        <section style={{flex:1,overflowY:'auto',minHeight:0}}>
          <h3 style={{color:'#f8fafc'}}>Parqueos Existentes</h3>
          <div>
            {parkings.map(p => (
              <div key={p.id} style={{
                padding:16,
                border: editingParking === p.id ? '2px solid #3b82f6' : '1px solid #ddd',
                borderRadius:8,
                marginBottom:12,
                background: editingParking === p.id ? '#eff6ff' : '#f9fafb',
                transition: 'all 0.2s ease'
              }}>
                {editingParking === p.id ? (
                  // Modo de edición
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                      <h4 style={{margin:0,color:'#1e40af'}}>✏️ Editando Parqueo</h4>
                      <div style={{display:'flex',gap:8}}>
                        <button 
                          onClick={() => saveEditing(p.id)}
                          disabled={loading}
                          style={{padding:'6px 12px',background:'#10b981',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:13}}
                        >
                          {loading ? 'Guardando...' : '✅ Guardar'}
                        </button>
                        <button 
                          onClick={cancelEditing}
                          style={{padding:'6px 12px',background:'#6b7280',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:13}}
                        >
                          ❌ Cancelar
                        </button>
                      </div>
                    </div>
                    
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Nombre del Parqueo</label>
                        <input 
                          value={editForm.name || ''}
                          onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                          placeholder="Nombre del parqueo"
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                      
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Precio por Hora (RD$)</label>
                        <input 
                          type="number"
                          value={editForm.hourlyRate || 100}
                          onChange={(e) => setEditForm({...editForm, hourlyRate: Number(e.target.value)})}
                          placeholder="Precio por hora"
                          min="50"
                          max="1000"
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                    </div>
                    
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Total de Espacios</label>
                        <input 
                          type="number"
                          value={editForm.totalSpots || 0}
                          onChange={(e) => setEditForm({...editForm, totalSpots: Number(e.target.value)})}
                          placeholder="Total espacios"
                          min="1"
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                      
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Espacios Disponibles</label>
                        <input 
                          type="number"
                          value={editForm.availableSpots || 0}
                          onChange={(e) => setEditForm({...editForm, availableSpots: Math.min(Number(e.target.value), editForm.totalSpots || 0)})}
                          placeholder="Disponibles"
                          min="0"
                          max={editForm.totalSpots || 0}
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                      
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>ID del Parqueo</label>
                        <input 
                          value={p.id}
                          disabled
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14,background:'#f3f4f6',color:'#6b7280'}}
                        />
                      </div>
                    </div>
                    
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Latitud</label>
                        <input 
                          type="number"
                          step="0.000001"
                          value={editForm.lat || 0}
                          onChange={(e) => setEditForm({...editForm, lat: parseFloat(e.target.value)})}
                          placeholder="Latitud"
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                      
                      <div>
                        <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>Longitud</label>
                        <input 
                          type="number"
                          step="0.000001"
                          value={editForm.lng || 0}
                          onChange={(e) => setEditForm({...editForm, lng: parseFloat(e.target.value)})}
                          placeholder="Longitud"
                          style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label style={{display:'block',fontSize:12,fontWeight:'bold',marginBottom:4,color:'#374151'}}>URL Video de Seguridad (Opcional)</label>
                      <input 
                        value={editForm.securityVideoUrl || ''}
                        onChange={(e) => setEditForm({...editForm, securityVideoUrl: e.target.value})}
                        placeholder="https://example.com/security-video"
                        style={{width:'100%',padding:8,borderRadius:4,border:'1px solid #d1d5db',fontSize:14}}
                      />
                    </div>
                    
                    <div style={{marginTop:12}}>
                      <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#374151',cursor:'pointer'}}>
                        <input 
                          type="checkbox" 
                          checked={editForm.sellsTickets !== false && editForm.sellsTickets !== 0}
                          onChange={(e) => setEditForm({...editForm, sellsTickets: e.target.checked})}
                          style={{cursor:'pointer'}}
                        />
                        <span style={{fontWeight:'bold'}}>🎫 Vende Tickets</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  // Modo de visualización
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <div style={{fontWeight:'bold',fontSize:16,color:'#1f2937'}}>{p.name}</div>
                      <div style={{display:'flex',gap:6}}>
                        <button 
                          onClick={() => startEditing(p)}
                          style={{padding:'6px 12px',background:'#3b82f6',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:13}}
                        >
                          ✏️ Editar
                        </button>
                        <button 
                          onClick={() => deleteParking(p.id)}
                          style={{padding:'6px 12px',background:'#ef4444',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:13}}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                    
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12,fontSize:13,color:'#6b7280'}}>
                      <div>
                        <span style={{fontWeight:'bold',color:'#374151'}}>ID:</span> {p.id}
                      </div>
                      <div>
                        <span style={{fontWeight:'bold',color:'#374151'}}>Espacios:</span> {p.availableSpots}/{p.totalSpots}
                      </div>
                      <div>
                        <span style={{fontWeight:'bold',color:'#374151'}}>Precio:</span> <span style={{color:'#10b981',fontWeight:'bold'}}>RD${p.hourlyRate || 100}/hora</span>
                      </div>
                      <div>
                        <span style={{fontWeight:'bold',color:'#374151'}}>Ubicación:</span> {parseFloat(p.lat).toFixed(4)}, {parseFloat(p.lng).toFixed(4)}
                      </div>
                    </div>
                    
                    {p.securityVideoUrl && (
                      <div style={{marginTop:8,fontSize:13}}>
                        <span style={{fontWeight:'bold',color:'#374151'}}>Video de Seguridad:</span> 
                        <a href={p.securityVideoUrl} target="_blank" rel="noopener noreferrer" style={{color:'#3b82f6',textDecoration:'none',marginLeft:4}}>
                          Ver Video 📹
                        </a>
                      </div>
                    )}
                    
                    <div style={{marginTop:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                        <span style={{color:'#000'}}>Ocupación</span>
                        <span>{p.totalSpots > 0 ? (((p.totalSpots - p.availableSpots) / p.totalSpots) * 100).toFixed(0) : 0}% ({p.totalSpots - p.availableSpots}/{p.totalSpots})</span>
                      </div>
                      <div style={{background:'rgba(0,0,0,0.1)',borderRadius:4,height:6,overflow:'hidden'}}>
                        <div style={{
                          width: `${p.totalSpots > 0 ? ((p.totalSpots - p.availableSpots) / p.totalSpots) * 100 : 0}%`,
                          height:'100%',
                          background: p.totalSpots > 0 ? 
                            (((p.totalSpots - p.availableSpots) / p.totalSpots) * 100) > 80 ? '#ef4444' : 
                            (((p.totalSpots - p.availableSpots) / p.totalSpots) * 100) > 50 ? '#f59e0b' : '#10b981'
                            : '#10b981',
                          transition:'width 0.3s ease'
                        }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

      </div>

      <div style={{flex:1,height:'100%',border:'1px solid #ddd',borderRadius:8,overflow:'hidden'}}>
        <MapContainer 
          center={[18.4861, -69.9312]} 
          zoom={13} 
          style={{height:'100%',width:'100%'}}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler />
          {parkings.map(p => p.lat && p.lng && (
            <Marker 
              key={p.id} 
              position={[parseFloat(p.lat), parseFloat(p.lng)]}
              icon={L.icon({
                iconUrl: process.env.PUBLIC_URL + '/parking-marker.png',
                iconSize: editingParking === p.id ? [52,52] : hoveredId === p.id ? [48,48] : [40,40],
                iconAnchor: editingParking === p.id ? [26,52] : hoveredId === p.id ? [24,48] : [20,40],
                popupAnchor: [0,-32],
                className: editingParking === p.id ? 'parking-marker-icon editing' : 'parking-marker-icon'
              })}
              eventHandlers={{
                mouseover: () => setHoveredId(p.id),
                mouseout: () => setHoveredId(null)
              }}
            >
              <Popup>
                <div style={{fontSize:'13px',lineHeight:'1.4',minWidth:'200px'}}>
                  <div style={{borderBottom:'1px solid #e5e7eb',paddingBottom:8,marginBottom:8}}>
                    <strong style={{display:'block',fontSize:'15px',color:'#1f2937'}}>{p.name}</strong>
                    <div style={{fontSize:'11px',color:'#6b7280',marginTop:2}}>ID: {p.id}</div>
                  </div>
                  
                  <div style={{marginBottom:8}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span>Espacios:</span>
                      <span style={{fontWeight:'bold'}}>{p.availableSpots}/{p.totalSpots}</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span>Precio:</span>
                      <span style={{fontWeight:'bold',color:'#10b981'}}>RD${p.hourlyRate || 100}/h</span>
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span>Ubicación:</span>
                      <span style={{fontSize:'11px'}}>{parseFloat(p.lat).toFixed(4)}, {parseFloat(p.lng).toFixed(4)}</span>
                    </div>
                  </div>
                  
                  <div style={{display:'flex',gap:4,marginTop:8}}>
                    <button
                      onClick={() => startEditing(p)}
                      style={{
                        flex:1,
                        padding:'6px 8px',
                        background: editingParking === p.id ? '#6b7280' : '#3b82f6',
                        color:'white',
                        border:'none',
                        borderRadius:4,
                        cursor:'pointer',
                        fontSize:11
                      }}
                      disabled={editingParking === p.id}
                    >
                      {editingParking === p.id ? 'Editando...' : '✏️ Editar'}
                    </button>
                    <button
                      onClick={() => updateAvailability(p.id, Math.max(0, p.availableSpots - 1))}
                      style={{
                        padding:'4px 8px',
                        background:'#ef4444',
                        color:'white',
                        border:'none',
                        borderRadius:4,
                        cursor:'pointer',
                        fontSize:11
                      }}
                      disabled={p.availableSpots <= 0}
                    >
                      -1
                    </button>
                    <button
                      onClick={() => updateAvailability(p.id, Math.min(p.totalSpots, p.availableSpots + 1))}
                      style={{
                        padding:'4px 8px',
                        background:'#10b981',
                        color:'white',
                        border:'none',
                        borderRadius:4,
                        cursor:'pointer',
                        fontSize:11
                      }}
                      disabled={p.availableSpots >= p.totalSpots}
                    >
                      +1
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );

  const renderUsersTab = () => (
      <div style={{padding:20,height:'100%',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{color:'#f8fafc'}}>👥 Usuarios Registrados</h3>
          <div style={{display:'flex',gap:8}}>
            <button
              onClick={() => setShowNewUserForm(!showNewUserForm)}
              style={{
                padding:'8px 16px',
                background:'#3b82f6',
                color:'white',
                border:'none',
                borderRadius:6,
                cursor:'pointer',
                fontWeight:'bold'
              }}
            >
              {showNewUserForm ? '❌ Cancelar' : '➕ Agregar Usuario'}
            </button>
            <button
              onClick={() => {
                setUsersLoading(true);
                fetchUsers().then(() => setUsersLoading(false));
              }}
              disabled={usersLoading}
              style={{
                padding:'8px 16px',
                background:'#10b981',
                color:'white',
                border:'none',
                borderRadius:6,
                cursor: usersLoading ? 'not-allowed' : 'pointer',
                fontWeight:'bold'
              }}
            >
              {usersLoading ? '🔄 Actualizando...' : '🔄 Actualizar Lista'}
            </button>
          </div>
        </div>

        {/* Formulario de nuevo usuario */}
        {showNewUserForm && (
          <div style={{
            background:'#ffffff',
            border:'2px solid #3b82f6',
            borderRadius:12,
            padding:20,
            marginBottom:20,
            boxShadow:'0 4px 12px rgba(59, 130, 246, 0.2)'
          }}>
            <h4 style={{margin:'0 0 16px 0',color:'#111827'}}>➕ Crear Nuevo Usuario</h4>
            <form onSubmit={createUser} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12}}>
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'#374151'}}>
                  Email *
                </label>
                <input
                  type="email"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm(prev => ({...prev, email: e.target.value}))}
                  placeholder="usuario@ejemplo.com"
                  style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14}}
                  required
                />
              </div>

              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'#374151'}}>
                  Username *
                </label>
                <input
                  type="text"
                  value={newUserForm.username}
                  onChange={e => setNewUserForm(prev => ({...prev, username: e.target.value.toLowerCase()}))}
                  placeholder="nombreusuario"
                  style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14}}
                  required
                />
              </div>

              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'#374151'}}>
                  Contraseña *
                </label>
                <input
                  type="password"
                  value={newUserForm.password}
                  onChange={e => setNewUserForm(prev => ({...prev, password: e.target.value}))}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14}}
                  required
                />
              </div>

              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'#374151'}}>
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={newUserForm.name}
                  onChange={e => setNewUserForm(prev => ({...prev, name: e.target.value}))}
                  placeholder="Juan Pérez"
                  style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14}}
                />
              </div>

              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'#374151'}}>
                  Rol
                </label>
                <select
                  value={newUserForm.role}
                  onChange={e => setNewUserForm(prev => ({...prev, role: e.target.value}))}
                  style={{width:'100%',padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14}}
                >
                  <option value="user">👤 Usuario Normal</option>
                  <option value="admin">👑 Administrador</option>
                  {user?.role === 'main' && <option value="main">🔧 Main Admin</option>}
                </select>
              </div>

              <div style={{display:'flex',alignItems:'flex-end'}}>
                <button
                  type="submit"
                  style={{
                    width:'100%',
                    padding:'10px 16px',
                    background:'#10b981',
                    color:'white',
                    border:'none',
                    borderRadius:6,
                    cursor:'pointer',
                    fontWeight:'bold',
                    fontSize:14
                  }}
                >
                  ✅ Crear Usuario
                </button>
              </div>
            </form>
          </div>
        )}

      {users.length === 0 ? (
        <div style={{
          textAlign:'center',
          padding:40,
          color:'#6b7280',
          background:'#f9fafb',
          borderRadius:8,
          border:'1px dashed #d1d5db'
        }}>
          <div style={{fontSize:48,marginBottom:16}}>👥</div>
          <h4 style={{margin:'0 0 8px 0'}}>No hay usuarios registrados</h4>
          <p style={{margin:0}}>Cuando los usuarios se registren, aparecerán aquí.</p>
        </div>
      ) : (
        <div style={{
          display:'grid',
          gap:16,
          gridTemplateColumns:'repeat(auto-fill, minmax(350px, 1fr))'
        }}>
          {users.map(u => (
            <div
              key={u.id}
              style={{
                background:'white',
                border:'1px solid #e5e7eb',
                borderRadius:12,
                padding:20,
                boxShadow:'0 1px 3px rgba(0,0,0,0.1)',
                transition:'all 0.2s ease',
                cursor:'pointer'
              }}
              onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div style={{
                  width:50,
                  height:50,
                  borderRadius:'50%',
                  background: `linear-gradient(135deg, #${Math.abs(u.username.charCodeAt(0) * 12345).toString(16).slice(0,6)}, #${Math.abs(u.username.charCodeAt(1) * 54321).toString(16).slice(0,6)})`,
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center',
                  color:'white',
                  fontWeight:'bold',
                  fontSize:18
                }}>
                  {u.name ? u.name.charAt(0).toUpperCase() : u.username.charAt(0).toUpperCase()}
                </div>
                <div style={{
                  padding:'4px 8px',
                  background: u.role === 'admin' ? '#dc2626' : u.role === 'main' ? '#7c3aed' : '#10b981',
                  color:'white',
                  borderRadius:12,
                  fontSize:11,
                  fontWeight:'bold'
                }}>
                  {u.role === 'admin' ? '👑 ADMIN' : u.role === 'main' ? '🔧 MAIN' : '👤 USER'}
                </div>
                {user && (user.role === 'admin' || user.role === 'main') && user.id !== u.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm(`¿Eliminar usuario ${u.username}?`)) return;
                      deleteUserById(u);
                    }}
                    style={{
                      marginLeft:8,
                      padding:'4px 8px',
                      background:'#ef4444',
                      color:'white',
                      border:'none',
                      borderRadius:6,
                      cursor:'pointer',
                      fontSize:11,
                      fontWeight:'bold'
                    }}
                    title={u.role === 'main' && user.role !== 'main' ? 'Solo el MAIN puede eliminar a otro MAIN' : 'Eliminar usuario'}
                    disabled={u.role === 'main' && user.role !== 'main'}
                  >🗑</button>
                )}
              </div>

              <div style={{marginBottom:8}}>
                <div style={{fontWeight:'bold',fontSize:16,marginBottom:4,color:'#111827'}}>
                  {u.name || 'Sin nombre'}
                </div>
                <div style={{color:'#6b7280',fontSize:14}}>@{u.username}</div>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{display:'flex',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:14,color:'#374151'}}>📧 {u.email}</span>
                </div>
                {u.licensePlate && (
                  <div style={{display:'flex',alignItems:'center'}}>
                    <span style={{fontSize:14,color:'#374151'}}>🚗 {u.licensePlate}</span>
                  </div>
                )}
              </div>

              <div style={{
                fontSize:12,
                color:'#9ca3af',
                borderTop:'1px solid #f3f4f6',
                paddingTop:8,
                display:'flex',
                justifyContent:'space-between'
              }}>
                <span>ID: {u.id}</span>
                <span>{selectedUser?.id === u.id ? '📋 Click para contraer' : '📋 Click para expandir'}</span>
              </div>

              {selectedUser?.id === u.id && (
                <div style={{
                  marginTop:12,
                  padding:12,
                  background:'#f8fafc',
                  borderRadius:8,
                  border:'1px solid #e2e8f0'
                }}>
                  <h5 style={{margin:'0 0 8px 0',color:'#374151'}}>Información Detallada:</h5>
                  <div style={{fontSize:13,color:'#6b7280',lineHeight:1.5}}>
                    <div><strong>ID:</strong> {u.id}</div>
                    <div><strong>Usuario:</strong> {u.username}</div>
                    <div><strong>Email:</strong> {u.email}</div>
                    <div><strong>Nombre:</strong> {u.name || 'No especificado'}</div>
                    <div><strong>Placa:</strong> {u.licensePlate || 'No especificada'}</div>
                    <div><strong>Rol:</strong> {u.role}</div>
                    <div><strong>Creado:</strong> {u.createdAt ? new Date(u.createdAt).toLocaleString() : 'No disponible'}</div>
                    {user && (user.role === 'admin' || user.role === 'main') && user.id !== u.id && (
                      <div style={{marginTop:12}}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!confirm(`¿Eliminar usuario ${u.username}?`)) return;
                            deleteUserById(u);
                          }}
                          style={{
                            padding:'6px 12px',
                            background:'#dc2626',
                            color:'white',
                            border:'none',
                            borderRadius:6,
                            cursor:'pointer',
                            fontSize:12,
                            fontWeight:'bold'
                          }}
                          title={u.role === 'main' && user.role !== 'main' ? 'Solo el MAIN puede eliminar a otro MAIN' : 'Eliminar usuario'}
                          disabled={u.role === 'main' && user.role !== 'main'}
                        >🗑 Eliminar Usuario</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{padding:16,display:'flex',flexDirection:'column',height:'calc(100vh - 100px)'}}>
      <div style={{marginBottom:20}}>
        <h2 style={{margin:'0 0 16px 0'}}>👑 Panel de Administración</h2>
        
        {/* Navegación por pestañas */}
        <div style={{display:'flex',gap:2,borderBottom:'2px solid #e5e7eb',marginBottom:20,flexWrap:'wrap'}}>
          {[
            { id: 'parkings', label: '🅿️ Parqueos' },
            { id: 'tickets', label: '📋 Tickets' },
            { id: 'wallet', label: '💳 Wallet' },
            { id: 'users', label: '👥 Usuarios' },
            { id: 'managers', label: '🏢 Managers' },
            { id: 'csv', label: '📊 CSV' },
            { id: 'comparison', label: '📋 Comparar' },
            { id: 'promotions-admin', label: '🎁 Promociones' },
            { id: 'reminders', label: '🔔 Recordatorios' },
            { id: 'auto-checkout', label: '🚗 Auto-Checkout' },
            { id: 'audit', label: '📈 Auditoría' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding:'8px 12px',
                border:'none',
                background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#6b7280',
                borderRadius:'6px 6px 0 0',
                cursor:'pointer',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                fontSize:12,
                transition:'all 0.2s ease',
                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                minWidth:'auto',
                whiteSpace:'nowrap'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.target.style.background = '#f3f4f6';
                  e.target.style.color = '#374151';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.target.style.background = 'transparent';
                  e.target.style.color = '#6b7280';
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido de la pestaña activa */}
      <div style={{flex:1,overflow:'auto',minHeight:0}}>
        {renderTabContent()}
      </div>
    </div>
  );
}

