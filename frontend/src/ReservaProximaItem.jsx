import React, { useState } from 'react';
import ReservationQR from './ReservationQR';

export default function ReservaProximaItem({ res, startTime, duration, canModify, extendReservation, cancelReservation }) {
  const [showQR, setShowQR] = useState(false);
  return (
    <div style={{padding:12,background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,marginBottom:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'start'}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,color:'#000'}}>{res.parkingId}</div>
          <div style={{fontSize:13,color:'#334155',marginTop:4}}>
            🕐 {startTime.toLocaleString()} • {duration}h
          </div>
          <div style={{fontSize:12,color:'#64748b',marginTop:2}}>
            📍 Spot {res.spotNumber} • 💰 ${res.amount}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
          {canModify && (
            <>
              <button
                onClick={() => {
                  let hours = null;
                  try {
                    hours = window.prompt('¿Cuántas horas adicionales? (1-5)', '1');
                  } catch (err) {
                    console.warn('Prompt bloqueado por el navegador:', err);
                  }
                  if (hours && !isNaN(hours) && hours > 0 && hours <= 5) {
                    extendReservation(res.id, parseInt(hours));
                  }
                }}
                style={{padding:'4px 8px',background:'#10b981',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}
                title="Extender tiempo"
              >
                ⏰ +Tiempo
              </button>
              <button
                onClick={() => cancelReservation(res.id)}
                style={{padding:'4px 8px',background:'#ef4444',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:11}}
                title="Cancelar reservación"
              >
                ❌ Cancelar
              </button>
            </>
          )}
          {res.qrData && (
            <button
              onClick={() => setShowQR(v => !v)}
              style={{padding:'4px 8px',background:'#3498db',color:'white',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,marginTop:canModify ? 4 : 0}}
              title="Mostrar QR"
            >
              {showQR ? 'Ocultar QR' : 'QR'}
            </button>
          )}
          {!canModify && (
            <span style={{fontSize:11,color:'#f59e0b',fontWeight:600}}>En curso</span>
          )}
        </div>
      </div>
      {showQR && res.qrData && (
        <ReservationQR qrData={res.qrData} />
      )}
    </div>
  );
}
