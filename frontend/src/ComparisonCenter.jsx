import React, { useState, useEffect } from 'react';
import ParkingRating from './ParkingRating';
import { apiGet, apiPost, apiDelete, attachAuth } from './api';
import './ComparisonCenter.css';

const ComparisonCenter = ({ token }) => {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch comparison lists
  const fetchLists = async () => {
    try {
      const response = await fetch('/api/comparison/lists', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setLists(data);
      } else {
        setError('Failed to fetch comparison lists');
      }
    } catch (err) {
      setError('Network error while fetching lists');
      console.error('Error fetching lists:', err);
    } finally {
      setLoading(false);
    }
  };

  // Create new comparison list
  const createList = async () => {
    if (!newListName.trim()) return;
    
    try {
      const response = await fetch('/api/comparison/lists', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newListName,
          description: newListDescription
        })
      });
      
      if (response.ok) {
        const newList = await response.json();
        setLists(prev => [newList, ...prev]);
        setNewListName('');
        setNewListDescription('');
        setShowCreateForm(false);
        setSelectedList(newList.id);
      } else {
        setError('Failed to create comparison list');
      }
    } catch (err) {
      setError('Network error while creating list');
      console.error('Error creating list:', err);
    }
  };

  // Delete comparison list
  const deleteList = async (listId) => {
    if (!confirm('¿Está seguro de que desea eliminar esta lista de comparación?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/comparison/lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setLists(prev => prev.filter(list => list.id !== listId));
        if (selectedList === listId) {
          setSelectedList(null);
        }
      } else {
        setError('Failed to delete comparison list');
      }
    } catch (err) {
      setError('Network error while deleting list');
      console.error('Error deleting list:', err);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [token]);

  if (loading) {
    return (
      <div className="comparison-center">
        <div className="loading">Cargando comparaciones...</div>
      </div>
    );
  }

  return (
    <div className="comparison-center">
      <div className="comparison-header">
        <h1>Centro de Comparaciones</h1>
        <p>Compara estacionamientos lado a lado para tomar la mejor decisión</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="comparison-content">
        <div className="lists-sidebar">
          <div className="lists-header">
            <h3>Mis Comparaciones</h3>
            <button 
              className="create-list-btn"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              <span className="icon">+</span>
              Nueva Lista
            </button>
          </div>

          {showCreateForm && (
            <div className="create-form">
              <input
                type="text"
                placeholder="Nombre de la lista"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createList()}
              />
              <textarea
                placeholder="Descripción (opcional)"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                rows={2}
              />
              <div className="form-actions">
                <button onClick={createList} disabled={!newListName.trim()}>
                  Crear
                </button>
                <button onClick={() => setShowCreateForm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div className="lists-container">
            {lists.length === 0 ? (
              <div className="empty-state">
                <p>No hay listas de comparación</p>
                <small>Crea tu primera lista para comenzar</small>
              </div>
            ) : (
              lists.map(list => (
                <div 
                  key={list.id}
                  className={`list-item ${selectedList === list.id ? 'active' : ''}`}
                  onClick={() => setSelectedList(list.id)}
                >
                  <div className="list-info">
                    <h4>{list.name}</h4>
                    {list.description && (
                      <p className="list-description">{list.description}</p>
                    )}
                    <small className="list-date">
                      {new Date(list.created_at).toLocaleDateString()}
                    </small>
                  </div>
                  <button 
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteList(list.id);
                    }}
                    title="Eliminar lista"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="comparison-main">
          {selectedList ? (
            <ComparisonView 
              listId={selectedList} 
              token={token}
              onError={setError}
            />
          ) : (
            <div className="no-selection">
              <div className="placeholder">
                <h3>Selecciona una Lista de Comparación</h3>
                <p>Elige una lista de la barra lateral para ver y editar tu comparación</p>
                <div className="features">
                  <div className="feature">
                    <span className="icon">📊</span>
                    <span>Compara múltiples estacionamientos</span>
                  </div>
                  <div className="feature">
                    <span className="icon">⭐</span>
                    <span>Califica según tus criterios</span>
                  </div>
                  <div className="feature">
                    <span className="icon">🏆</span>
                    <span>Obtén recomendaciones inteligentes</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Component for viewing and managing a specific comparison
const ComparisonView = ({ listId, token, onError }) => {
  const [comparisonData, setComparisonData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddParking, setShowAddParking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  // Fetch comparison data
  const fetchComparisonData = async () => {
    try {
      const [compResponse, analysisResponse] = await Promise.all([
        fetch(`/api/comparison/lists/${listId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`/api/comparison/lists/${listId}/analysis`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);
      
      if (compResponse.ok && analysisResponse.ok) {
        const compData = await compResponse.json();
        const analysisData = await analysisResponse.json();
        setComparisonData(compData);
        setAnalysis(analysisData);
      } else {
        onError('Failed to fetch comparison data');
      }
    } catch (err) {
      onError('Network error while fetching comparison');
      console.error('Error fetching comparison:', err);
    } finally {
      setLoading(false);
    }
  };

  // Search parkings to add
  const searchParkings = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await fetch(`/api/parkings?search=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Filter out parkings already in comparison
        const existingIds = comparisonData?.items?.map(item => item.parkingId) || [];
        const filtered = data.filter(parking => !existingIds.includes(parking.id));
        setSearchResults(filtered);
      }
    } catch (err) {
      console.error('Error searching parkings:', err);
    }
  };

  // Add parking to comparison
  const addParking = async (parkingId) => {
    try {
      const response = await fetch(`/api/comparison/lists/${listId}/items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parkingId })
      });
      
      if (response.ok) {
        fetchComparisonData(); // Refresh data
        setSearchTerm('');
        setSearchResults([]);
        setShowAddParking(false);
      } else {
        onError('Failed to add parking to comparison');
      }
    } catch (err) {
      onError('Network error while adding parking');
      console.error('Error adding parking:', err);
    }
  };

  // Remove parking from comparison
  const removeParking = async (parkingId) => {
    try {
      const response = await fetch(`/api/comparison/lists/${listId}/items/${parkingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        fetchComparisonData(); // Refresh data
      } else {
        onError('Failed to remove parking from comparison');
      }
    } catch (err) {
      onError('Network error while removing parking');
      console.error('Error removing parking:', err);
    }
  };

  // Update parking score
  const updateScore = async (parkingId, criterionId, score) => {
    try {
      const response = await fetch(`/api/comparison/lists/${listId}/scores`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parkingId, criterionId, score })
      });
      
      if (response.ok) {
        fetchComparisonData(); // Refresh data
      } else {
        onError('Failed to update parking score');
      }
    } catch (err) {
      onError('Network error while updating score');
      console.error('Error updating score:', err);
    }
  };

  useEffect(() => {
    if (listId) {
      fetchComparisonData();
    }
  }, [listId, token]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchParkings(searchTerm);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  if (loading) {
    return <div className="loading">Cargando comparación...</div>;
  }

  if (!comparisonData) {
    return <div className="error">No se pudo cargar la comparación</div>;
  }

  return (
    <div className="comparison-view">
      <div className="comparison-view-header">
        <div className="header-info">
          <h2>{comparisonData.name}</h2>
          {comparisonData.description && <p>{comparisonData.description}</p>}
        </div>
        
        <div className="header-actions">
          <div className="view-mode-toggle">
            <button 
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="Vista en tarjetas"
            >
              📋
            </button>
            <button 
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
              title="Vista en tabla"
            >
              📊
            </button>
          </div>
          
          <button 
            className="add-parking-btn"
            onClick={() => setShowAddParking(!showAddParking)}
          >
            + Agregar Estacionamiento
          </button>
        </div>
      </div>

      {showAddParking && (
        <div className="add-parking-panel">
          <div className="search-box">
            <input
              type="text"
              placeholder="Buscar estacionamientos por nombre o dirección..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(parking => (
                <div key={parking.id} className="search-result-item">
                  <div className="parking-info">
                    <h4>{parking.name}</h4>
                    <div style={{ marginTop: '4px' }}>
                      <ParkingRating parkingId={parking.id} size="small" />
                    </div>
                    <p>{parking.address}</p>
                    <small>RD${parking.hourlyRate}/hora</small>
                  </div>
                  <button onClick={() => addParking(parking.id)}>
                    Agregar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {analysis && analysis.completion > 0 && (
        <div className="analysis-summary">
          <div className="completion-bar">
            <div className="bar">
              <div 
                className="fill" 
                style={{ width: `${analysis.completion}%` }}
              ></div>
            </div>
            <span>{analysis.completion}% completado</span>
          </div>
          
          {analysis.bestChoice && (
            <div className="best-choice">
              <span className="icon">🏆</span>
              <strong>Mejor opción:</strong> {analysis.bestChoice.name}
              <small>(Puntuación: {analysis.bestChoice.weightedScore?.toFixed(1)})</small>
            </div>
          )}
        </div>
      )}

      {viewMode === 'grid' ? (
        <ComparisonGrid 
          comparisonData={comparisonData}
          updateScore={updateScore}
          removeParking={removeParking}
        />
      ) : (
        <ComparisonTable 
          comparisonData={comparisonData}
          analysis={analysis}
          updateScore={updateScore}
          removeParking={removeParking}
        />
      )}
    </div>
  );
};

// Grid view component
const ComparisonGrid = ({ comparisonData, updateScore, removeParking }) => {
  if (comparisonData.items.length === 0) {
    return (
      <div className="empty-comparison">
        <h3>Sin estacionamientos para comparar</h3>
        <p>Agrega estacionamientos usando el botón de arriba</p>
      </div>
    );
  }

  return (
    <div className="comparison-grid">
      {comparisonData.items.map(item => (
        <div key={item.parkingId} className="parking-card">
          <div className="card-header">
            <h3>{item.name}</h3>
            <button 
              className="remove-btn"
              onClick={() => removeParking(item.parkingId)}
              title="Remover de la comparación"
            >
              ×
            </button>
          </div>
          
          <div className="parking-details">
            <p className="address">{item.address}</p>
            <p className="price">RD${item.hourlyRate}/hora</p>
            <p className="availability">
              {item.availableSpots} de {item.totalSpots} espacios disponibles
            </p>
          </div>

          {item.amenities && item.amenities.length > 0 && (
            <div className="amenities">
              <h4>Amenidades</h4>
              <div className="amenities-list">
                {item.amenities.slice(0, 4).map(amenity => (
                  <span key={amenity.id} className="amenity-tag">
                    {amenity.icon} {amenity.name}
                  </span>
                ))}
                {item.amenities.length > 4 && (
                  <span className="more-amenities">
                    +{item.amenities.length - 4} más
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="criteria-scores">
            <h4>Calificaciones</h4>
            {comparisonData.criteria.map(criterion => {
              const score = item.scores?.find(s => s.criterionId === criterion.id)?.score || 0;
              return (
                <div key={criterion.id} className="criterion-row">
                  <label>{criterion.name}</label>
                  <div className="score-input">
                    <StarRating 
                      value={score}
                      onChange={(value) => updateScore(item.parkingId, criterion.id, value)}
                    />
                    <small>Peso: {Math.round(criterion.weight * 100)}%</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// Table view component
const ComparisonTable = ({ comparisonData, analysis, updateScore, removeParking }) => {
  if (comparisonData.items.length === 0) {
    return (
      <div className="empty-comparison">
        <h3>Sin estacionamientos para comparar</h3>
        <p>Agrega estacionamientos usando el botón de arriba</p>
      </div>
    );
  }

  return (
    <div className="comparison-table-container">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Estacionamiento</th>
            <th>Precio/Hora</th>
            <th>Disponibilidad</th>
            {comparisonData.criteria.map(criterion => (
              <th key={criterion.id}>
                {criterion.name}
                <small>({Math.round(criterion.weight * 100)}%)</small>
              </th>
            ))}
            <th>Puntuación Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {comparisonData.items.map(item => {
            const ranking = analysis?.rankings?.find(r => r.parkingId === item.parkingId);
            return (
              <tr key={item.parkingId}>
                <td className="parking-name">
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.address}</small>
                  </div>
                </td>
                <td>RD${item.hourlyRate}</td>
                <td>{item.availableSpots}/{item.totalSpots}</td>
                {comparisonData.criteria.map(criterion => {
                  const score = item.scores?.find(s => s.criterionId === criterion.id)?.score || 0;
                  return (
                    <td key={criterion.id}>
                      <StarRating 
                        value={score}
                        onChange={(value) => updateScore(item.parkingId, criterion.id, value)}
                        compact
                      />
                    </td>
                  );
                })}
                <td className="total-score">
                  {ranking?.weightedScore ? (
                    <strong>{ranking.weightedScore.toFixed(1)}</strong>
                  ) : (
                    <span className="no-score">-</span>
                  )}
                </td>
                <td>
                  <button 
                    className="remove-btn-small"
                    onClick={() => removeParking(item.parkingId)}
                    title="Remover"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Star rating component
const StarRating = ({ value, onChange, compact = false }) => {
  const [hovered, setHovered] = useState(0);
  
  return (
    <div className={`star-rating ${compact ? 'compact' : ''}`}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          className={`star ${star <= (hovered || value) ? 'active' : ''}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
        >
          ⭐
        </button>
      ))}
    </div>
  );
};

export default ComparisonCenter;