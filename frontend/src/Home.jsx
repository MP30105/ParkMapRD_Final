import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import TicketExtension from './TicketExtension';
import { useToast } from './ToastProvider';
import { apiPost, apiGet, apiPut, apiDelete, attachAuth } from './api';
import ReservaProximaItem from './ReservaProximaItem'; // Added import for ReservaProximaItem

// Lista de marcas populares de vehículos
const CAR_BRANDS = [
  'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Hyundai', 'Kia', 'Mazda',
  'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Jeep', 'RAM', 'Dodge', 'GMC',
  'Subaru', 'Lexus', 'Infiniti', 'Acura', 'Mitsubishi', 'Suzuki', 'Isuzu',
  'Peugeot', 'Renault', 'Fiat', 'Alfa Romeo', 'Volvo', 'Tesla', 'Porsche',
  'Land Rover', 'Jaguar', 'Mini', 'Buick', 'Cadillac', 'Lincoln', 'Genesis',
  'Otro'
].sort();

// Modelos por marca (las más populares)
const CAR_MODELS = {
  'Toyota': ['Corolla', 'Camry', 'RAV4', 'Highlander', 'Tacoma', 'Tundra', '4Runner', 'Sienna', 'Prius', 'Yaris', 'Otro'],
  'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Odyssey', 'HR-V', 'Fit', 'Ridgeline', 'Passport', 'Insight', 'Otro'],
  'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Expedition', 'Bronco', 'Ranger', 'Maverick', 'Fusion', 'Otro'],
  'Chevrolet': ['Silverado', 'Equinox', 'Traverse', 'Malibu', 'Tahoe', 'Suburban', 'Colorado', 'Blazer', 'Trax', 'Camaro', 'Otro'],
  'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Murano', 'Frontier', 'Titan', 'Kicks', 'Versa', 'Maxima', 'Otro'],
  'Hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona', 'Venue', 'Accent', 'Ioniq', 'Genesis', 'Otro'],
  'Kia': ['Forte', 'Optima', 'Sportage', 'Sorento', 'Telluride', 'Soul', 'Seltos', 'Rio', 'Carnival', 'Stinger', 'Otro'],
  'Mazda': ['Mazda3', 'Mazda6', 'CX-5', 'CX-9', 'CX-30', 'CX-50', 'MX-5 Miata', 'CX-3', 'Otro'],
  'BMW': ['Serie 3', 'Serie 5', 'X3', 'X5', 'Serie 7', 'X1', 'X7', 'Serie 4', 'i4', 'iX', 'Otro'],
  'Mercedes-Benz': ['Clase C', 'Clase E', 'GLC', 'GLE', 'Clase A', 'GLA', 'GLS', 'Clase S', 'GLB', 'EQS', 'Otro'],
  'Audi': ['A4', 'A6', 'Q5', 'Q7', 'A3', 'Q3', 'Q8', 'A5', 'e-tron', 'A8', 'Otro'],
  'Volkswagen': ['Jetta', 'Tiguan', 'Atlas', 'Passat', 'Golf', 'ID.4', 'Taos', 'Arteon', 'Otro'],
  'Jeep': ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator', 'Wagoneer', 'Otro'],
  'Tesla': ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  'Otro': ['Otro']
};

export default function Home({ token, user, onLogout }) {
  const { showToast } = useToast();
  const [cars, setCars] = useState(user?.cars || []);
  const [tickets, setTickets] = useState({ active: [], previous: [] });
  const [form, setForm] = useState({ brand: '', model: '', plate: '' });
  const [availableModels, setAvailableModels] = useState([]);
  const [editingCar, setEditingCar] = useState(null);
  const [stats, setStats] = useState(null);
  const [frequentLocations, setFrequentLocations] = useState([]);
  const [reservations, setReservations] = useState([]);

  // Actualizar modelos disponibles cuando cambia la marca
  useEffect(() => {
    if (form.brand && CAR_MODELS[form.brand]) {
      setAvailableModels(CAR_MODELS[form.brand]);
      // Si el modelo actual no está en la nueva lista, resetear
      if (!CAR_MODELS[form.brand].includes(form.model)) {
        setForm(prev => ({ ...prev, model: '' }));
      }
    } else {
      setAvailableModels([]);
    }
  }, [form.brand]);

  useEffect(() => {
    if (!token) return;
    const auth = attachAuth(token);
    apiGet('parkmaprd/users/me/cars', auth).then(data => setCars(data || [])).catch(()=>{});
    apiGet('parkmaprd/users/me/tickets', auth).then(data => {
      setTickets(data || { active: [], previous: [] });
      if (data && data.previous) {
        const allTickets = [...(data.active || []), ...(data.previous || [])];
        const totalSpent = allTickets.reduce((sum, t) => sum + (t.amount || 5), 0);
        const avgDuration = allTickets.length > 0
          ? allTickets.reduce((sum, t) => {
              const start = new Date(t.startTime);
              const end = t.usedAt ? new Date(t.usedAt) : new Date(t.endTime);
              return sum + (end - start) / (1000 * 60);
            }, 0) / allTickets.length
          : 0;
        const parkingCounts = {};
        allTickets.forEach(t => { parkingCounts[t.parkingId] = (parkingCounts[t.parkingId] || 0) + 1; });
        const mostVisited = Object.entries(parkingCounts).sort((a,b)=>b[1]-a[1])[0];
        setStats({
          totalVisits: allTickets.length,
          totalSpent,
          avgDuration: Math.round(avgDuration),
          mostVisited: mostVisited ? { parkingId: mostVisited[0], count: mostVisited[1] } : null
        });
      }
    }).catch(()=>{});
    apiGet('parkmaprd/users/me/frequent-locations', auth).then(data => setFrequentLocations(data || [])).catch(()=>{});
    apiGet('parkmaprd/users/me/reservations', auth).then(data => setReservations(data || [])).catch(()=>{});
  }, [token]);

  const addCar = async (e) => {
    e.preventDefault();
    if (!form.brand) return showToast('warning', 'Por favor selecciona una marca');
    // Permitir modelo vacío
    if (!form.plate) return showToast('warning', 'Por favor ingresa la placa');
    if (form.plate.length < 3) return showToast('warning', 'La placa es muy corta');
    
    try {
      if (editingCar) {
        // Actualizar vehículo existente
        try {
          const data = await apiPut(`parkmaprd/users/me/cars/${editingCar.id}`, form, attachAuth(token));
          setCars(prev => prev.map(c => c.id === editingCar.id ? data : c));
          showToast('success', '✅ Vehículo actualizado correctamente');
          setEditingCar(null);
        } catch (e) {
          showToast('error', e.message || 'Error al actualizar vehículo');
        }
      } else {
        try {
          const data = await apiPost('parkmaprd/users/me/cars', form, attachAuth(token));
          setCars(prev => [...prev, data]);
          showToast('success', '✅ Vehículo agregado correctamente');
        } catch (e) {
          showToast('error', e.message || 'Error al agregar vehículo');
        }
      }
      
      setForm({ brand: '', model: '', plate: '' });
      setAvailableModels([]);
    } catch (e) { 
      showToast('error', 'Error de conexión: ' + e.message); 
    }
  };

  const editCar = (car) => {
    setForm({ brand: car.brand, model: car.model, plate: car.plate });
    setEditingCar(car);
    if (car.brand && CAR_MODELS[car.brand]) {
      setAvailableModels(CAR_MODELS[car.brand]);
    }
    showToast('info', 'Editando vehículo - modifica y presiona Guardar');
  };

  const cancelEdit = () => {
    setForm({ brand: '', model: '', plate: '' });
    setAvailableModels([]);
    setEditingCar(null);
    showToast('info', 'Edición cancelada');
  };

  const deleteCar = async (carId) => {
    if (!window.confirm('¿Estás seguro de eliminar este vehículo?')) return;
    
    try {
      try {
        await apiDelete(`parkmaprd/users/me/cars/${carId}`, attachAuth(token));
        setCars(prev => prev.filter(c => c.id !== carId));
        showToast('success', '🗑️ Vehículo eliminado');
      } catch (e) {
        showToast('error', e.message || 'Error al eliminar vehículo');
      }
    } catch (e) { showToast('error', 'Error de conexión: ' + e.message); }
  };

  const useTicket = async (id) => {
    try {
      const res = await apiPost(`parkmaprd/tickets/${id}/use`, {}, attachAuth(token));
      if (res.error) {
        showToast('error', res.error);
      } else {
        showToast('success', '✅ Ticket marcado como usado');
        const d = await apiGet('parkmaprd/users/me/tickets', attachAuth(token));
        setTickets(d || { active: [], previous: [] });
      }
    } catch (e) { 
      showToast('error', 'Error de red: ' + (e.message || 'Error desconocido')); 
    }
  };

  const cancelReservation = async (reservationId) => {
    if (!window.confirm('¿Estás seguro de cancelar esta reservación?')) return;
    
    try {
      try {
        await apiDelete(`parkmaprd/reservations/${reservationId}`, attachAuth(token));
        setReservations(prev => prev.filter(r => r.id !== reservationId));
        showToast('success', '❌ Reservación cancelada');
      } catch (e) {
        showToast('error', e.message || 'Error al cancelar reservación');
      }
    } catch (e) { showToast('error', 'Error de conexión: ' + e.message); }
  };

  const extendReservation = async (reservationId, additionalHours) => {
    try {
      try {
        const data = await apiPost(`parkmaprd/reservations/${reservationId}/extend`, { additionalHours }, attachAuth(token));
        setReservations(prev => prev.map(r => r.id === reservationId ? data : r));
        showToast('success', `⏰ Reservación extendida ${additionalHours}h`);
      } catch (e) {
        showToast('error', e.message || 'Error al extender reservación');
      }
    } catch (e) { showToast('error', 'Error de conexión: ' + e.message); }
  };

  return (
    <div style={{padding:16, display:'flex', flexDirection:'column', gap:16}}>
      {/* Statistics Section */}
      {stats && (
        <div style={{background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',padding:20,borderRadius:12,color:'white'}}>
          <h3 style={{margin:'0 0 16px 0',fontSize:20}}>📊 Estadísticas de Parqueo</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:12}}>
            <div style={{background:'rgba(255,255,255,0.1)',padding:12,borderRadius:8}}>
              <div style={{fontSize:12,opacity:0.8}}>Total de visitas</div>
              <div style={{fontSize:24,fontWeight:700}}>{stats.totalVisits}</div>
            </div>
            <div style={{background:'rgba(255,255,255,0.1)',padding:12,borderRadius:8}}>
              <div style={{fontSize:12,opacity:0.8}}>Total gastado</div>
              <div style={{fontSize:24,fontWeight:700}}>${stats.totalSpent.toFixed(2)}</div>
            </div>
            <div style={{background:'rgba(255,255,255,0.1)',padding:12,borderRadius:8}}>
              <div style={{fontSize:12,opacity:0.8}}>Duración promedio</div>
              <div style={{fontSize:24,fontWeight:700}}>{stats.avgDuration} min</div>
            </div>
            {stats.mostVisited && (
              <div style={{background:'rgba(255,255,255,0.1)',padding:12,borderRadius:8}}>
                <div style={{fontSize:12,opacity:0.8}}>Más visitado</div>
                <div style={{fontSize:16,fontWeight:700}}>{stats.mostVisited.parkingId}</div>
                <div style={{fontSize:12,opacity:0.7}}>{stats.mostVisited.count} veces</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{display:'flex', gap:16}}>
        <div style={{flex:1}}>
          <h3>Mis carros</h3>
        <form onSubmit={addCar} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <select 
            value={form.brand} 
            onChange={e=>setForm({...form,brand:e.target.value})}
            style={{padding:'8px 12px',borderRadius:6,border:'1px solid #cbd5e1',fontSize:14,minWidth:150}}
            required
          >
            <option value="">Selecciona marca</option>
            {CAR_BRANDS.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
          
          <select 
            value={form.model} 
            onChange={e=>setForm({...form,model:e.target.value})}
            style={{padding:'8px 12px',borderRadius:6,border:'1px solid #cbd5e1',fontSize:14,minWidth:150}}
            disabled={!form.brand || availableModels.length === 0}
          >
            <option value="">Selecciona modelo (opcional)</option>
            {availableModels.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          
          <input 
            type="text"
            placeholder="Placa (Ej: A123456)" 
            value={form.plate} 
            onChange={e=>setForm(prev => ({...prev, plate: e.target.value.toUpperCase()}))} 
            style={{padding:'8px 12px',borderRadius:6,border:'1px solid #cbd5e1',fontSize:14,minWidth:120}}
            required 
          />
          <button 
            type="submit"
            style={{padding:'8px 16px',background:editingCar ? '#10b981' : '#06b6d4',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}
          >
            {editingCar ? '💾 Guardar' : '🚗 Agregar'}
          </button>
          {editingCar && (
            <button 
              type="button"
              onClick={cancelEdit}
              style={{padding:'8px 16px',background:'#64748b',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}
            >
              ❌ Cancelar
            </button>
          )}
        </form>

        <div style={{marginTop:12}}>
          {cars.length === 0 ? (
            <div style={{padding:20,textAlign:'center',color:'#64748b',fontSize:14}}>
              No has agregado ningún vehículo aún
            </div>
          ) : (
            cars.map(c => (
              <div key={c.id} style={{
                padding:12,
                border:'1px solid #e2e8f0',
                borderRadius:8,
                marginBottom:8,
                display:'flex',
                alignItems:'center',
                gap:12,
                background:'#f8fafc'
              }}>
                <div style={{fontSize:24}}>🚗</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:15,color:'#000'}}>{c.brand} {c.model}</div>
                  <div style={{fontSize:13,color:'#64748b',marginTop:2}}>Placa: {c.plate}</div>
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button
                    onClick={() => editCar(c)}
                    style={{padding:'6px 12px',background:'#3b82f6',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:12}}
                    title="Editar vehículo"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => deleteCar(c.id)}
                    style={{padding:'6px 12px',background:'#ef4444',color:'white',border:'none',borderRadius:6,cursor:'pointer',fontSize:12}}
                    title="Eliminar vehículo"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{flex:1}}>
        {/* Frequent Locations */}
        {frequentLocations.length > 0 && (
          <div style={{marginBottom:20}}>
            <h3>📍 Lugares frecuentes</h3>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {frequentLocations.map(loc => (
                <div key={loc.id} style={{padding:'8px 12px',background:'#f1f5f9',borderRadius:6,fontSize:13}}>
                  <div style={{fontWeight:600}}>{loc.label || 'Frecuente'}</div>
                  <div style={{fontSize:11,color:'#64748b'}}>{loc.visitCount} visitas</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reservations */}
        {reservations.length > 0 && (
          <div style={{marginBottom:20}}>
            <h3>📅 Reservas próximas</h3>
            {reservations.slice(0,3).map(res => {
              const now = new Date();
              const startTime = new Date(res.startTime);
              const endTime = new Date(res.endTime);
              const duration = ((endTime - startTime) / 3600000).toFixed(1);
              const canModify = startTime > now; // Solo si no ha comenzado
              
              return (
                <ReservaProximaItem key={res.id} res={res} startTime={startTime} duration={duration} canModify={canModify} extendReservation={extendReservation} cancelReservation={cancelReservation} />
              );
            })}
          </div>
        )}

        <h3>Tickets activos</h3>
        {tickets.active.length === 0 && <div>No tienes tickets activos.</div>}
        {tickets.active.map(t => (
          <div key={t.id} style={{padding:12, border:'1px solid rgba(0,0,0,0.08)', marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div><strong>Parking:</strong> {t.parkingId} — Zona: {t.zone || 'N/A'}</div>
                <div><strong>Spot:</strong> {t.spotNumber}</div>
                <div><strong>Vence:</strong> {new Date(t.endTime).toLocaleString()}</div>
              </div>
              <div style={{textAlign:'center'}}>
                <QRCodeSVG value={t.id} size={96} />
                <div style={{marginTop:8}}><button onClick={()=>useTicket(t.id)}>Marcar usado</button></div>
              </div>
            </div>
            <TicketExtension ticket={t} token={token} onExtended={() => {
              // Refresh tickets
              apiGet('parkmaprd/users/me/tickets', attachAuth(token)).then(data => setTickets(data || { active: [], previous: [] }));
            }} />
          </div>
        ))}

        <h3 style={{marginTop:16}}>Parqueos anteriores</h3>
        {tickets.previous.length === 0 && <div>No hay parqueos anteriores.</div>}
        {tickets.previous.map(t => (
          <div key={t.id} style={{padding:8,border:'1px solid rgba(0,0,0,0.06)',marginBottom:6}}>
            <div><strong>{t.parkingId}</strong> — {t.spotNumber} — {t.status}</div>
            <div style={{fontSize:12,color:'#666'}}>Desde {new Date(t.startTime).toLocaleString()} — hasta {t.usedAt ? new Date(t.usedAt).toLocaleString() : new Date(t.endTime).toLocaleString()}</div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

