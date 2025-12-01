// Forzar el backend a http://localhost:5000/api/parkmaprd para cualquier entorno local
const BASE_URL = 'http://localhost:5000/api/parkmaprd';
// Root (non /api) endpoints (e.g. /admin/audit) live off the bare host
const ROOT_BASE_URL = process.env.REACT_APP_BACKEND_ROOT || 'http://localhost:5000';

async function apiRequest(path, options = {}) {
  // Evita duplicar /parkmaprd si el path ya lo incluye
  let cleanPath = path.replace(/^\/+/, '');
  if (BASE_URL.endsWith('/parkmaprd') && cleanPath.startsWith('parkmaprd/')) {
    cleanPath = cleanPath.replace(/^parkmaprd\//, '');
  }
  const url = `${BASE_URL}/${cleanPath}`;

  if (!navigator.onLine) {
    console.warn('App is offline, request will fail:', url);
    throw new Error('Sin conexión a Internet. Algunas funciones requieren conectividad.');
  }
  
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    
    if (!res.ok) {
      const text = await res.text();
      
      // Handle specific offline/service worker responses
      if (res.status === 503 && text.includes('offline')) {
        throw new Error('Servicio no disponible. Verifica tu conexión a Internet.');
      }
      
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
    }
    
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
    
  } catch (e) {
    // Enhanced error handling for network issues
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      console.error('Network error detected:', e);
      throw new Error('Error de conexión. Verifica tu conexión a Internet e inténtalo de nuevo.');
    }
    
    if (e.name === 'AbortError') {
      throw new Error('La solicitud fue cancelada. Inténtalo de nuevo.');
    }
    
    console.error('API request failed', url, e);
    throw e;
  }
}

export const apiGet = (path, headers={}) => apiRequest(path, { method: 'GET', headers });
export const apiPost = (path, body={}, headers={}) => apiRequest(path, { method: 'POST', body: JSON.stringify(body), headers });
export const apiPut = (path, body={}, headers={}) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body), headers });
export const apiDelete = (path, headers={}) => apiRequest(path, { method: 'DELETE', headers });

export function attachAuth(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function backendHealth() {
  return apiGet('parkmaprd/parkings').then(()=>true).catch(()=>false);
}

// Root-level request helpers (bypass /api prefix) for legacy or special endpoints
async function rootRequest(path, options = {}) {
  const url = `${ROOT_BASE_URL}/${path.replace(/^\//, '')}`;
  if (!navigator.onLine) throw new Error('Sin conexión a Internet.');
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${text.slice(0,200)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Solicitud cancelada');
    throw e;
  }
}

export const apiRootGet = (path, headers={}) => rootRequest(path, { method: 'GET', headers });
export const apiRootPost = (path, body={}, headers={}) => rootRequest(path, { method: 'POST', body: JSON.stringify(body), headers });
export const apiRootPut = (path, body={}, headers={}) => rootRequest(path, { method: 'PUT', body: JSON.stringify(body), headers });
export const apiRootDelete = (path, headers={}) => rootRequest(path, { method: 'DELETE', headers });

// Default export for backward compatibility
const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  attachAuth,
  backendHealth,
  root: {
    get: apiRootGet,
    post: apiRootPost,
    put: apiRootPut,
    delete: apiRootDelete
  }
};

export default api;

