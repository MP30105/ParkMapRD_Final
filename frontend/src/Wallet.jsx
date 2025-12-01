import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { apiGet, apiPost, attachAuth } from './api';

export default function Wallet({ token }) {
  const { showToast } = useToast();
  const [wallet, setWallet] = useState({ balance: 0 });
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await apiGet('parkmaprd/users/me/wallet', attachAuth(token));
        setWallet(data);
      } catch (e) {
        console.error('Wallet load error', e);
        showToast('error', 'No se pudo cargar tu wallet');
      }
    })();
  }, [token]);

  const handleRecharge = async () => {
    if (rechargeAmount < 50 || rechargeAmount > 2000) {
      return showToast('warning', 'Monto debe estar entre RD$50 y RD$2,000');
    }

    setLoading(true);
    try {
      const data = await apiPost('parkmaprd/users/me/wallet/recharge', { amount: rechargeAmount }, attachAuth(token));
      setWallet(prev => ({ ...prev, balance: data.balance }));
      showToast('success', `✅ Recarga exitosa de RD$${rechargeAmount}`);
      setRechargeAmount(100);
    } catch (e) {
      const msg = /Invalid amount/.test(e.message) ? 'Monto inválido (RD$50-2000)' : (e.message || 'Error al recargar');
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const bonusPercent = rechargeAmount >= 500 ? 10 : rechargeAmount >= 250 ? 5 : 0;
  const bonusAmount = (rechargeAmount * bonusPercent / 100).toFixed(2);
  const totalWithBonus = (parseFloat(rechargeAmount) + parseFloat(bonusAmount)).toFixed(2);

  return (
    <div style={{padding:20}}>
      <h2>💳 Mi Wallet</h2>
      
      <div style={{
        background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding:24,
        borderRadius:16,
        color:'white',
        marginBottom:24,
        boxShadow:'0 8px 24px rgba(102,126,234,0.3)'
      }}>
        <div style={{fontSize:14,opacity:0.9,marginBottom:8}}>Saldo disponible</div>
        <div style={{fontSize:48,fontWeight:700,marginBottom:16}}>
          RD${parseFloat(wallet.balance || 0).toFixed(2)}
        </div>
        <div style={{fontSize:13,opacity:0.8}}>
          Usa tu saldo para pagar parqueo más rápido
        </div>
      </div>

      <div style={{background:'white',padding:20,borderRadius:12,border:'1px solid #e2e8f0',marginBottom:20}}>
        <h3 style={{margin:'0 0 16px 0',color:'#000'}}>🔋 Recargar saldo</h3>
        
        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:14,fontWeight:500,marginBottom:8,color:'#000'}}>Monto a recargar</label>
          <input 
            type="number"
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(Number(e.target.value))}
            min={50}
            max={2000}
            step={50}
            style={{width:'100%',padding:12,borderRadius:8,border:'1px solid #cbd5e1',fontSize:16}}
          />
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:8,marginBottom:16}}>
          {[50, 100, 250, 500].map(amount => (
            <button
              key={amount}
              onClick={() => setRechargeAmount(amount)}
              style={{
                padding:10,
                background: rechargeAmount === amount ? '#06b6d4' : '#f1f5f9',
                color: rechargeAmount === amount ? 'white' : '#334155',
                border:'none',
                borderRadius:6,
                fontSize:14,
                fontWeight:600,
                cursor:'pointer'
              }}
            >
              RD${amount}
            </button>
          ))}
        </div>

        {bonusPercent > 0 && (
          <div style={{background:'#fef3c7',padding:12,borderRadius:8,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,color:'#92400e',marginBottom:4}}>
              🎉 Bonificación del {bonusPercent}%
            </div>
            <div style={{fontSize:12,color:'#78350f'}}>
              Recibirás RD${totalWithBonus} (RD${rechargeAmount} + RD${bonusAmount} bonus)
            </div>
          </div>
        )}

        <button 
          onClick={handleRecharge}
          disabled={loading}
          style={{
            width:'100%',
            padding:14,
            background: loading ? '#94a3b8' : '#06b6d4',
            color:'white',
            border:'none',
            borderRadius:8,
            fontSize:15,
            fontWeight:600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Procesando...' : `💳 Recargar RD$${rechargeAmount}`}
        </button>
      </div>

      <div style={{background:'#f8fafc',padding:16,borderRadius:8}}>
        <h4 style={{margin:'0 0 12px 0',fontSize:15,color:'#000'}}>💡 Beneficios del Wallet</h4>
        <ul style={{margin:0,paddingLeft:20,fontSize:13,color:'#475569'}}>
          <li style={{marginBottom:6}}>Pagos instantáneos sin esperar procesamiento</li>
          <li style={{marginBottom:6}}>Bonificaciones por recargas grandes</li>
          <li style={{marginBottom:6}}>Sin comisiones de servicio</li>
          <li>Historial detallado de transacciones</li>
        </ul>
      </div>
    </div>
  );
}

