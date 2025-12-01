import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function TicketQR({ ticket }) {
  if (!ticket) return null;
  // El QR puede contener el id del ticket y un hash simple para validación
  const qrData = JSON.stringify({
    id: ticket.id,
    parkingId: ticket.parkingId,
    userId: ticket.userId,
    spotNumber: ticket.spotNumber,
    startTime: ticket.startTime,
    endTime: ticket.endTime
  });
  return (
    <div style={{ textAlign: 'center', margin: '24px 0' }}>
      <h4>Tu código QR de reserva</h4>
      <QRCodeCanvas value={qrData} size={180} />
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Presenta este código al asistente para registrar tu entrada/salida.
      </p>
    </div>
  );
}
