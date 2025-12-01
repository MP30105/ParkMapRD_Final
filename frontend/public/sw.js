const CACHE_NAME = 'parkmaprd-v1.2.0';
const STATIC_CACHE = 'parkmaprd-static-v1.2.0';
const DYNAMIC_CACHE = 'parkmaprd-dynamic-v1.2.0';

// Recursos críticos para cachear
const STATIC_FILES = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.png',
  '/logo192.png',
  '/logo512.png'
];

// URLs de API que se pueden cachear
const API_CACHE_PATTERNS = [
  /\/api\/parkings$/,
  /\/api\/users\/me$/,
  /\/api\/promotions$/
];

// URLs que requieren conexión (no cachear)
const NETWORK_ONLY = [
  /\/api\/payments/,
  /\/api\/tickets\/create/,
  /\/api\/auth/,
  /\/api\/admin/
];

// Instalar service worker y cachear recursos estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static files...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Error caching static files:', error);
      })
  );
});

// Activar service worker y limpiar cachés antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Interceptar requests y aplicar estrategias de caché
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar requests HTTP/HTTPS
  if (!request.url.startsWith('http')) return;

  // Estrategias según tipo de recurso
  if (request.method === 'GET') {
    // Network-only para operaciones críticas
    if (NETWORK_ONLY.some(pattern => pattern.test(url.pathname))) {
      event.respondWith(
        fetch(request).catch(() => {
          // Si falla la conexión, devolver respuesta offline
          return new Response(
            JSON.stringify({ 
              error: 'No hay conexión a Internet. Esta acción requiere conectividad.',
              offline: true 
            }),
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
      );
      return;
    }

    // Cache-first para recursos estáticos
    if (STATIC_FILES.includes(url.pathname) || request.destination === 'image') {
      event.respondWith(cacheFirst(request));
      return;
    }

    // Stale-while-revalidate para API data
    if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      event.respondWith(staleWhileRevalidate(request));
      return;
    }

    // Network-first para navegación
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request));
      return;
    }

    // Default: Network-first con fallback
    event.respondWith(networkFirst(request));
  }
});

// Estrategia Cache-First
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    return offlineFallback(request);
  }
}

// Estrategia Network-First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache...');
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return offlineFallback(request);
  }
}

// Estrategia Stale-While-Revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(error => {
    console.log('[SW] Network update failed:', error);
    return cachedResponse;
  });

  return cachedResponse || fetchPromise;
}

// Fallback para modo offline
function offlineFallback(request) {
  if (request.mode === 'navigate') {
    return caches.match('/') || new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Sin Conexión - ParkMapRD</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px;
              background: #f5f5f5;
            }
            .offline-container {
              background: white;
              padding: 40px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 500px;
              margin: 0 auto;
            }
            .offline-icon {
              font-size: 64px;
              color: #e74c3c;
              margin-bottom: 20px;
            }
            h1 { color: #333; }
            p { color: #666; line-height: 1.6; }
            .retry-btn {
              background: #3498db;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="offline-container">
            <div class="offline-icon">📶</div>
            <h1>Sin Conexión a Internet</h1>
            <p>ParkMapRD necesita conexión a Internet para funcionar completamente. Algunas funciones están disponibles sin conexión.</p>
            <button class="retry-btn" onclick="location.reload()">Reintentar</button>
          </div>
        </body>
      </html>`,
      { 
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }

  // Para requests de API, devolver respuesta JSON offline
  if (request.url.includes('/api/')) {
    return new Response(
      JSON.stringify({ 
        error: 'Sin conexión a Internet',
        offline: true,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  return new Response('Recurso no disponible sin conexión', { status: 503 });
}

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    getCacheSize().then(size => {
      event.ports[0].postMessage({ cacheSize: size });
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    clearAllCaches().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Obtener tamaño de caché
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    totalSize += keys.length;
  }
  
  return totalSize;
}

// Limpiar todos los cachés
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
}

// Sincronización en background
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'parking-sync') {
    event.waitUntil(syncParkingData());
  }
  
  if (event.tag === 'offline-actions') {
    event.waitUntil(processOfflineActions());
  }
});

// Sincronizar datos de parqueo
async function syncParkingData() {
  try {
    console.log('[SW] Syncing parking data...');
    const response = await fetch('/api/parkings');
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put('/api/parkings', response.clone());
      console.log('[SW] Parking data synced successfully');
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Procesar acciones offline pendientes
async function processOfflineActions() {
  // Aquí se procesarían acciones guardadas localmente mientras estaba offline
  console.log('[SW] Processing offline actions...');
}

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva notificación de ParkMapRD',
    icon: '/logo192.png',
    badge: '/logo192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver Detalles',
        icon: '/logo192.png'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: '/logo192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('ParkMapRD', options)
  );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('[SW] Service Worker loaded successfully');