import React, { useState, useRef, useEffect } from 'react';
import { apiPost, attachAuth } from './api';

// Componente de escáner QR para managers y asistentes
export default function QRScanner({ token, onScanSuccess, onClose }) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Iniciar cámara
  const startCamera = async () => {
    try {
      setCameraError(null);
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        startScanning();
      }
    } catch (err) {
      console.error('Error al acceder a la cámara:', err);
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  // Detener cámara
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setScanning(false);
  };

  // Escanear frames del video
  const startScanning = () => {
    scanIntervalRef.current = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Usar jsQR para decodificar (si está disponible)
        if (window.jsQR) {
          const code = window.jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleQRCode(code.data);
          }
        }
      }
    }, 250);
  };

  // Procesar código QR escaneado
  const handleQRCode = async (data) => {
    if (processing) return;
    
    stopCamera();
    setProcessing(true);
    setError(null);
    
    try {
      const parsed = JSON.parse(data);
      
      if (!parsed.reservationId) {
        throw new Error('Código QR inválido: no contiene ID de reserva');
      }
      
      // Verificar la reserva en el backend
      const response = await apiPost('parkmaprd/reservations/verify', {
        reservationId: parsed.reservationId,
        qrData: data
      }, attachAuth(token));
      
      setResult({
        success: true,
        reservation: response.reservation,
        message: response.message || '✅ Reserva válida'
      });
      
      if (onScanSuccess) {
        onScanSuccess(response.reservation);
      }
    } catch (err) {
      console.error('Error al procesar QR:', err);
      setResult({
        success: false,
        message: err.message || 'Error al verificar la reserva'
      });
    } finally {
      setProcessing(false);
    }
  };

  // Verificar código manual
  const handleManualVerify = async () => {
    if (!manualCode.trim()) {
      setError('Ingresa un código de reserva');
      return;
    }
    
    setProcessing(true);
    setError(null);
    
    try {
      const response = await apiPost('parkmaprd/reservations/verify', {
        reservationId: manualCode.trim()
      }, attachAuth(token));
      
      setResult({
        success: true,
        reservation: response.reservation,
        message: response.message || '✅ Reserva válida'
      });
      
      if (onScanSuccess) {
        onScanSuccess(response.reservation);
      }
    } catch (err) {
      setResult({
        success: false,
        message: err.message || 'Reserva no encontrada'
      });
    } finally {
      setProcessing(false);
    }
  };

  // Registrar entrada
  const handleCheckIn = async () => {
    if (!result?.reservation?.id) return;
    
    setProcessing(true);
    try {
      await apiPost(`parkmaprd/reservations/${result.reservation.id}/check-in`, {}, attachAuth(token));
      setResult(prev => ({
        ...prev,
        message: '✅ Entrada registrada exitosamente',
        checkedIn: true
      }));
    } catch (err) {
      setError(err.message || 'Error al registrar entrada');
    } finally {
      setProcessing(false);
    }
  };

  // Registrar salida
  const handleCheckOut = async () => {
    if (!result?.reservation?.id) return;
    
    setProcessing(true);
    try {
      await apiPost(`parkmaprd/reservations/${result.reservation.id}/check-out`, {}, attachAuth(token));
      setResult(prev => ({
        ...prev,
        message: '✅ Salida registrada exitosamente',
        checkedOut: true
      }));
    } catch (err) {
      setError(err.message || 'Error al registrar salida');
    } finally {
      setProcessing(false);
    }
  };

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Resetear escáner
  const resetScanner = () => {
    setResult(null);
    setError(null);
    setManualCode('');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.9)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '16px 20px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 18 }}>📷 Escáner de Reservas</h2>
        <button
          onClick={() => { stopCamera(); onClose && onClose(); }}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            fontSize: 24,
            width: 40,
            height: 40,
            borderRadius: '50%',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>

      {/* Área principal */}
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: 24,
        maxWidth: 400,
        width: '100%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        {!result ? (
          <>
            {/* Vista de cámara */}
            {scanning ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  position: 'relative',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#000'
                }}>
                  <video
                    ref={videoRef}
                    style={{ width: '100%', display: 'block' }}
                    playsInline
                    muted
                  />
                  {/* Marco de escaneo */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 200,
                    height: 200,
                    border: '3px solid #10b981',
                    borderRadius: 12,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)'
                  }} />
                </div>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <button
                  onClick={stopCamera}
                  style={{
                    width: '100%',
                    marginTop: 12,
                    padding: 12,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Detener cámara
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={startCamera}
                  style={{
                    width: '100%',
                    padding: 16,
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  📷 Escanear código QR
                </button>
                {cameraError && (
                  <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                    {cameraError}
                  </p>
                )}
              </div>
            )}

            {/* Separador */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              margin: '20px 0',
              gap: 12
            }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ color: '#94a3b8', fontSize: 13 }}>o ingresa manualmente</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            {/* Entrada manual */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#000' }}>
                Código de reserva
              </label>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ej: res1764619401658n2h7"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 14,
                  marginBottom: 12,
                  boxSizing: 'border-box'
                }}
              />
              <button
                onClick={handleManualVerify}
                disabled={processing}
                style={{
                  width: '100%',
                  padding: 12,
                  background: processing ? '#94a3b8' : '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              >
                {processing ? 'Verificando...' : '🔍 Verificar reserva'}
              </button>
            </div>

            {error && (
              <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
                ⚠️ {error}
              </p>
            )}
          </>
        ) : (
          /* Resultado del escaneo */
          <div>
            <div style={{
              textAlign: 'center',
              marginBottom: 20
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>
                {result.success ? '✅' : '❌'}
              </div>
              <h3 style={{
                color: result.success ? '#10b981' : '#ef4444',
                margin: '0 0 8px 0'
              }}>
                {result.success ? 'Reserva Válida' : 'Error'}
              </h3>
              <p style={{ color: '#64748b', margin: 0 }}>{result.message}</p>
            </div>

            {result.success && result.reservation && (
              <div style={{
                background: '#f0f9ff',
                padding: 16,
                borderRadius: 8,
                marginBottom: 20
              }}>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>ID:</strong> {result.reservation.id}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>Parqueo:</strong> {result.reservation.parkingId}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>Espacio:</strong> #{result.reservation.spotNumber}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>Fecha:</strong> {new Date(result.reservation.startTime).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>Hora:</strong> {new Date(result.reservation.startTime).toLocaleTimeString()} - {new Date(result.reservation.endTime).toLocaleTimeString()}
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: '#000' }}>
                  <strong>Estado:</strong>{' '}
                  <span style={{
                    color: result.reservation.status === 'confirmed' ? '#10b981' : 
                           result.reservation.status === 'checked_in' ? '#3b82f6' : '#64748b'
                  }}>
                    {result.reservation.status === 'confirmed' ? 'Confirmada' :
                     result.reservation.status === 'checked_in' ? 'En uso' :
                     result.reservation.status === 'completed' ? 'Completada' : result.reservation.status}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: '#10b981', fontWeight: 600 }}>
                  <strong>Total:</strong> RD${result.reservation.amount?.toFixed(2) || '0.00'}
                </div>
              </div>
            )}

            {/* Botones de acción */}
            {result.success && result.reservation && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                {result.reservation.status === 'confirmed' && !result.checkedIn && (
                  <button
                    onClick={handleCheckIn}
                    disabled={processing}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Registrar Entrada
                  </button>
                )}
                {(result.reservation.status === 'checked_in' || result.checkedIn) && !result.checkedOut && (
                  <button
                    onClick={handleCheckOut}
                    disabled={processing}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: '#f59e0b',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Registrar Salida
                  </button>
                )}
              </div>
            )}

            {error && (
              <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                ⚠️ {error}
              </p>
            )}

            <button
              onClick={resetScanner}
              style={{
                width: '100%',
                padding: 12,
                background: '#64748b',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Escanear otro código
            </button>
          </div>
        )}
      </div>

      {/* Nota sobre jsQR */}
      <p style={{
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        marginTop: 16,
        textAlign: 'center'
      }}>
        💡 Para escaneo con cámara, usa la entrada manual si no funciona
      </p>
    </div>
  );
}
