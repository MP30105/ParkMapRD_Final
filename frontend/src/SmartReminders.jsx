import React, { useState, useEffect } from 'react';
import { useToast } from './ToastProvider';
import { apiGet, apiPost, apiPut, attachAuth } from './api';
import './SmartReminders.css';

const SmartReminders = ({ token }) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('preferences');
  const [preferences, setPreferences] = useState({
    emailEnabled: true,
    pushEnabled: true,
    smsEnabled: false,
    reminderTimes: [15, 5],
    autoExtendEnabled: false,
    autoExtendDuration: 30,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    timezone: 'America/Santo_Domingo'
  });
  const [reminders, setReminders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fetch preferences
  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/reminders/preferences', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (err) {
      setError('Error al cargar preferencias de recordatorios');
      console.error('Error fetching preferences:', err);
    }
  };

  // Fetch active reminders
  const fetchReminders = async () => {
    try {
      const response = await fetch('/api/reminders', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReminders(data);
      }
    } catch (err) {
      setError('Error al cargar recordatorios activos');
      console.error('Error fetching reminders:', err);
    }
  };

  // Fetch reminder history
  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/reminders/history', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      setError('Error al cargar historial de recordatorios');
      console.error('Error fetching history:', err);
    }
  };

  // Save preferences
  const savePreferences = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/reminders/preferences', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preferences)
      });
      
      if (response.ok) {
        setError(null);
        // Show success message
        showToast('success', '✅ Preferencias guardadas correctamente');
      } else {
        setError('Error al guardar preferencias');
        showToast('error', 'Error al guardar preferencias');
      }
    } catch (err) {
      setError('Error de conexión al guardar preferencias');
      console.error('Error saving preferences:', err);
      showToast('error', 'Error de conexión al guardar preferencias');
    } finally {
      setSaving(false);
    }
  };

  // Cancel reminder
  const cancelReminder = async (reminderId) => {
    try {
      const response = await fetch(`/api/reminders/${reminderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setReminders(prev => prev.filter(r => r.id !== reminderId));
      } else {
        setError('Error al cancelar recordatorio');
      }
    } catch (err) {
      setError('Error de conexión al cancelar recordatorio');
      console.error('Error cancelling reminder:', err);
    }
  };

  // Process pending reminders (demo function)
  const processReminders = async () => {
    try {
      const response = await fetch('/api/reminders/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        showToast('success', `${data.processedCount} recordatorios procesados`);
        fetchReminders(); // Refresh
        fetchHistory(); // Refresh
      }
    } catch (err) {
      setError('Error al procesar recordatorios');
      console.error('Error processing reminders:', err);
      showToast('error', 'Error al procesar recordatorios');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchPreferences(),
        fetchReminders(),
        fetchHistory()
      ]);
      setLoading(false);
    };
    
    if (token) {
      loadData();
    }
  }, [token]);

  const formatTime = (timestamp) => {
    return new Date(parseInt(timestamp)).toLocaleString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeUntilReminder = (scheduledFor) => {
    const now = Date.now();
    const scheduled = parseInt(scheduledFor);
    const diff = scheduled - now;
    
    if (diff < 0) return 'Vencido';
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `En ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `En ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `En ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'Ahora';
  };

  if (loading) {
    return (
      <div className="smart-reminders">
        <div className="loading">Cargando sistema de recordatorios...</div>
      </div>
    );
  }

  return (
    <div className="smart-reminders">
      <div className="reminders-header">
        <h1>Recordatorios Inteligentes</h1>
        <p>Configura notificaciones automáticas para nunca perder el control de tu estacionamiento</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="reminders-tabs">
        <button 
          className={`tab ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
        >
          ⚙️ Preferencias
        </button>
        <button 
          className={`tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          🔔 Activos ({reminders.length})
        </button>
        <button 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Historial
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'preferences' && (
          <PreferencesTab 
            preferences={preferences}
            setPreferences={setPreferences}
            onSave={savePreferences}
            saving={saving}
          />
        )}

        {activeTab === 'active' && (
          <ActiveRemindersTab 
            reminders={reminders}
            onCancel={cancelReminder}
            onProcess={processReminders}
            formatTime={formatTime}
            getTimeUntilReminder={getTimeUntilReminder}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab 
            history={history}
            formatTime={formatTime}
          />
        )}
      </div>
    </div>
  );
};

// Preferences Tab Component
const PreferencesTab = ({ preferences, setPreferences, onSave, saving }) => {
  const updatePreference = (key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const updateReminderTimes = (index, value) => {
    const newTimes = [...preferences.reminderTimes];
    newTimes[index] = parseInt(value);
    setPreferences(prev => ({ ...prev, reminderTimes: newTimes }));
  };

  const addReminderTime = () => {
    const newTime = 10; // Default 10 minutes
    setPreferences(prev => ({ 
      ...prev, 
      reminderTimes: [...prev.reminderTimes, newTime].sort((a, b) => b - a)
    }));
  };

  const removeReminderTime = (index) => {
    setPreferences(prev => ({ 
      ...prev, 
      reminderTimes: prev.reminderTimes.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="preferences-tab">
      <div className="preference-section">
        <h3>Canales de Notificación</h3>
        <div className="preference-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.emailEnabled}
              onChange={(e) => updatePreference('emailEnabled', e.target.checked)}
            />
            <span className="checkmark"></span>
            📧 Notificaciones por Email
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.pushEnabled}
              onChange={(e) => updatePreference('pushEnabled', e.target.checked)}
            />
            <span className="checkmark"></span>
            🔔 Notificaciones Push
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.smsEnabled}
              onChange={(e) => updatePreference('smsEnabled', e.target.checked)}
            />
            <span className="checkmark"></span>
            📱 Mensajes SMS (Premium)
          </label>
        </div>
      </div>

      <div className="preference-section">
        <h3>Tiempos de Recordatorio</h3>
        <p className="section-description">
          Configura cuántos minutos antes de la expiración quieres recibir notificaciones
        </p>
        <div className="reminder-times">
          {preferences.reminderTimes.map((minutes, index) => (
            <div key={index} className="reminder-time-item">
              <input
                type="number"
                value={minutes}
                onChange={(e) => updateReminderTimes(index, e.target.value)}
                min="1"
                max="120"
              />
              <span>minutos antes</span>
              {preferences.reminderTimes.length > 1 && (
                <button 
                  className="remove-time-btn"
                  onClick={() => removeReminderTime(index)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button className="add-time-btn" onClick={addReminderTime}>
            + Agregar tiempo
          </button>
        </div>
      </div>

      <div className="preference-section">
        <h3>Extensión Automática</h3>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={preferences.autoExtendEnabled}
            onChange={(e) => updatePreference('autoExtendEnabled', e.target.checked)}
          />
          <span className="checkmark"></span>
          Extender automáticamente cuando esté por expirar
        </label>
        
        {preferences.autoExtendEnabled && (
          <div className="auto-extend-config">
            <label>
              Duración de extensión:
              <select
                value={preferences.autoExtendDuration}
                onChange={(e) => updatePreference('autoExtendDuration', parseInt(e.target.value))}
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
                <option value={120}>2 horas</option>
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="preference-section">
        <h3>Horario Silencioso</h3>
        <p className="section-description">
          No recibir notificaciones durante estas horas
        </p>
        <div className="quiet-hours">
          <label>
            Desde:
            <input
              type="time"
              value={preferences.quietHoursStart}
              onChange={(e) => updatePreference('quietHoursStart', e.target.value)}
            />
          </label>
          <label>
            Hasta:
            <input
              type="time"
              value={preferences.quietHoursEnd}
              onChange={(e) => updatePreference('quietHoursEnd', e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="preference-section">
        <h3>Zona Horaria</h3>
        <select
          value={preferences.timezone}
          onChange={(e) => updatePreference('timezone', e.target.value)}
        >
          <option value="America/Santo_Domingo">República Dominicana (GMT-4)</option>
          <option value="America/New_York">Nueva York (GMT-5)</option>
          <option value="America/Chicago">Chicago (GMT-6)</option>
          <option value="America/Los_Angeles">Los Ángeles (GMT-8)</option>
        </select>
      </div>

      <div className="save-preferences">
        <button 
          className="save-btn"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Guardando...' : '💾 Guardar Preferencias'}
        </button>
      </div>
    </div>
  );
};

// Active Reminders Tab Component
const ActiveRemindersTab = ({ reminders, onCancel, onProcess, formatTime, getTimeUntilReminder }) => {
  return (
    <div className="active-reminders-tab">
      <div className="tab-header">
        <h3>Recordatorios Activos</h3>
        <button className="process-btn" onClick={onProcess}>
          ⚡ Procesar Pendientes
        </button>
      </div>

      {reminders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <h4>No hay recordatorios activos</h4>
          <p>Los recordatorios se crean automáticamente cuando compras o reservas un ticket de estacionamiento.</p>
        </div>
      ) : (
        <div className="reminders-list">
          {reminders.map(reminder => (
            <div key={reminder.id} className="reminder-card">
              <div className="reminder-header">
                <div className="reminder-info">
                  <h4>{reminder.parkingName || 'Estacionamiento'}</h4>
                  <p className="reminder-address">{reminder.parkingAddress}</p>
                </div>
                <div className="reminder-status">
                  <span className={`status-badge ${reminder.status}`}>
                    {reminder.status === 'pending' ? 'Pendiente' : reminder.status}
                  </span>
                </div>
              </div>
              
              <div className="reminder-details">
                <div className="detail-item">
                  <span className="label">Tipo:</span>
                  <span className="value">
                    {reminder.channel === 'push' ? '🔔 Push' : 
                     reminder.channel === 'email' ? '📧 Email' : 
                     '📱 SMS'}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Programado para:</span>
                  <span className="value">{formatTime(reminder.scheduledFor)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Tiempo restante:</span>
                  <span className="value time-until">
                    {getTimeUntilReminder(reminder.scheduledFor)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Mensaje:</span>
                  <span className="value message">{reminder.message}</span>
                </div>
              </div>
              
              <div className="reminder-actions">
                <button 
                  className="cancel-btn"
                  onClick={() => onCancel(reminder.id)}
                  title="Cancelar recordatorio"
                >
                  🗑️ Cancelar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// History Tab Component
const HistoryTab = ({ history, formatTime }) => {
  return (
    <div className="history-tab">
      <h3>Historial de Recordatorios</h3>
      
      {history.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <h4>Sin historial de recordatorios</h4>
          <p>Aquí aparecerán todos los recordatorios que se hayan enviado anteriormente.</p>
        </div>
      ) : (
        <div className="history-list">
          {history.map(item => (
            <div key={item.id} className="history-item">
              <div className="history-icon">
                {item.channel === 'push' ? '🔔' : 
                 item.channel === 'email' ? '📧' : 
                 '📱'}
              </div>
              <div className="history-content">
                <div className="history-main">
                  <span className="parking-name">{item.parkingName || 'Estacionamiento'}</span>
                  <span className="history-type">{item.reminderType}</span>
                </div>
                <div className="history-details">
                  <span className="sent-time">{formatTime(item.sentAt)}</span>
                  <span className={`success-status ${item.success ? 'success' : 'failed'}`}>
                    {item.success ? '✅ Enviado' : '❌ Falló'}
                  </span>
                </div>
                {item.errorMessage && (
                  <div className="error-details">
                    Error: {item.errorMessage}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartReminders;