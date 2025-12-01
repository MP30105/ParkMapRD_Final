import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';

export default function UserPreferences({ token, onClose, onApply }) {
  const [prefs, setPrefs] = useState({
    theme: 'auto',
    fontSize: 'medium',
    layoutDensity: 'normal',
    biometricEnabled: false,
    autoRenewEnabled: false,
    notificationsEnabled: true
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!token) return;
    
    fetch('http://localhost:5000/api/parkmaprd/users/me/preferences', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const { primaryColor, ...rest } = data; // ignore primaryColor
        const loaded = {
          ...rest,
          biometricEnabled: Boolean(rest.biometricEnabled),
          autoRenewEnabled: Boolean(rest.autoRenewEnabled),
          notificationsEnabled: Boolean(rest.notificationsEnabled)
        };
        setPrefs(loaded);
        onApply && onApply(loaded);
      })
      .catch(console.error);
  }, [token]);

  const savePreferences = async () => {
    setSaving(true);
    try {
      const res = await fetch('http://localhost:5000/api/parkmaprd/users/me/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(prefs)
      });

      if (res.ok) {
        showToast('success', 'Preferencias guardadas');
        onClose && onClose();
      } else {
        showToast('error', 'Error al guardar preferencias');
      }
    } catch (e) {
      showToast('error', 'Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  // Primary color picker removed per request

  return (
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
    }}>
      <div style={{
        background:'white',
        padding:24,
        borderRadius:12,
        maxWidth:500,
        width:'90%',
        maxHeight:'90vh',
        overflowY:'auto',
        color:'#0f172a'
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{margin:0}}>⚙️ Preferencias</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:24,cursor:'pointer'}}>✕</button>
        </div>

        {/* Theme */}
        <div style={{marginBottom:20}}>
          <label style={{display:'block',fontSize:14,fontWeight:600,marginBottom:8}}>🌓 Tema</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {['light', 'dark', 'auto'].map(theme => (
              <button
                key={theme}
                onClick={() => {
                  const next = { ...prefs, theme };
                  setPrefs(next);
                  onApply && onApply(next);
                }}
                style={{
                  padding:10,
                  background: prefs.theme === theme ? '#06b6d4' : '#f1f5f9',
                  color: prefs.theme === theme ? 'white' : '#334155',
                  border:'none',
                  borderRadius:6,
                  fontSize:13,
                  cursor:'pointer',
                  textTransform:'capitalize'
                }}
              >
                {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🔄'} {theme}
              </button>
            ))}
          </div>
        </div>

        {/* Primary color picker removed */}

        {/* Font Size */}
        <div style={{marginBottom:20}}>
          <label style={{display:'block',fontSize:14,fontWeight:600,marginBottom:8}}>📏 Tamaño de fuente</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {['small', 'medium', 'large'].map(size => (
              <button
                key={size}
                onClick={() => {
                  const next = { ...prefs, fontSize: size };
                  setPrefs(next);
                  onApply && onApply(next);
                }}
                style={{
                  padding:10,
                  background: prefs.fontSize === size ? '#06b6d4' : '#f1f5f9',
                  color: prefs.fontSize === size ? 'white' : '#334155',
                  border:'none',
                  borderRadius:6,
                  fontSize: size === 'small' ? 11 : size === 'large' ? 15 : 13,
                  cursor:'pointer',
                  textTransform:'capitalize'
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Layout Density */}
        <div style={{marginBottom:20}}>
          <label style={{display:'block',fontSize:14,fontWeight:600,marginBottom:8}}>📐 Densidad del diseño</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {['compact', 'normal'].map(density => (
              <button
                key={density}
                onClick={() => {
                  const next = { ...prefs, layoutDensity: density };
                  setPrefs(next);
                  onApply && onApply(next);
                }}
                style={{
                  padding:10,
                  background: prefs.layoutDensity === density ? '#06b6d4' : '#f1f5f9',
                  color: prefs.layoutDensity === density ? 'white' : '#334155',
                  border:'none',
                  borderRadius:6,
                  fontSize:13,
                  cursor:'pointer',
                  textTransform:'capitalize'
                }}
              >
                {density}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div style={{marginBottom:20}}>
          <label style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,background:'#f8fafc',borderRadius:6,marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:500}}>🔐 Autenticación biométrica</span>
            <input 
              type="checkbox"
              checked={prefs.biometricEnabled}
              onChange={(e) => {
                const next = { ...prefs, biometricEnabled: e.target.checked };
                setPrefs(next);
                onApply && onApply(next);
              }}
              style={{width:20,height:20,cursor:'pointer'}}
            />
          </label>

          <label style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,background:'#f8fafc',borderRadius:6,marginBottom:8}}>
            <span style={{fontSize:14,fontWeight:500}}>🔄 Auto-renovar parqueo</span>
            <input 
              type="checkbox"
              checked={prefs.autoRenewEnabled}
              onChange={(e) => {
                const next = { ...prefs, autoRenewEnabled: e.target.checked };
                setPrefs(next);
                onApply && onApply(next);
              }}
              style={{width:20,height:20,cursor:'pointer'}}
            />
          </label>

          <label style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:12,background:'#f8fafc',borderRadius:6}}>
            <span style={{fontSize:14,fontWeight:500}}>🔔 Notificaciones</span>
            <input 
              type="checkbox"
              checked={prefs.notificationsEnabled}
              onChange={(e) => {
                const next = { ...prefs, notificationsEnabled: e.target.checked };
                setPrefs(next);
                onApply && onApply(next);
              }}
              style={{width:20,height:20,cursor:'pointer'}}
            />
          </label>
        </div>

        <button 
          onClick={savePreferences}
          disabled={saving}
          style={{
            width:'100%',
            padding:12,
            background: saving ? '#94a3b8' : '#06b6d4',
            color:'white',
            border:'none',
            borderRadius:8,
            fontSize:15,
            fontWeight:600,
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Guardando...' : '💾 Guardar preferencias'}
        </button>
      </div>
    </div>
  );
}

