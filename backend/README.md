# Parking Backend

## Run the backend

PowerShell:
```powershell
cd backend
npm install
# Optional environment variables:
# $env:JWT_SECRET = "your_jwt_secret"
# $env:CAMERA_TOKEN = "your_camera_token"
# $env:RESERVATION_MAX_DAYS = 30   # días máximo para reservar en el futuro (por defecto 30)
# $env:RATE_LIMIT_WINDOW = 15      # ventana (minutos) para rate limit auth
# $env:RATE_LIMIT_MAX_REQUESTS = 5 # intentos máximos en la ventana
npm start
```

Servidor por defecto: puerto 5000 (usa `$env:PORT` si se define).

## Tests e integración

```powershell
cd backend
npm test
```
El script de test ejecuta el servidor in‑process y valida flujos clave (auth, reservas, etc.).

## Reservas adelantadas
La lógica permite reservar hasta `RESERVATION_MAX_DAYS` días en el futuro (respuesta de error: `Invalid reservation time (max <Nd advance)`). Frontend usa este límite para validar el selector de fechas.

## Variables principales
| Variable | Descripción | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Firma de los tokens JWT | `supersecretjwt` |
| `CAMERA_TOKEN` | Autorización para endpoint de cámaras | `CAMERA_SECRET_123` |
| `RESERVATION_MAX_DAYS` | Días máximos adelantados para reservar | `30` |
| `RATE_LIMIT_WINDOW` | Minutos de ventana para rate limit auth | `15` |
| `RATE_LIMIT_MAX_REQUESTS` | Máx. solicitudes en ventana | `5` |
| `PORT` | Puerto HTTP | `5000` |

## Endpoints clave
- `POST /api/parkmaprd/auth/register`
- `POST /api/parkmaprd/auth/login`
- `GET /api/parkmaprd/parkings/nearest?lat=&lng=&limit=`
- `POST /api/parkmaprd/reservations` (usa límite configurable)
- `GET /api/parkmaprd/users/me/reservations`

## Notas
- El límite de reservas se aplica tanto al endpoint legado como al router modular.
- Ajusta `RESERVATION_MAX_DAYS` según necesidades de negocio sin tocar código.
