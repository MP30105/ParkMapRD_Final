import React, { useState, useEffect } from 'react';

export default function Onboarding({ token, user, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!token) return;
    
    fetch('http://localhost:5000/api/parkmaprd/users/me/onboarding', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setProgress(data);
        if (data.completed) {
          onComplete && onComplete();
        } else {
          setCurrentStep(data.step || 0);
        }
      })
      .catch(console.error);
  }, [token]);

  const steps = [
    {
      title: '¡Bienvenido a PARKMAPRD! 🚗',
      description: 'La forma más fácil de encontrar y pagar parqueo en República Dominicana',
      icon: '👋',
      tip: 'Usa el mapa para explorar parqueos disponibles en tiempo real'
    },
    {
      title: 'Busca parqueos cercanos 📍',
      description: 'Activa tu ubicación para ver los parqueos más cercanos a ti',
      icon: '🗺️',
      tip: 'Puedes filtrar por disponibilidad y ordenar por distancia'
    },
    {
      title: 'Reserva con anticipación 📅',
      description: 'Reserva tu spot hasta con 24 horas de anticipación',
      icon: '⏰',
      tip: 'Recibirás recordatorios 1 hora antes de tu reserva'
    },
    {
      title: 'Extiende tu tiempo ⏱️',
      description: 'Si necesitas más tiempo, extiende tu parqueo desde la app',
      icon: '🔄',
      tip: 'Te alertamos 5 minutos antes de que venza tu tiempo'
    },
    {
      title: 'Favoritos y lugares frecuentes ⭐',
      description: 'Guarda tus parqueos favoritos para acceso rápido',
      icon: '💾',
      tip: 'Marca lugares como Casa, Trabajo o Gym'
    },
    {
      title: '¡Todo listo! 🎉',
      description: 'Ya puedes empezar a usar PARKMAPRD',
      icon: '✅',
      tip: 'Presiona "Comenzar" para explorar'
    }
  ];

  const nextStep = async () => {
    const newStep = currentStep + 1;
    setCurrentStep(newStep);

    if (newStep >= steps.length) {
      // Mark as completed
      try {
        await fetch('http://localhost:5000/api/parkmaprd/users/me/onboarding', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ step: newStep, completed: true })
        });
        onComplete && onComplete();
      } catch (e) {
        console.error('Error updating onboarding:', e);
      }
    } else {
      // Save progress
      try {
        await fetch('http://localhost:5000/api/parkmaprd/users/me/onboarding', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ step: newStep, completed: false })
        });
      } catch (e) {
        console.error('Error saving progress:', e);
      }
    }
  };

  const skip = async () => {
    try {
      await fetch('http://localhost:5000/api/parkmaprd/users/me/onboarding', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ step: steps.length, completed: true })
      });
      onComplete && onComplete();
    } catch (e) {
      console.error('Error skipping onboarding:', e);
    }
  };

  if (!progress || progress.completed) return null;

  const step = steps[currentStep];
  const progressPercent = ((currentStep + 1) / steps.length) * 100;

  return (
    <div style={{
      position:'fixed',
      top:0,
      left:0,
      right:0,
      bottom:0,
      background:'rgba(0,0,0,0.9)',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      zIndex:99999
    }}>
      <div style={{
        background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding:32,
        borderRadius:16,
        maxWidth:500,
        width:'90%',
        color:'white',
        position:'relative'
      }}>
        <button 
          onClick={skip}
          style={{
            position:'absolute',
            top:16,
            right:16,
            background:'rgba(255,255,255,0.2)',
            border:'none',
            color:'white',
            padding:'6px 12px',
            borderRadius:6,
            fontSize:12,
            cursor:'pointer'
          }}
        >
          Saltar
        </button>

        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:64,marginBottom:16}}>{step.icon}</div>
          <h2 style={{margin:'0 0 12px 0',fontSize:24}}>{step.title}</h2>
          <p style={{fontSize:16,opacity:0.9,margin:0}}>{step.description}</p>
        </div>

        <div style={{
          background:'rgba(255,255,255,0.2)',
          padding:16,
          borderRadius:8,
          marginBottom:24
        }}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>💡 Tip</div>
          <div style={{fontSize:14,opacity:0.95}}>{step.tip}</div>
        </div>

        <div style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:12}}>
            <span>Progreso</span>
            <span>{currentStep + 1} de {steps.length}</span>
          </div>
          <div style={{background:'rgba(255,255,255,0.3)',height:6,borderRadius:3,overflow:'hidden'}}>
            <div style={{
              background:'white',
              height:'100%',
              width:`${progressPercent}%`,
              transition:'width 0.3s ease',
              borderRadius:3
            }}></div>
          </div>
        </div>

        <button 
          onClick={nextStep}
          style={{
            width:'100%',
            padding:14,
            background:'white',
            color:'#667eea',
            border:'none',
            borderRadius:8,
            fontSize:16,
            fontWeight:700,
            cursor:'pointer'
          }}
        >
          {currentStep === steps.length - 1 ? '🚀 Comenzar' : 'Siguiente →'}
        </button>
      </div>
    </div>
  );
}

