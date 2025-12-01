import React, { useState } from 'react';
import QrReader from 'react-qr-reader';
import { useToast } from './ToastProvider';
import api from './api';

export default function AssistantQRVerifier({ token }) {
  const [scanResult, setScanResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const { showToast } = useToast();

  const handleScan = async (data) => {
    if (data && !verifying) {
      setVerifying(true);
      try {
        const qrData = JSON.parse(data);
        // Llamar al backend para verificar el ticket
        const res = await api.post('/api/parkmaprd/tickets/verify', {
          ticketId: qrData.id,
          parkingId: qrData.parkingId,
          userId: qrData.userId,
          spotNumber: qrData.spotNumber
        }, { headers: { Authorization: `Bearer ${token}` } });
        setScanResult(res.data);
        showToast('success', 'Reserva verificada correctamente');
      } catch (e) {
        setScanResult({ error: e.message || 'Error al verificar QR' });
        showToast('error', 'QR inválido o reserva no encontrada');
      }
      setVerifying(false);
    }
  };

  const handleError = (err) => {
    showToast('error', 'Error al escanear QR');
  };

  return (
    <div style={{ maxWidth: 340, margin: '0 auto', padding: 24 }}>
      <h3>Escanear QR de Reserva</h3>
      <QrReader
        delay={300}
        onError={handleError}
        onScan={handleScan}
        style={{ width: '100%' }}
      />
      {scanResult && (
        <div style={{ marginTop: 16 }}>
          {scanResult.error ? (
            <div style={{ color: 'red' }}>Error: {scanResult.error}</div>
          ) : (
            <div style={{ color: 'green' }}>Reserva válida para el usuario {scanResult.userId}</div>
          )}
        </div>
      )}
    </div>
  );
}
