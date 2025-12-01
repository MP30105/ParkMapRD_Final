import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';

const PWAManager = () => {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [cacheSize, setCacheSize] = useState(0);
  const [swRegistration, setSwRegistration] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);
  const [storedVersion, setStoredVersion] = useState(localStorage.getItem('appVersion') || null);
  const [updateNeeded, setUpdateNeeded] = useState(false);

  useEffect(() => {
    // Detectar estado de conexión
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
// Detectar evento de instalación PWA y guardar el evento para usarlo en el clic del usuario
const handleBeforeInstallPrompt = (e) => {
  e.preventDefault();
  setInstallPrompt(e);
  setShowInstallButton(true);
};
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // Detectar si ya está instalado
    const handleAppInstalled = () => {
      setShowInstallButton(false);
      setInstallPrompt(null);
    };
    
    window.addEventListener('appinstalled', handleAppInstalled);
    
    // Obtener registro del service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        setSwRegistration(registration);
        getCacheInfo();
        checkVersion();
      });
    } else {
      checkVersion();
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Verificar versión contra el backend y determinar si se necesita actualización
  const checkVersion = async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const currentServerVersion = data.version || data?.name || null;
      setServerVersion(currentServerVersion);
      if (currentServerVersion && storedVersion && currentServerVersion !== storedVersion) {
        setUpdateNeeded(true);
      }
      if (!storedVersion && currentServerVersion) {
        // Primera vez, guardamos versión
        localStorage.setItem('appVersion', currentServerVersion);
        setStoredVersion(currentServerVersion);
      }
    } catch (e) {
      // Ignorar errores de red
      console.log('Version check failed', e);
    }
  };

  // Forzar limpieza total y recarga dura con query param para bustear caché
  const forceUpdate = async () => {
    if (!isOnline) return;
    try {
      // Borrar caches
      if (window.caches) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      // Unregister SWs
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try { await r.unregister(); } catch {}
        }
      }
      if (serverVersion) {
        localStorage.setItem('appVersion', serverVersion);
        setStoredVersion(serverVersion);
      }
      // Recarga con parámetro único
      const paramVersion = serverVersion || Date.now();
      const newUrl = window.location.pathname + '?v=' + paramVersion + '&ts=' + Date.now();
      window.location.replace(newUrl);
    } catch (e) {
      console.log('Force update failed', e);
    }
  };

  // Re-chequeo periódico cada 60s
  useEffect(() => {
    const interval = setInterval(() => {
      checkVersion();
    }, 60000);
    return () => clearInterval(interval);
  }, [storedVersion]);

  const getCacheInfo = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        setCacheSize(event.data.cacheSize);
      };
      
      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    }
  };

  const handleInstallClick = async (e) => {
    if (installPrompt && e && e.type === 'click') {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
          setShowInstallButton(false);
        }
      } catch (err) {
        console.warn('installPrompt.prompt() falló:', err);
      }
      setInstallPrompt(null);
    } else {
      console.warn('installPrompt.prompt() bloqueado: no es un evento de usuario');
    }
  };

  const clearCache = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data.success) {
          setCacheSize(0);
          showToast('success', 'Caché limpiado exitosamente');
        }
      };
      
      navigator.serviceWorker.controller.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    }
  };

  const updateApp = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  return (
    <div className="pwa-manager" style={{ 
      position: 'fixed', 
      top: '90px', 
      right: '20px', 
      zIndex: 998,
      fontSize: '12px'
    }}>
      {/* Botón compacto para mostrar/ocultar info */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          background: isOnline ? 'rgba(39, 174, 96, 0.9)' : 'rgba(231, 76, 60, 0.9)',
          color: 'white',
          border: 'none',
          borderRadius: '20px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '500',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease'
        }}
      >
        <span style={{ marginRight: '6px' }}>
          {isOnline ? '🌐' : '📴'}
        </span>
        <span>{isOnline ? 'Online' : 'Offline'}</span>
        {(cacheSize > 0 || showInstallButton || (swRegistration && swRegistration.waiting)) && (
          <span style={{ 
            marginLeft: '6px', 
            background: 'rgba(255,255,255,0.3)', 
            borderRadius: '50%', 
            width: '16px', 
            height: '16px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            fontSize: '10px' 
          }}>
            {(showInstallButton ? 1 : 0) + (cacheSize > 0 ? 1 : 0) + ((swRegistration && swRegistration.waiting) ? 1 : 0)}
          </span>
        )}
        <span style={{ marginLeft: '6px', fontSize: '10px' }}>
          {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Panel expandido con información detallada */}
      {isExpanded && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: '0',
          marginTop: '8px',
          background: 'rgba(0,0,0,0.9)',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          minWidth: '200px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          opacity: 1,
          transform: 'translateY(0)',
          transition: 'all 0.2s ease'
        }}>
          {/* Estado de conexión detallado */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '12px',
            padding: '6px 10px',
            background: isOnline ? 'rgba(39, 174, 96, 0.2)' : 'rgba(231, 76, 60, 0.2)',
            borderRadius: '4px',
            border: `1px solid ${isOnline ? '#27ae60' : '#e74c3c'}`
          }}>
            <span style={{ marginRight: '8px' }}>
              {isOnline ? '🌐' : '📴'}
            </span>
            <span>{isOnline ? 'Conectado' : 'Sin conexión'}</span>
          </div>

          {/* Información de caché */}
          {cacheSize > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>📦 Caché: {cacheSize} elementos</span>
              </div>
              <button
                onClick={clearCache}
                style={{
                  padding: '4px 8px',
                  background: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '10px',
                  width: '100%'
                }}
              >
                🗑️ Limpiar Caché
              </button>
            </div>
          )}

          {/* Botón de instalación PWA */}
          {showInstallButton && (
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={e => handleInstallClick(e)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                📱 Instalar como App
              </button>
            </div>
          )}

          {/* Botón de actualización */}
          {swRegistration && swRegistration.waiting && (
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={updateApp}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#f39c12',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                🔄 Nueva versión disponible
              </button>
            </div>
          )}

          {/* Botón fuerza actualización si detectamos versión distinta */}
          {updateNeeded && (
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={forceUpdate}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#e67e22',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                ⚡ Actualizar versión ({storedVersion || '—'} → {serverVersion})
              </button>
            </div>
          )}

          {/* Info versión actual */}
          {serverVersion && (
            <div style={{
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '4px',
              fontSize: '10px',
              lineHeight: '1.4',
              marginBottom: '8px'
            }}>
              Versión servidor: <strong>{serverVersion}</strong><br />
              Versión local: <strong>{storedVersion || 'no-set'}</strong>
            </div>
          )}

          {/* Advertencia offline */}
          {!isOnline && (
            <div style={{
              padding: '8px',
              background: 'rgba(231, 76, 60, 0.2)',
              borderRadius: '4px',
              border: '1px solid #e74c3c',
              fontSize: '10px',
              lineHeight: '1.3'
            }}>
              ⚠️ Funciones limitadas en modo offline
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PWAManager;