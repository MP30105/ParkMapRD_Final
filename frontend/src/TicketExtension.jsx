import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';

export default function TicketExtension({ ticket, token, onExtended }) {
  const { showToast } = useToast();
  const [minutes, setMinutes] = useState(30);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = ticket.endTime - Date.now();
      setTimeRemaining(remaining);
      
      // Show alert 5 minutes before expiration
      if (remaining > 0 && remaining <= 5 * 60 * 1000 && !showAlert) {
        setShowAlert(true);
        if (Notification.permission === 'granted') {
          new Notification('⏰ Tu tiempo de parqueo está por vencer', {
            body: `Solo quedan ${Math.ceil(remaining / 60000)} minutos`,
            icon: '/parkmaprd-logo.png'
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [ticket.endTime, showAlert]);

  const handleExtend = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/parkmaprd/tickets/${ticket.id}/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ minutes })
      });

      const data = await res.json();
      if (res.ok) {
        showToast('success', `✅ Tiempo extendido por ${minutes} minutos (+$${data.amount.toFixed(2)})`);
        if (onExtended) onExtended(data);
      } else {
        showToast('error', data.error || 'Error al extender tiempo');
      }
    } catch (e) {
      showToast('error', 'Error de conexión');
    }
  };

  const formatTime = (ms) => {
    if (ms <= 0) return '⏱️ Tiempo vencido';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const cost = (minutes / 60) * 2.5;

  return (
    <div style={{marginTop:16,padding:12,background:'rgba(6,182,212,0.1)',borderRadius:8,border:'1px solid rgba(6,182,212,0.3)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color: timeRemaining <= 5 * 60 * 1000 ? '#ef4444' : '#06b6d4'}}>
            {formatTime(timeRemaining)}
          </div>
          <div style={{fontSize:11,color:'#64748b'}}>Vence: {new Date(ticket.endTime).toLocaleTimeString()}</div>
        </div>
        {showAlert && timeRemaining > 0 && (
          <div style={{background:'#fbbf24',color:'#000',padding:'4px 8px',borderRadius:4,fontSize:11,fontWeight:600}}>
            ⚠️ Por vencer
          </div>
        )}
      </div>

      <div style={{marginBottom:12}}>
        <label style={{display:'block',fontSize:13,marginBottom:6,fontWeight:500}}>Agregar tiempo</label>
        <select 
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          style={{width:'100%',padding:8,borderRadius:6,border:'1px solid #cbd5e1',fontSize:13}}
        >
          <option value={15}>15 minutos (+${(15/60*2.5).toFixed(2)})</option>
          <option value={30}>30 minutos (+${(30/60*2.5).toFixed(2)})</option>
          <option value={60}>1 hora (+$2.50)</option>
          <option value={120}>2 horas (+$5.00)</option>
          <option value={180}>3 horas (+$7.50)</option>
        </select>
      </div>

      <button 
        onClick={handleExtend}
        style={{
          width:'100%',
          padding:10,
          background:'#06b6d4',
          color:'white',
          border:'none',
          borderRadius:6,
          fontSize:13,
          fontWeight:600,
          cursor:'pointer'
        }}
      >
        🔄 Extender por {minutes} min (${cost.toFixed(2)})
      </button>
    </div>
  );
}

