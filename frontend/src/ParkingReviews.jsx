import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';

export default function ParkingReviews({ parkingId, token }) {
  const { showToast } = useToast();
  const [reviews, setReviews] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [securityRating, setSecurityRating] = useState(5);
  const [cleanlinessRating, setCleanlinessRating] = useState(5);
  const [accessibilityRating, setAccessibilityRating] = useState(5);

  useEffect(() => {
    fetchReviews();
  }, [parkingId]);

  const fetchReviews = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/parkmaprd/parkings/${parkingId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data);
      }
    } catch (e) {
      console.error('Error fetching reviews:', e);
    }
  };

  const submitReview = async () => {
    if (!token) return showToast('info', 'Inicia sesión para dejar una reseña');

    try {
      const res = await fetch(`http://localhost:5000/api/parkmaprd/parkings/${parkingId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rating,
          comment,
          securityRating,
          cleanlinessRating,
          accessibilityRating
        })
      });

      if (res.ok) {
        showToast('success', '✅ Reseña publicada');
        setShowForm(false);
        setComment('');
        fetchReviews();
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Error al publicar reseña');
      }
    } catch (e) {
      showToast('error', 'Error de conexión');
    }
  };

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const RatingStars = ({ value, onChange, readOnly }) => (
    <div style={{display:'flex',gap:4}}>
      {[1,2,3,4,5].map(star => (
        <span 
          key={star}
          onClick={() => !readOnly && onChange && onChange(star)}
          style={{
            fontSize:readOnly ? 16 : 24,
            cursor: readOnly ? 'default' : 'pointer',
            color: star <= value ? '#fbbf24' : '#cbd5e1'
          }}
        >
          ⭐
        </span>
      ))}
    </div>
  );

  return (
    <div style={{marginTop:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div>
          <div style={{fontSize:16,fontWeight:600}}>Reseñas ({reviews.length})</div>
          {reviews.length > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
              <RatingStars value={Math.round(averageRating)} readOnly />
              <span style={{fontSize:14,fontWeight:600}}>{averageRating}</span>
            </div>
          )}
        </div>
        {token && !showForm && (
          <button 
            onClick={() => setShowForm(true)}
            style={{padding:'6px 12px',background:'#06b6d4',color:'white',border:'none',borderRadius:6,fontSize:13,cursor:'pointer'}}
          >
            ✍️ Escribir reseña
          </button>
        )}
      </div>

      {showForm && (
        <div style={{background:'#f8fafc',padding:16,borderRadius:8,marginBottom:16}}>
          <div style={{marginBottom:12}}>
            <label style={{display:'block',fontSize:13,fontWeight:500,marginBottom:6}}>Calificación general</label>
            <RatingStars value={rating} onChange={setRating} />
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
            <div>
              <label style={{display:'block',fontSize:11,marginBottom:4}}>🛡️ Seguridad</label>
              <RatingStars value={securityRating} onChange={setSecurityRating} />
            </div>
            <div>
              <label style={{display:'block',fontSize:11,marginBottom:4}}>✨ Limpieza</label>
              <RatingStars value={cleanlinessRating} onChange={setCleanlinessRating} />
            </div>
            <div>
              <label style={{display:'block',fontSize:11,marginBottom:4}}>♿ Accesibilidad</label>
              <RatingStars value={accessibilityRating} onChange={setAccessibilityRating} />
            </div>
          </div>

          <textarea 
            placeholder="Comparte tu experiencia..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{width:'100%',padding:10,borderRadius:6,border:'1px solid #cbd5e1',fontSize:13,minHeight:80,resize:'vertical'}}
          />

          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button 
              onClick={submitReview}
              style={{flex:1,padding:10,background:'#06b6d4',color:'white',border:'none',borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer'}}
            >
              Publicar reseña
            </button>
            <button 
              onClick={() => setShowForm(false)}
              style={{padding:10,background:'#e2e8f0',color:'#475569',border:'none',borderRadius:6,fontSize:13,cursor:'pointer'}}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{maxHeight:300,overflowY:'auto'}}>
        {reviews.map(review => (
          <div key={review.id} style={{padding:12,background:'white',borderRadius:8,marginBottom:8,border:'1px solid #e2e8f0'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:6}}>
              <RatingStars value={review.rating} readOnly />
              <span style={{fontSize:11,color:'#64748b'}}>
                {new Date(review.createdAt).toLocaleDateString()}
              </span>
            </div>
            {review.comment && (
              <p style={{fontSize:13,color:'#334155',margin:'8px 0'}}>{review.comment}</p>
            )}
            <div style={{display:'flex',gap:12,fontSize:11,color:'#64748b',marginTop:8}}>
              <span>🛡️ {review.securityRating}/5</span>
              <span>✨ {review.cleanlinessRating}/5</span>
              <span>♿ {review.accessibilityRating}/5</span>
            </div>
          </div>
        ))}
        {reviews.length === 0 && !showForm && (
          <div style={{textAlign:'center',padding:20,color:'#94a3b8',fontSize:13}}>
            No hay reseñas aún. ¡Sé el primero en dejar una!
          </div>
        )}
      </div>
    </div>
  );
}

