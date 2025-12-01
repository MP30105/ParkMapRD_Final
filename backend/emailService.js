const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter configuration (disabled for development)
// transporter.verify((error, success) => {
//   if (error) {
//     console.error('❌ Email transporter error:', error.message);
//   } else {
//     console.log('✅ Email server ready');
//   }
// });

// Generate verification token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Send verification email
async function sendVerificationEmail(email, token, username) {
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Parkmaprd <noreply@parkmaprd.com>',
    to: email,
    subject: 'Verifica tu cuenta de Parkmaprd',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">¡Bienvenido a Parkmaprd, ${username}!</h2>
        <p>Gracias por registrarte. Por favor verifica tu correo electrónico haciendo clic en el siguiente enlace:</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Verificar Correo
        </a>
        <p>O copia y pega este enlace en tu navegador:</p>
        <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          Si no creaste esta cuenta, puedes ignorar este correo.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// Send password reset email
async function sendPasswordResetEmail(email, token, username) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Parkmaprd <noreply@parkmaprd.com>',
    to: email,
    subject: 'Recuperación de contraseña - Parkmaprd',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF5722;">Recuperación de Contraseña</h2>
        <p>Hola ${username},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace para crear una nueva:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #FF5722; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Restablecer Contraseña
        </a>
        <p>O copia y pega este enlace en tu navegador:</p>
        <p style="color: #666; word-break: break-all;">${resetUrl}</p>
        <p style="color: #e74c3c; margin-top: 20px;">
          <strong>Este enlace expira en 1 hora.</strong>
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          Si no solicitaste este cambio, ignora este correo. Tu contraseña permanecerá sin cambios.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// Send payment receipt
async function sendPaymentReceipt(email, username, ticketInfo, paymentInfo) {
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Parkmaprd <noreply@parkmaprd.com>',
    to: email,
    subject: `Recibo de Pago - ${ticketInfo.parkingName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2196F3;">Recibo de Pago</h2>
        <p>Hola ${username},</p>
        <p>Gracias por tu pago. Aquí están los detalles:</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0;"><strong>Estacionamiento:</strong></td>
              <td style="text-align: right;">${ticketInfo.parkingName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Zona:</strong></td>
              <td style="text-align: right;">${ticketInfo.zone}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Espacio:</strong></td>
              <td style="text-align: right;">#${ticketInfo.spotNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Duración:</strong></td>
              <td style="text-align: right;">${ticketInfo.duration}</td>
            </tr>
            <tr style="border-top: 2px solid #ddd;">
              <td style="padding: 8px 0; font-size: 18px;"><strong>Total:</strong></td>
              <td style="text-align: right; font-size: 18px; color: #4CAF50;"><strong>RD$${paymentInfo.amount.toFixed(2)}</strong></td>
            </tr>
          </table>
        </div>
        <p style="color: #666;">
          ID de Transacción: ${paymentInfo.transactionId}
        </p>
        <p style="color: #666;">
          Fecha: ${new Date(paymentInfo.createdAt).toLocaleString('es-DO')}
        </p>
        <p style="color: #999; font-size: 12px; margin-top: 40px;">
          Guarda este correo como comprobante de pago.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPaymentReceipt,
};
