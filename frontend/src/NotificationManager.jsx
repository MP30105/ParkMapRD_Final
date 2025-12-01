import { useEffect, useState } from 'react';

export default function NotificationManager({ token, user, onParkingUpdate }) {
  const [ws, setWs] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token || !user) return;

    const websocket = new WebSocket('ws://localhost:5000');
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      websocket.send(JSON.stringify({ type: 'subscribe', userId: user.id }));
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'ping') {
          console.log('WebSocket ping received');
        } else if (data.type === 'subscribed') {
          console.log('Subscribed to notifications for user:', data.userId);
        } else if (data.type === 'notification') {
          setNotifications(prev => [...prev, { ...data, id: Date.now() }]);
          // Auto-remove notification after 5 seconds
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== Date.now()));
          }, 5000);
        } else if (data.type === 'parking_update') {
          console.log('Parking update:', data);
          if (onParkingUpdate) {
            onParkingUpdate(data);
          }
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [token, user]);

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div style={{position:'fixed',top:80,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:8,maxWidth:320}}>
      {/* Connection indicator */}
      <div style={{
        padding:'6px 12px',
        background: connected ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)',
        color:'white',
        borderRadius:6,
        fontSize:12,
        textAlign:'center',
        display: notifications.length === 0 ? 'block' : 'none'
      }}>
        {connected ? '🟢 Conectado en tiempo real' : '🔴 Desconectado'}
      </div>

      {/* Notifications */}
      {notifications.map(notif => (
        <div 
          key={notif.id}
          style={{
            background:'rgba(99,102,241,0.95)',
            color:'white',
            padding:12,
            borderRadius:8,
            boxShadow:'0 4px 12px rgba(0,0,0,0.2)',
            animation:'slideIn 0.3s ease'
          }}
        >
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:8}}>
            <div>
              <div style={{fontWeight:600,marginBottom:4}}>{notif.title || 'Notificación'}</div>
              <div style={{fontSize:13,opacity:0.9}}>{notif.message}</div>
            </div>
            <button 
              onClick={() => dismissNotification(notif.id)}
              style={{background:'none',border:'none',color:'white',fontSize:18,cursor:'pointer',padding:0}}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

