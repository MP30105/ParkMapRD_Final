# PARKMAPRD

This workspace contains the PARKMAPRD backend (Node + Express) and a React frontend (Parkmaprd UI).

Backend
-------
Location: `parking-project/backend` (package name updated to `parkmaprd-backend`)

Run the backend:

PowerShell
```
npm install
cd parking-project\backend
npm install
# optionally set secrets, for local dev defaults are used:
# $env:JWT_SECRET = "your_jwt_secret"; $env:CAMERA_TOKEN = "your_camera_token"
npm start
```

Run integration demo/tests:

PowerShell
```
cd parking-project\backend
# uses demo_run.js which starts the server, runs a register/login/camera update/payment flow, then exits
npm test
```

Frontend
--------
Location: `parking-project/frontend` (package name updated to `parkmaprd-frontend`)

Create the frontend app (if you haven't already) and install the map library:

PowerShell
```
cd parking-project\frontend
npm install
npm start
```

After running `npx create-react-app .`, replace the files in `src/` with the provided React source files in this workspace.

Notes
-----
- Secrets / env vars: `JWT_SECRET`, `CAMERA_TOKEN`, `RESERVATION_MAX_DAYS` (nuevo, default 30), `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX_REQUESTS`, `PORT`.
- Reserva avanzada: ahora puedes reservar hasta 30 días adelante (frontend valida y backend retorna error `Invalid reservation time (max 30d advance)` si excede). Ajustable con `RESERVATION_MAX_DAYS`.
- El `demo_run.js` script es una prueba rápida de registro/login/actualización y pago simulado.

Frontend improvements in this workspace
--------------------------------------
- Mapa Leaflet/OpenStreetMap con búsqueda unificada (texto + geocoding), lista de parqueos cercanos y carrusel interactivo.
- Reservas: formulario modal adaptativo (scroll interno, límite de fechas según backend), simulación de pago dentro del modal.
- Toasts reemplazan `alert()` para UX no bloqueante.
- Utilidad de distancia centralizada (`frontend/src/utils/distance.js`).
- Íconos de marcadores dinámicos y cluster personalizado mostrando % disponibilidad.

Quick start (Windows PowerShell)
-------------------------------
1. Start the backend (from repo root):

```powershell
cd parking-project\backend
npm install
# optionally set secrets for local dev:
# $env:JWT_SECRET = "your_jwt_secret"; $env:CAMERA_TOKEN = "your_camera_token"
npm start
```

2. Build and serve the frontend (in a second terminal):

```powershell
cd parking-project\frontend
npm install
npm run build
# optional: serve the build directory
npm install -g serve; serve -s build -l 5000
```

3. Smoke test/demo
- The repo contains `backend/demo_run.js` which starts the backend in-process (on port 4000), runs a register/login/camera update/payment scenario, and exits — useful as a scriptable smoke test:

```powershell
cd parking-project\backend
node demo_run.js
```

Notes
-----
- If you want automated end-to-end UI tests later, I can add a Playwright/Cypress setup and a small test that runs the static server and asserts the map loads and markers appear.
 - I cleaned up a duplicated map file and implemented the interactive map in `frontend/src/MapView.jsx` (it fetches `/api/parkmaprd/parkings`, shows markers and popups, and calls the payment endpoint when requested).

API routes
----------

The backend routes have been namespaced under `/api/parkmaprd/` to reflect the product name. Key endpoints:

- `POST /api/parkmaprd/auth/register` — register a user
- `POST /api/parkmaprd/auth/login` — login and receive a JWT
- `GET /api/parkmaprd/users/me` — get current user (requires Authorization: Bearer <token>)
- `GET /api/parkmaprd/parkings` — list parkings
- `GET /api/parkmaprd/parkings/:id` — get parking details
- `POST /api/parkmaprd/parkings/:id/availability` — camera updates (requires Authorization: Bearer <CAMERA_TOKEN>)
- `GET /api/parkmaprd/parkings/nearest?lat=<>&lng=<>` — find nearest available parking
- `POST /api/parkmaprd/payments/checkout` — pago/ticket
- `POST /api/parkmaprd/reservations` — crear reserva (usa ventana dinámica `RESERVATION_MAX_DAYS`)
- `GET /api/parkmaprd/users/me/reservations` — listar reservas

Tests
-----
- Backend integra pruebas (Jest) incluyendo validación de error al exceder límite de días para reservar.
- Para modificar el límite sin cambiar tests, exporta `RESERVATION_MAX_DAYS` antes de `npm test`.

Si quieres, se puede añadir CI (GitHub Actions) o pruebas E2E adicionales (Playwright) después.
