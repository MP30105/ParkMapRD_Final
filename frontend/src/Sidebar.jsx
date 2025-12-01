import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';

export default function Sidebar({ parkings = [], selectedParking, setSelectedParking }) {
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parkings;
    return parkings.filter(p => p.name.toLowerCase().includes(q) || (p.id && p.id.toLowerCase().includes(q)));
  }, [parkings, query]);

  const handleKeyNav = useCallback((e) => {
    if (!['ArrowDown','ArrowUp','Enter'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') setFocusIndex(i => Math.min(i + 1, filtered.length - 1));
    if (e.key === 'ArrowUp') setFocusIndex(i => Math.max(i - 1, 0));
    if (e.key === 'Enter' && focusIndex >= 0) {
      setSelectedParking(filtered[focusIndex]);
    }
  }, [filtered, focusIndex, setSelectedParking]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx='${focusIndex}']`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  const availabilityBadge = (p) => {
    const ratio = p.totalSpots ? p.availableSpots / p.totalSpots : 0;
    const pct = Math.round(ratio * 100);
    let cls = 'avail-high';
    if (ratio === 0) cls = 'avail-empty';
    else if (ratio < 0.33) cls = 'avail-low';
    else if (ratio < 0.66) cls = 'avail-mid';
    return <span className={`availability-badge ${cls}`} aria-label={`Disponibles ${p.availableSpots} de ${p.totalSpots} (${pct}%)`}>{pct}%</span>;
  };

  return (
    <aside className="sidebar-panel elevated-card" aria-label="Lista de parqueos">
      <header className="sidebar-header">
        <div className="sidebar-title">Parqueos</div>
        <div className="sidebar-meta" aria-label="Total parqueos">{parkings.length} total</div>
      </header>

      <div className="sidebar-search-group" onKeyDown={handleKeyNav}>
        <input 
          aria-label="Buscar parqueo por nombre o id" 
          className="sidebar-search" 
          value={query} 
          onChange={e=>{ setQuery(e.target.value); setFocusIndex(-1); }} 
          placeholder="🔍 Nombre o ID..." 
        />
        {query && <button className="btn btn--outline" onClick={()=>{setQuery(''); setFocusIndex(-1);}} aria-label="Limpiar búsqueda">✕</button>}
      </div>

      <div className="legend" aria-hidden="false" aria-label="Leyenda disponibilidad">
        <span><span className="legend-dot ld-high" /> Alta</span>
        <span><span className="legend-dot ld-mid" /> Media</span>
        <span><span className="legend-dot ld-low" /> Baja</span>
        <span><span className="legend-dot ld-empty" /> Llena</span>
      </div>

      <div ref={listRef} className="parking-list" role="list" tabIndex={0} onKeyDown={handleKeyNav}>
        {filtered.length === 0 && (
          <div className="empty-state" role="status">No se encontraron parqueos para "{query}"</div>
        )}
        {filtered.map((p, idx) => {
          const selected = selectedParking?.id === p.id;
          return (
            <div
              key={p.id}
              data-idx={idx}
              role="listitem"
              className={`parking-card ${selected ? 'selected' : ''} ${focusIndex === idx ? 'focused' : ''}`}
              onClick={()=> setSelectedParking(p)}
              onMouseEnter={()=> setFocusIndex(idx)}
              onMouseLeave={()=> setFocusIndex(-1)}
              tabIndex={-1}
            >
              <div className="pc-primary">
                <div className="pc-name" title={p.name}>{p.name}</div>
                <div className="pc-spots">{p.availableSpots} / {p.totalSpots} libres {availabilityBadge(p)}</div>
              </div>
              <div className="pc-meta">
                <div className="pc-id" title={p.id}>{p.id}</div>
                <div className="pc-lat">Lat {p.lat.toFixed(4)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
