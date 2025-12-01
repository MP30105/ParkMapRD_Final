import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function ReservationQR({ qrData }) {
  if (!qrData) return null;
  return (
    <div style={{ textAlign: 'center', margin: '16px 0' }}>
      <h4>QR de Reserva</h4>
      <QRCodeCanvas value={qrData} size={160} />
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Escanea este código para validar tu reserva.
      </p>
    </div>
  );
}
