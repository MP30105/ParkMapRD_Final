import React, { useState, useEffect } from "react";
import { apiPost } from './api';

function Auth({ onAuthSuccess, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ email: "", username: "", password: "", passwordConfirm: "", name: "", licensePlate: "" });
  // Track whether user has attempted an auth action so we avoid showing
  // connection/validation errors on initial render before any interaction.
  const [attempted, setAttempted] = useState(false);
  const testAccounts = [
    { label: 'Demo', username: 'demo', password: 'testpass' },
    { label: 'Admin', username: 'admin', password: 'admin' },
    { label: 'Main', username: 'mainadmin', password: 'mainpass' }
  ];

  const quickLogin = async (u, p) => {
    if (submitting) return;
    setAttempted(true);
    setGenericError("");
    setErrors([]);
    setSubmitting(true);
    try {
      const data = await apiPost('parkmaprd/auth/login', { username: u, password: p });
      if (rememberMe) localStorage.setItem('lastLoginIdentifier', u);
      else localStorage.removeItem('lastLoginIdentifier');
      onAuthSuccess(data.token, data.user, rememberMe);
    } catch (e) {
      const lower = (e.message || '').toLowerCase();
      if (lower.includes('invalid credentials')) setGenericError('Credenciales inválidas.');
      else if (lower.includes('user not found')) setGenericError('Usuario no encontrado.');
      else if (lower.includes('password')) setGenericError('Contraseña incorrecta.');
      else if (lower.includes('failed to fetch')) setGenericError('No se puede conectar al servidor.');
      else setGenericError('Error: ' + (e.message || 'desconocido'));
    } finally {
      setSubmitting(false);
    }
  };
  const [errors, setErrors] = useState([]);
  const [genericError, setGenericError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Update mode when initialMode changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Prefill last identifier when in login mode
  useEffect(() => {
    if (mode === 'login') {
      const last = localStorage.getItem('lastLoginIdentifier');
      if (last && !form.username) {
        setForm(prev => ({ ...prev, username: last }));
      }
    }
  }, [mode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors({ ...fieldErrors, [name]: '' });
    }

    // Real-time password strength
    if (name === 'password' && mode === 'register') {
      calculatePasswordStrength(value);
    }
  };

  const calculatePasswordStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const levels = [
      { score: 0, label: '', color: '' },
      { score: 1, label: 'Muy débil', color: '#ef4444' },
      { score: 2, label: 'Débil', color: '#f59e0b' },
      { score: 3, label: 'Media', color: '#eab308' },
      { score: 4, label: 'Fuerte', color: '#10b981' },
      { score: 5, label: 'Muy fuerte', color: '#059669' }
    ];
    setPasswordStrength(levels[Math.min(score, 5)]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setAttempted(true);
    setGenericError("");
    setErrors([]);

    // Enhanced client validation
    const newFieldErrors = {};
    
    if (mode === 'register') {
      if (!form.email) newFieldErrors.email = 'Email requerido';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newFieldErrors.email = 'Email inválido';
      
      if (!form.username) newFieldErrors.username = 'Usuario requerido';
      else if (form.username.length < 3) newFieldErrors.username = 'Usuario debe tener al menos 3 caracteres';
      else if (!/^[a-zA-Z0-9_]+$/.test(form.username)) newFieldErrors.username = 'Usuario solo puede contener letras, números y _';
      
      if (form.password.length < 6) newFieldErrors.password = 'La contraseña debe tener al menos 6 caracteres';
      if (form.password !== form.passwordConfirm) newFieldErrors.passwordConfirm = 'Las contraseñas no coinciden';
      
      if (Object.keys(newFieldErrors).length) { 
        setFieldErrors(newFieldErrors); 
        return; 
      }
    }
    
    if (mode === 'login') {
      if (!form.username) newFieldErrors.username = 'Usuario requerido';
      if (!form.password) newFieldErrors.password = 'Contraseña requerida';
      if (Object.keys(newFieldErrors).length) { 
        setFieldErrors(newFieldErrors); 
        return; 
      }
    }

    try {
      const identifier = form.username.trim();
      const payload = mode === 'login'
        ? { username: identifier, password: form.password }
        : { email: form.email.trim(), username: identifier, password: form.password, name: form.name.trim(), licensePlate: form.licensePlate.trim() };
      const endpoint = mode === 'login' ? 'parkmaprd/auth/login' : 'parkmaprd/auth/register';
      try {
        const data = await apiPost(endpoint, payload);
        onAuthSuccess(data.token, data.user, rememberMe);
      } catch (e) {
        const msg = e.message || '';
        // Attempt to extract backend JSON error if present
        if (/\{"error":/.test(msg)) {
          try {
            const jsonSnippet = msg.slice(msg.indexOf('{'), msg.lastIndexOf('}')+1);
            const parsed = JSON.parse(jsonSnippet);
            const lower = (parsed.error || '').toLowerCase();
            if (lower.includes('invalid credentials')) setGenericError('Credenciales inválidas. Verifica usuario/email y contraseña.');
            else if (lower.includes('username already taken')) setGenericError('El usuario ya está en uso.');
            else if (lower.includes('email already registered')) setGenericError('El email ya está registrado.');
            else if (lower.includes('username required')) setGenericError('Usuario requerido.');
            else if (lower.includes('password')) setGenericError('La contraseña es inválida.');
            else setGenericError(parsed.error || 'Error desconocido');
          } catch (_) {
            setGenericError('Error: ' + msg);
          }
        } else if (msg.toLowerCase().includes('invalid credentials')) {
          setGenericError('Credenciales inválidas.');
        } else if (msg.toLowerCase().includes('failed to fetch')) {
          setGenericError('No se puede conectar al servidor. Verifica que el backend corre en el puerto 5000.');
        } else {
          setGenericError('Error: ' + msg);
        }
        return;
      }
    } catch (err) {
      setGenericError("No se puede conectar al servidor. Verifica que el backend corre en el puerto 5000.");
      console.error("Auth error:", err);
    } finally {
      // Store last identifier if desired
      if (mode === 'login') {
        if (rememberMe) localStorage.setItem('lastLoginIdentifier', form.username.trim());
        else localStorage.removeItem('lastLoginIdentifier');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card elevated-card fade-in">
      <h2 style={{color: '#000000'}}>{mode === "login" ? "Iniciar sesión" : "Registrarse"}</h2>
      <form onSubmit={submit}>
        {mode === "login" ? (
          <>
            <div>
              <label>Usuario o Email</label>
              <input 
                name="username" 
                value={form.username} 
                onChange={handleChange} 
                required 
                autoComplete="username" 
              />
            </div>
            <div>
              <label>Contraseña</label>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  name="password" 
                  value={form.password} 
                  onChange={handleChange} 
                  required 
                  autoComplete="current-password"
                />
                <button type="button" className="btn btn--outline" onClick={() => setShowPassword(s => !s)} style={{ fontSize:16, padding:'6px 12px' }}>
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, margin: 0 }}>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Recordarme
              </label>
              <button type="submit" className="btn primary" disabled={submitting} style={{ margin: 0, padding: '8px 20px' }}>
                {submitting ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label>Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required style={{borderColor: fieldErrors.email ? '#ef4444' : ''}} />
              {fieldErrors.email && <div style={{color:'#ef4444',fontSize:12,marginTop:2}}>{fieldErrors.email}</div>}
            </div>
            <div>
              <label>Usuario o Email</label>
              <input name="username" value={form.username} onChange={handleChange} required style={{borderColor: fieldErrors.username ? '#ef4444' : ''}} />
              {fieldErrors.username && <div style={{color:'#ef4444',fontSize:12,marginTop:2}}>{fieldErrors.username}</div>}
            </div>
            <div>
              <label>Contraseña</label>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  name="password" 
                  value={form.password} 
                  onChange={handleChange} 
                  required 
                  style={{borderColor: fieldErrors.password ? '#ef4444' : ''}}
                  autoComplete="new-password"
                />
                <button type="button" className="btn btn--outline" onClick={() => setShowPassword(s => !s)} style={{ fontSize:16, padding:'6px 12px' }}>
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
              {fieldErrors.password && <div style={{color:'#ef4444',fontSize:12,marginTop:2}}>{fieldErrors.password}</div>}
              {form.password && passwordStrength.label && (
                <div style={{marginTop:4,fontSize:12}}>
                  Fortaleza: <span style={{color:passwordStrength.color,fontWeight:'bold'}}>{passwordStrength.label}</span>
                </div>
              )}
            </div>
            <div>
              <label>Confirmar Contraseña</label>
              <input type="password" name="passwordConfirm" value={form.passwordConfirm} onChange={handleChange} required style={{borderColor: fieldErrors.passwordConfirm ? '#ef4444' : ''}} />
              {fieldErrors.passwordConfirm && <div style={{color:'#ef4444',fontSize:12,marginTop:2}}>{fieldErrors.passwordConfirm}</div>}
            </div>
            <div><label>Nombre (opcional)</label><input name="name" value={form.name} onChange={handleChange} /></div>
            <div><label>Placa (opcional)</label><input name="licensePlate" value={form.licensePlate} onChange={handleChange} /></div>
            <button type="submit" className="btn primary" style={{ marginTop: 8 }} disabled={submitting}>
              {submitting ? 'Registrando…' : 'Registrar'}
            </button>
          </>
        )}
        {attempted && genericError && <p style={{ color: "red" }}>{genericError}</p>}
        {attempted && errors.length > 0 && (
          <ul style={{ color: 'red', paddingLeft:18 }}>
            {errors.map((er,i)=>(<li key={i}>{er}</li>))}
          </ul>
        )}
        {mode === 'login' && (
          <div className="auth-actions" style={{marginTop:14, display:'flex', gap:8, flexWrap:'wrap'}}>
            <button
              type="button"
              className="btn primary"
              disabled={submitting}
              onClick={() => quickLogin('usuarioX', 'usuarioX123')}
              title="Entrar directamente con el usuario normal"
            >
              UsuarioX
            </button>
            <button
              type="button"
              className="btn"
              disabled={submitting}
              onClick={() => quickLogin('admin', 'admin')}
              title="Entrar directamente con el usuario admin"
            >
              Admin
            </button>
            <button
              type="button"
              className="btn"
              disabled={submitting}
              onClick={() => quickLogin('main@parkmaprd.local', 'mainpass')}
              title="Entrar directamente con el usuario main"
            >
              Main
            </button>
            <button
              type="button"
              className="btn"
              disabled={submitting}
              onClick={() => quickLogin('manager_main_street_parking', 'manager123')}
              title="Entrar rápidamente como Manager de parqueo"
            >
              Manager
            </button>
          </div>
        )}
        
      </form>

      {mode === "login" && (
        <p style={{ marginTop: 12, textAlign: 'center' }}>
          <a 
            href="/forgot-password" 
            style={{ 
              color: '#2196F3', 
              textDecoration: 'none',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
          >
            ¿Olvidaste tu contraseña?
          </a>
        </p>
      )}

      <p style={{marginTop:12, textAlign: 'center', color: '#000000'}}>
        {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
        <button type="button" className="btn btn--outline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </p>
    </div>
  );
}

export default Auth;
