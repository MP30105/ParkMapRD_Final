import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Auth from "./Auth";
import MapView from "./MapViewFixed";
import Sidebar from "./Sidebar";
import Home from "./Home";
import AdminPanel from "./AdminPanel";
import ParkingManagerPanel from "./ParkingManagerPanel";
import AssistantPanel from "./AssistantPanel";
import ManagerAssignment from "./ManagerAssignment";
// import NotificationManager from "./NotificationManager";
import Onboarding from "./Onboarding";
import UserPreferences from "./UserPreferences";
import Wallet from "./Wallet";
import PaymentSuccess from "./PaymentSuccess";
import PaymentCancelled from "./PaymentCancelled";
import EmailVerification from "./EmailVerification";
import ForgotPassword from "./ForgotPassword";
import PasswordReset from "./PasswordReset";
import PromotionsPanel from "./PromotionsPanel";
import PromotionAdmin from "./PromotionAdmin";
import ChatWidget from "./ChatWidget";
import ComparisonCenter from "./ComparisonCenter";
import AuditDashboard from "./AuditDashboard";
import SmartReminders from "./SmartReminders";
import AutoCheckout from "./AutoCheckout";
import PWAManager from "./PWAManager";
import { apiGet, attachAuth } from './api';
import ToastProvider, { useToast } from './ToastProvider';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

// Main App Wrapper for internal authenticated views
function MainApp({ token, setToken, user, setUser }) {
  const { showToast } = useToast();
  const [parkings, setParkings] = useState([]);
  const [parkingsLoading, setParkingsLoading] = useState(true);
  const [parkingsAttempts, setParkingsAttempts] = useState(0);
  const [versionInfo, setVersionInfo] = useState(null);
  const [selectedParking, setSelectedParking] = useState(null);
  const [view, setView] = useState('map');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  // Exponer funciones globalmente para MapViewFixed
  window.setShowAuth = setShowAuth;
  window.setAuthMode = setAuthMode;
  const [pendingReservation, setPendingReservation] = useState(null);
  const [backendError, setBackendError] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [visibleButtons, setVisibleButtons] = useState([]);
  const [hiddenButtons, setHiddenButtons] = useState([]);
  const [reduceMotion, setReduceMotion] = useState(() => {
    const saved = localStorage.getItem('reduceMotion');
    if (saved) return saved === 'true';
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  // Apply user preferences live (theme, color, font size, density)
  const applyPreferences = (p) => {
    try {
      // Theme → darkMode
      if (p?.theme === 'dark') setDarkMode(true);
      else if (p?.theme === 'light') setDarkMode(false);
      else if (p?.theme === 'auto') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(!!prefersDark);
      }
      // Font size → root font-size
      if (p?.fontSize) {
        const sizeMap = { small: '14px', medium: '16px', large: '18px' };
        const fs = sizeMap[p.fontSize] || '16px';
        document.documentElement.style.fontSize = fs;
      }
      // Layout density → body class
      if (p?.layoutDensity) {
        document.body.classList.remove('density-compact', 'density-normal');
        document.body.classList.add(p.layoutDensity === 'compact' ? 'density-compact' : 'density-normal');
      }
    } catch (_) {}
  };

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.body.className = darkMode ? 'dark-mode' : '';
    if (reduceMotion) document.body.classList.add('reduce-motion'); else document.body.classList.remove('reduce-motion');
  }, [darkMode]);

  useEffect(()=>{
    // re-apply when reduceMotion changes
    if (reduceMotion) document.body.classList.add('reduce-motion'); else document.body.classList.remove('reduce-motion');
    localStorage.setItem('reduceMotion', reduceMotion.toString());
  },[reduceMotion]);

  useEffect(() => {
    let mounted = true;
    if (token) {
      apiGet('parkmaprd/users/me', attachAuth(token))
        .then(data => { if (mounted && !data.error) setUser(data); })
        .catch(err => { if (mounted) console.error('Failed to load user', err); });
    }
    return () => { mounted = false; };
  }, [token]);

  // Load parkings with retry/backoff to avoid initial "can't reach" flash
  useEffect(() => {
    let mounted = true;
    const maxAttempts = 2; // Menos intentos para carga más rápida
    const fetchWithRetry = async (attempt = 1) => {
      setParkingsAttempts(attempt);
      try {
        const data = await apiGet('parkmaprd/parkings');
        if (!mounted) return;
        // Acepta tanto array directo como objeto con results
        const parkingsArray = Array.isArray(data)
          ? data
          : Array.isArray(data.results)
            ? data.results
            : [];
        setParkings(parkingsArray);
        setBackendError(null);
        setParkingsLoading(false);
        // Seleccionar parqueo más cercano por defecto
        if (parkingsArray.length) {
            // Obtener ubicación actual si es posible
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                pos => {
                  const lat = pos.coords.latitude;
                  const lng = pos.coords.longitude;
                  let minDist = Infinity;
                  let nearest = null;
                  for (const p of parkingsArray) {
                    const d = Math.sqrt(Math.pow(p.lat - lat, 2) + Math.pow(p.lng - lng, 2));
                    if (d < minDist) {
                      minDist = d;
                      nearest = p;
                    }
                  }
                  if (nearest) setSelectedParking(nearest);
                },
                () => {
                  // Si no hay permiso, usar el primero
                  setSelectedParking(parkingsArray[0]);
                }
              );
          } else {
            setSelectedParking(parkingsArray[0]);
          }
        }
      } catch (err) {
        if (!mounted) return;
        // Log detallado para diagnóstico
        console.error('Error al cargar parqueos:', err);
        if (err.response) {
          err.response.text().then(txt => {
            console.error('Respuesta del backend:', txt);
          });
        }
        if (attempt < maxAttempts) {
          const delay = 1000; // Menor tiempo de espera entre intentos
          setTimeout(() => fetchWithRetry(attempt + 1), delay);
        } else {
          setBackendError(err.message + (err.stack ? '\n' + err.stack : ''));
          setParkings([]);
          setParkingsLoading(false);
        }
      }
    };
    fetchWithRetry(1);
    return () => { mounted = false; };
  }, []);

  // Fetch backend version info once
  useEffect(() => {
    let active = true;
    apiGet('version')
      .then(v => { if (active) setVersionInfo(v); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Live update polling for parkings availability (every 60s while en vista 'map')
  useEffect(() => {
    if (parkingsLoading) return; // do not start until initial load finished
    if (view !== 'map') return; // only poll when map visible
    let cancelled = false;
    let lastErrorToast = 0;
    const poll = () => {
      if (cancelled) return;
      if (!navigator.onLine) return; // skip offline
      apiGet('parkmaprd/parkings')
        .then(data => {
          if (!Array.isArray(data)) return;
          // Update selected parking availability if changed
          if (selectedParking) {
            const fresh = data.find(p => p.id === selectedParking.id);
            if (fresh && (fresh.availableSpots !== selectedParking.availableSpots || fresh.totalSpots !== selectedParking.totalSpots)) {
              setSelectedParking(prev => prev ? { ...prev, availableSpots: fresh.availableSpots, totalSpots: fresh.totalSpots } : prev);
              showToast('info', `Disponibilidad actualizada: ${fresh.availableSpots}/${fresh.totalSpots}`);
            }
          }
          setParkings(data);
        })
        .catch(() => {
          const now = Date.now();
            if (now - lastErrorToast > 180000) { // limit error toast every 3 minutes
              showToast('error', 'No se pudo actualizar disponibilidad');
              lastErrorToast = now;
            }
        });
    };
    const interval = setInterval(poll, 60000);
    // Run an immediate poll to get fresh data soon after mount
    const immediate = setTimeout(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); clearTimeout(immediate); };
  }, [parkingsLoading, view, selectedParking, showToast]);

  const handleAuthSuccess = (token, user, remember) => {
    try {
      if (remember) {
        localStorage.setItem("token", token);
        sessionStorage.removeItem("token");
      } else {
        sessionStorage.setItem("token", token);
        localStorage.removeItem("token");
      }
    } catch (_) {}
    setToken(token);
    setUser(user);
    setShowAuth(false);
    showToast('success', `Bienvenido ${user?.username || ''}`);
    if (pendingReservation) {
      setSelectedParking(pendingReservation);
      setPendingReservation(null);
    }
  };
  const handleLogout = () => { sessionStorage.removeItem('token'); localStorage.clear(); setToken(""); setUser(null); setView('map'); showToast('info','Sesión cerrada'); };

  const handleReserveClick = (parking) => {
    if (!token) {
      setPendingReservation(parking);
      setAuthMode('login');
      setShowAuth(true);
    } else {
      setSelectedParking(parking);
    }
  };

  const handleParkingUpdate = (data) => {
    setParkings(prev => prev.map(p => 
      p.id === data.parkingId 
        ? { ...p, availableSpots: data.availableSpots }
        : p
    ));
  };

  // Handle window resize for responsive topbar
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate which buttons to show based on screen size
  useEffect(() => {
    if (!token) return;
    
    let allButtons = [];
    
    // If user is admin, only show admin button and basic user functions
    if (user && (user.role === 'admin' || user.role === 'main')) {
      allButtons = [
        { id: 'admin', label: '👑 Admin', action: () => setView('admin'), priority: 1, className: 'admin-item' },
        { id: 'preferences', label: '⚙️ Preferencias', action: () => setShowPreferences(true), priority: 2 }
      ];
    } else if (user && user.role === 'parking_manager') {
      // Parking manager view
      allButtons = [
        { id: 'manager', label: '🅿️ Panel Manager', action: () => setView('manager'), priority: 1, className: 'manager-item' },
        { id: 'preferences', label: '⚙️ Preferencias', action: () => setShowPreferences(true), priority: 2 }
      ];
    } else if (user && user.role === 'parking_assistant') {
      // Parking assistant view
      allButtons = [
        { id: 'assistant', label: '🅿️ Panel Asistente', action: () => setView('assistant'), priority: 1, className: 'assistant-item' },
        { id: 'preferences', label: '⚙️ Preferencias', action: () => setShowPreferences(true), priority: 2 }
      ];
    } else {
      // Normal user buttons
      allButtons = [
        { id: 'tickets', label: '📋 Tickets', action: () => setView('home'), priority: 1 },
        { id: 'wallet', label: '💳 Wallet', action: () => setView('wallet'), priority: 2 },
        { id: 'preferences', label: '⚙️ Preferencias', action: () => setShowPreferences(true), priority: 3 }
      ];
    }

    // Calculate how many buttons can fit based on window width
    const baseWidth = 400; // Logo + dark mode + logout space
    const buttonWidth = 120; // Average button width
    const dropdownWidth = 100; // Dropdown button width
    
    let maxButtons = Math.floor((windowWidth - baseWidth - dropdownWidth) / buttonWidth);
    maxButtons = Math.max(2, Math.min(maxButtons, allButtons.length)); // At least 2, max all buttons

    const visible = allButtons.slice(0, maxButtons);
    const hidden = allButtons.slice(maxButtons);
    
    setVisibleButtons(visible);
    setHiddenButtons(hidden);
  }, [windowWidth, token, user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (showDropdown) {
      const handleClickOutside = (event) => {
        const dropdownContainer = document.querySelector('.dropdown-container');
        if (dropdownContainer && !dropdownContainer.contains(event.target)) {
          setShowDropdown(false);
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div className="app-shell">
      {showAuth ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,position:'relative'}}>
          <button 
            onClick={() => setShowAuth(false)} 
            style={{position:'absolute',top:20,right:20,padding:'8px 16px',background:'#666',color:'white',border:'none',borderRadius:4,cursor:'pointer'}}
          >
            ✕ Cerrar
          </button>
          <Auth onAuthSuccess={handleAuthSuccess} initialMode={authMode} />
        </div>
      ) : (
        <>
          {/* NotificationManager removido por solicitud del usuario */}
          <div className="topbar">
            <div className="brand">
              <div 
                className="logo"
                onClick={() => setView('map')}
                style={{ cursor: 'pointer' }}
                title="Ir al inicio"
              >
                <div className="logo-crop">
                  <img src="/parkmaprd-logo.png" alt="PARKMAPRD" onError={(e) => { console.error('Logo failed to load'); e.target.style.display='none'; }} />
                </div>
              </div>
              {user && (
                <div className="user-info-container">
                  <div className="user-info">
                    <span className="user-greeting">Bienvenido</span>
                    <strong className="user-email">{user?.username}</strong> 
                    {user?.licensePlate && <span className="user-plate">({user.licensePlate})</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="controls">
              <button 
                className="btn" 
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <button
                className="btn"
                onClick={() => setReduceMotion(r=>!r)}
                title={reduceMotion ? 'Activar animaciones' : 'Reducir animaciones'}
                aria-pressed={reduceMotion}
              >
                {reduceMotion ? '🛑' : '🌀'}
              </button>
              {token ? (
                <>
                  {/* Responsive buttons - shown based on available space */}
                  {visibleButtons.map((button) => (
                    <button 
                      key={button.id}
                      className={`btn ${button.className || ''}`}
                      onClick={() => {
                        button.action();
                        setShowDropdown(false);
                      }}
                      style={button.style || {}}
                      title={button.label}
                    >
                      {button.label}
                    </button>
                  ))}
                  
                  {/* Dropdown for hidden buttons */}
                  {hiddenButtons.length > 0 && (
                    <div className="dropdown-container">
                      <button 
                        className="btn dropdown-toggle" 
                        onClick={() => setShowDropdown(!showDropdown)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setShowDropdown(!showDropdown);
                          } else if (e.key === 'Escape') {
                            setShowDropdown(false);
                          }
                        }}
                        aria-expanded={showDropdown}
                        aria-haspopup="true"
                        title="Más opciones"
                      >
                        📋 Más {showDropdown ? '▲' : '▼'}
                      </button>
                      {showDropdown && (
                        <div className="dropdown-menu">
                          {hiddenButtons.map((button) => (
                            <button 
                              key={button.id}
                              className={`dropdown-item ${button.className || ''}`}
                              onClick={() => {
                                button.action();
                                setShowDropdown(false);
                              }}
                            >
                              {button.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <button className="btn secondary logout-btn" onClick={handleLogout}>Salir</button>
                </>
              ) : (
                <>
                  <button className="btn primary" onClick={() => { setAuthMode('login'); setShowAuth(true); }}>Login</button>
                  <button className="btn secondary" onClick={() => { setAuthMode('register'); setShowAuth(true); }}>Registrarse</button>
                </>
              )}
            </div>
          </div>

          {/* Backend error banner removido para no mostrar error al iniciar la página */}
          <div className="layout">
            <div className="map-area" style={{width:'100%'}}>
              {view === 'map' && (
                parkingsLoading ? (
                  <div style={{padding:'30px 24px',maxWidth:680,margin:'0 auto',width:'100%'}}>
                    <div style={{display:'flex',alignItems:'center',gap:18,marginBottom:30}}>
                      <div className="skeleton skeleton-circle" />
                      <div style={{flex:1}}>
                        <div className="skeleton skeleton-line" style={{width:'40%'}} />
                        <div className="skeleton skeleton-line" style={{width:'60%'}} />
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16}}>
                      {Array.from({length:8}).map((_,i)=>(
                        <div key={i} style={{padding:14,borderRadius:14,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.08)'}}>
                          <div className="skeleton skeleton-line" style={{width:'70%'}} />
                          <div className="skeleton skeleton-line" style={{width:'50%'}} />
                          <div className="skeleton skeleton-line" style={{width:'90%',height:10}} />
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:30,fontSize:12,opacity:0.7,textAlign:'center'}}>Cargando parqueos... Intento {parkingsAttempts} / 5</div>
                  </div>
                ) : (
                  <MapView parkings={parkings} selectedParking={selectedParking} setSelectedParking={setSelectedParking} token={token} onReserveClick={handleReserveClick} darkMode={darkMode} />
                )
              )}
              {view === 'home' && token && <Home token={token} user={user} />}
              {view === 'wallet' && token && <Wallet token={token} />}
              {view === 'admin' && user && (user.role === 'admin' || user.role === 'main') && (
                <AdminPanel 
                  token={token} 
                  user={user} 
                  darkMode={darkMode}
                  onParkingUpdate={() => {
                    // Recargar parkings cuando se modifiquen desde el panel de admin
                    apiGet('parkmaprd/parkings')
                      .then(data => setParkings(Array.isArray(data) ? data : []))
                      .catch(err => console.error('Failed to reload parkings:', err));
                  }}
                />
              )}
              {view === 'manager' && user && user.role === 'parking_manager' && (
                <ParkingManagerPanel token={token} onLogout={() => setToken(null)} />
              )}
              {view === 'assistant' && user && user.role === 'parking_assistant' && (
                <AssistantPanel token={token} />
              )}
            </div>
          </div>
        </>
      )}
      
      {showOnboarding && token && user && (
        <Onboarding token={token} user={user} onComplete={() => setShowOnboarding(false)} />
      )}
      
      {showPreferences && token && (
        <UserPreferences token={token} onClose={() => setShowPreferences(false)} onApply={applyPreferences} />
      )}
      
      {token && <ChatWidget token={token} />}
      {versionInfo && (
        <div style={{position:'fixed',left:10,bottom:10,fontSize:11,background:'rgba(0,0,0,0.6)',color:'#fff',padding:'4px 8px',borderRadius:4,zIndex:50}}>
          v{versionInfo.version} • {new Date(versionInfo.bootTime).toLocaleTimeString()} {versionInfo.commit ? '• '+versionInfo.commit.slice(0,7) : ''}
        </div>
      )}
    </div>
  );
}

// App router component
function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || sessionStorage.getItem("token") || "");
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      apiGet('parkmaprd/users/me', attachAuth(token))
        .then(data => { if (!data.error) setUser(data); })
        .catch(err => console.error('Failed to load user', err));
    }
  }, [token]);

  return (
    <ErrorBoundary>
      <ToastProvider>
        <a href="#main-content" className="skip-link">Saltar al contenido</a>
        <PWAManager />
        <Routes>
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<PasswordReset />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-cancelled" element={<PaymentCancelled />} />
          <Route path="/*" element={
            <ErrorBoundary>
              <MainApp token={token} setToken={setToken} user={user} setUser={setUser} />
            </ErrorBoundary>
          } />
        </Routes>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
