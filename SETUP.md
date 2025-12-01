# Setup y Ejecución del Proyecto ParkMapRD

## Resumen de Cambios Realizados

### 1. Migración a SQLite con sql.js (WASM)

**Problema Original**: `better-sqlite3` requería compilación nativa con C++20, pero el compilador de Visual Studio estaba forzando C++17, causando conflictos.

**Solución Implementada**: Reemplazamos `better-sqlite3` con `sql.js` (SQLite compilado a WebAssembly). Ventajas:
- ✅ Sin dependencias nativas (no requiere compilación)
- ✅ Funciona en cualquier plataforma (Windows, Mac, Linux)
- ✅ Misma API de SQL
- ✅ Archivo `.sqlite` compatible

**Archivos Modificados**:
- `backend/package.json`: Reemplazamos `better-sqlite3` con `sql.js`
- `backend/db.js`: Reescrito para usar sql.js async API
- `backend/parkmaprdData.js`: Adaptado para usar `getDb()` y `saveDb()` del nuevo módulo
- `backend/parkmaprdUserStore.js`: Adaptado para usar nueva API sql.js (statements con `.bind()`, `.step()`, `.getAsObject()`)
- `backend/server.js`: Inicialización async de BD antes de levantar el servidor

### 2. Corrección de Errores en Frontend

- `frontend/src/AdminPanel.jsx`: Removida duplicada línea `} catch (e) { ... }` (línea 79)
- `frontend/src/MapView.jsx`: Cambiado `<=` a `≤` en JSX para evitar conflicto de parsing (línea 167)

### 3. Verificaciones Completadas

✅ Backend: `npm install` sin errores de compilación nativa
✅ Backend: Tests (Jest) pasaron: 2/2 tests OK
✅ Backend: Base de datos SQLite creada (65KB en `backend/data/parkmaprd.sqlite`)
✅ Backend: Servidor levanta sin errores en puerto 4000
✅ Frontend: `npm install --legacy-peer-deps` sin errores
✅ Frontend: Build producción compiló exitosamente (108KB JS, 7KB CSS)

---

## Instrucciones para Ejecutar

### Backend

1. **Instalar dependencias** (si aún no lo has hecho):
```bash
cd backend
npm install
```

2. **Iniciar el servidor**:
```bash
npm start
# O: node server.js
```

El servidor se levantará en `http://localhost:4000` y automáticamente:
- Inicializará la base de datos SQLite en `backend/data/parkmaprd.sqlite`
- Creará tablas (users, cars, parkings, tickets, wallets, ratings, payments)
- Migrará datos desde `parkings.json` y `users.json` si existen
- Generará usuarios demo automáticamente

**Usuarios de Demo**:
- Main Admin: `main@parkmaprd.local` / `mainpass`
- Admin: `admin@parkmaprd.local` / `adminpass`
- User: `demo@parkmaprd.local` / `testpass`

3. **Ejecutar tests**:
```bash
npm test
```

### Frontend

1. **Instalar dependencias**:
```bash
cd frontend
npm install --legacy-peer-deps
```

2. **Ejecutar en modo desarrollo**:
```bash
npm start
```

Abrirá `http://localhost:3000` automáticamente.

3. **Build para producción**:
```bash
npm run build
```

---

## Requisitos del Sistema

- **Node.js** 20.x o superior (probado con v24.11.0)
- **npm** 10.x o superior
- No requiere Visual Studio Build Tools ni compiladores nativos

---

## Estructura de la BD SQLite

```sql
users (id, email, passwordHash, name, role)
cars (id, userId, brand, model, plate)
parkings (id, name, lat, lng, totalSpots, availableSpots)
tickets (id, parkingId, userId, carId, zone, spotNumber, startTime, endTime, status, usedAt)
wallets (id, userId, provider, token, meta)
ratings (id, parkingId, userId, score, comment, createdAt)
payments (id, userId, parkingId, amount, status, transactionId, createdAt)
```

---

## Endpoints API Disponibles

### Autenticación
- `POST /api/parkmaprd/auth/register` - Registrar usuario
- `POST /api/parkmaprd/auth/login` - Login

### Usuarios
- `GET /api/parkmaprd/users/me` - Obtener perfil del usuario logueado
- `GET /api/parkmaprd/users/me/cars` - Listar carros del usuario
- `POST /api/parkmaprd/users/me/cars` - Agregar nuevo carro

### Parqueos
- `GET /api/parkmaprd/parkings` - Listar todos los parqueos
- `GET /api/parkmaprd/parkings/:id` - Obtener detalles de un parqueo

### Tickets / Reservas
- `POST /api/parkmaprd/bookings` - Crear reserva/ticket
- `GET /api/parkmaprd/users/me/tickets` - Listar tickets activos y previos
- `POST /api/parkmaprd/tickets/:id/use` - Marcar ticket como usado

### Admin
- `GET /api/parkmaprd/admin/parkings` - Listar parqueos (admin)
- `POST /api/parkmaprd/admin/parkings` - Crear parqueo (admin)
- `PUT /api/parkmaprd/admin/parkings/:id` - Editar parqueo (admin)
- `DELETE /api/parkmaprd/admin/parkings/:id` - Eliminar parqueo (admin)
- `GET /api/parkmaprd/admin/users` - Listar usuarios (admin)
- `POST /api/parkmaprd/admin/admins` - Crear admin (solo main)

---

## Troubleshooting

### Error: "sql.js no encontrado"
Ejecuta `npm install` nuevamente en `backend`:
```bash
cd backend
npm install
```

### Error: "Cannot find module './db'"
Asegúrate de estar en el directorio `backend` antes de ejecutar los comandos.

### El frontend no se conecta al backend
Verifica que:
1. El backend esté ejecutándose en `http://localhost:4000`
2. CORS está habilitado (está configurado en `server.js`)
3. Los puertos 3000 (frontend) y 4000 (backend) no estén en uso

### "Legacy peer deps" warning en frontend
Es normal. Fue necesario instalar con esta flag debido a conflictos de versiones de React y react-leaflet. No afecta la funcionalidad.

---

## Próximos Pasos Recomendados

1. **Integración de Pagos**: Agregar Stripe (sandbox) para pagos reales
2. **Real-time Updates**: Implementar WebSockets (Socket.io) para disponibilidad en vivo
3. **Ratings**: Completar UI y persistencia de ratings
4. **Mejor Mapa**: Usar Google Maps Distance Matrix API para sugerencias más precisas
5. **Pruebas E2E**: Implementar tests end-to-end con Playwright
6. **Deployment**: Docker, CI/CD con GitHub Actions, SSL/TLS

---

## Contacto y Notas

- Proyecto: ParkMapRD
- Base de datos: SQLite (sql.js WASM, ~65KB por defecto)
- Tests: Jest (backend), Playwright (E2E, opcional)
- Build Frontend: React Scripts (Create React App)
