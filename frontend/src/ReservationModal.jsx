import React, { useState, useEffect, useRef, useCallback } from 'react';
import ParkingRating from './ParkingRating';
import { apiPost, attachAuth } from './api';
import { useToast } from './ToastProvider';

// Ahora acepta setShowAuth y setAuthMode como props
export default function ReservationModal({ parking, token, onClose, onSuccess, setShowAuth, setAuthMode }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(2); // hours
  const [loading, setLoading] = useState(false);
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const modalRef = useRef(null);
  const firstFieldRef = useRef(null);
  const { showToast } = useToast();

  // Focus trap & initial focus
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    if (e.key === 'Tab') {
      const focusable = modalRef.current?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable || !focusable.length) return;
      const list = Array.from(focusable).filter(el => !el.disabled && el.offsetParent !== null);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  const handleReserve = async () => {
    if (!selectedDate || !selectedTime) {
      showToast('warning', 'Selecciona fecha y hora');
      return;
    }

    if (!token) {
      setShowAuthPopup(true);
      return;
    }

    const startTime = new Date(`${selectedDate}T${selectedTime}`).getTime();
    const now = Date.now();
    
    if (startTime < now) {
      showToast('warning', 'No puedes reservar en el pasado');
      return;
    }

    const advanceLimitMs = ADVANCE_LIMIT_DAYS * 24 * 60 * 60 * 1000;
    if (startTime > now + advanceLimitMs) {
      showToast('info', `Límite máximo: ${ADVANCE_LIMIT_DAYS} días de anticipación`);
      return;
    }

    setLoading(true);
    try {
      // Crear sesión de pago de Stripe para la reserva
      const amount = duration * 100; // RD$100 por hora
      const checkoutData = await apiPost('parkmaprd/reservations/checkout', {
        parkingId: parking.id,
        startTime,
        duration: duration * 60, // convertir a minutos
        amount,
        parkingName: parking.name
      }, attachAuth(token));

      if (checkoutData.url) {
        showToast('info', 'Redirigiendo a pago...');
        // Redirigir a Stripe Checkout
        window.location.href = checkoutData.url;
      } else {
        throw new Error('No se recibió URL de pago');
      }
    } catch (e) {
      if (e.message && e.message.includes('401') && e.message.includes('no token')) {
        setShowAuthPopup(true);
      } else {
        showToast('error', e.message || 'Error al procesar pago');
      }
      setLoading(false);
    }
  };

  // Get tomorrow's date as minimum
      // Rango de fechas extendido: hoy como mínimo y hasta 30 días adelante
      const today = new Date();
      const minDate = today.toISOString().split('T')[0];
      const maxDate = new Date();
      const ADVANCE_LIMIT_DAYS = 30; // configurable si se desea
      maxDate.setDate(maxDate.getDate() + ADVANCE_LIMIT_DAYS);
      const maxDateStr = maxDate.toISOString().split('T')[0];

  return (
    <>
      <div style={{
        position:'fixed',
        top:0,
        left:0,
        right:0,
        bottom:0,
        background:'rgba(0,0,0,0.7)',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        zIndex:10000
      }} aria-modal="true" role="dialog" aria-labelledby="reserva-titulo" aria-describedby="reserva-desc" onKeyDown={handleKeyDown}
         onWheel={(e)=> { e.stopPropagation(); }}>
        <div ref={modalRef} style={{
          background:'white',
          padding:24,
          borderRadius:12,
          maxWidth:480,
          width:'clamp(320px, 90%, 480px)',
          color:'#0f172a',
          maxHeight:'92vh',
          overflowY:'auto',
          boxShadow:'0 8px 28px rgba(0,0,0,0.25)'
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h3 id="reserva-titulo" style={{margin:0}}>📅 Reservar Anticipado</h3>
            <button onClick={onClose} style={{background:'none',border:'none',fontSize:24,cursor:'pointer'}}>✕</button>
          </div>
          <p id="reserva-desc" style={{marginTop:-12,marginBottom:16,fontSize:12,color:'#64748b'}}>
            Completa los datos para reservar un espacio en {parking.name}. Usa Tab para navegar. Pulsa Escape para cerrar.
          </p>

          <div style={{marginBottom:12, position:'sticky', top:0, background:'white'}}>
            <div style={{fontWeight:600,marginBottom:4}}>{parking.name}</div>
            <div style={{marginBottom:8}}>
              <ParkingRating parkingId={parking.id} size="small" />
            </div>
            <div style={{fontSize:13,color:'#64748b'}}>
              {parking.availableSpots} espacios disponibles de {parking.totalSpots}
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <label style={{display:'block',marginBottom:6,fontSize:14,fontWeight:500}}>Fecha</label>
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={minDate}
              max={maxDateStr}
              style={{width:'100%',padding:10,borderRadius:6,border:'1px solid #cbd5e1'}}
              ref={firstFieldRef}
            />
          </div>

          <div style={{marginBottom:16}}>
            <label style={{display:'block',marginBottom:6,fontSize:14,fontWeight:500}}>Hora de llegada</label>
            <input 
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              style={{width:'100%',padding:10,borderRadius:6,border:'1px solid #cbd5e1'}}
            />
          </div>

          <div style={{marginBottom:20}}>
            <label style={{display:'block',marginBottom:6,fontSize:14,fontWeight:500}}>Duración</label>
            <select 
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={{width:'100%',padding:10,borderRadius:6,border:'1px solid #cbd5e1'}}
            >
              <option value={1}>1 hora</option>
              <option value={2}>2 horas</option>
              <option value={3}>3 horas</option>
              <option value={4}>4 horas</option>
              <option value={6}>6 horas</option>
              <option value={8}>8 horas</option>
            </select>
          </div>

          <div style={{background:'#f1f5f9',padding:12,borderRadius:6,marginBottom:16, position:'sticky', bottom:0}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:13}}>Costo estimado:</span>
              <span style={{fontWeight:600}}>RD${(duration * (parking.hourlyRate || 100)).toFixed(2)}</span>
            </div>
            <div style={{fontSize:11,color:'#64748b'}}>
              ⏰ Recibirás recordatorio 1 hora antes
            </div>
          </div>

          <button 
            onClick={handleReserve}
            disabled={loading || !selectedDate || !selectedTime}
            style={{
              width:'100%',
              padding:12,
              background: loading ? '#94a3b8' : '#10b981',
              color:'white',
              border:'none',
              borderRadius:8,
              fontSize:15,
              fontWeight:600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Procesando...' : '💳 Proceder al Pago'}
          </button>
        </div>
      </div>
      {showAuthPopup && (
        <div style={{
          position:'fixed',
          top:0,
          left:0,
          right:0,
          bottom:0,
          background:'rgba(0,0,0,0.5)',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          zIndex:10001
        }}>
          <div style={{background:'white',padding:32,borderRadius:12,maxWidth:340,textAlign:'center',boxShadow:'0 8px 28px rgba(0,0,0,0.25)'}}>
            <h3 style={{color:'#ef4444'}}>¡Debe estar logeado para reservar!</h3>
            <p style={{color:'#222'}}>Por favor inicia sesión o regístrate para continuar con la reserva.</p>
            <div style={{display:'flex',gap:12,justifyContent:'center',marginTop:24}}>
              <button style={{padding:'10px 24px',background:'#3498db',color:'white',border:'none',borderRadius:8,fontSize:16,cursor:'pointer'}} onClick={()=>{setShowAuth && setAuthMode && setAuthMode('login'); setShowAuth && setShowAuth(true); setShowAuthPopup(false);}}>
                Iniciar sesión
              </button>
              <button style={{padding:'10px 24px',background:'#10b981',color:'white',border:'none',borderRadius:8,fontSize:16,cursor:'pointer'}} onClick={()=>{setShowAuth && setAuthMode && setAuthMode('register'); setShowAuth && setShowAuth(true); setShowAuthPopup(false);}}>
                Registrarse
              </button>
            </div>
            <button style={{marginTop:18,padding:'6px 18px',background:'#64748b',color:'white',border:'none',borderRadius:8,fontSize:14,cursor:'pointer'}} onClick={()=>setShowAuthPopup(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

