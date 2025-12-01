import React, { useState, useEffect } from 'react';
import { apiRootGet, apiRootPost, apiRootPut } from './api';

const AuditDashboard = ({ token, user }) => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [securityEvents, setSecurityEvents] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('logs');
  const [filters, setFilters] = useState({
    eventType: '',
    userId: '',
    limit: 50
  });

  // Check if user is admin
  const isAdmin = user && (user.role === 'admin' || user.role === 'main' || user.username === 'admin');

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin, filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Load audit logs
      const logsParams = new URLSearchParams();
      if (filters.eventType) logsParams.append('eventType', filters.eventType);
      if (filters.userId) logsParams.append('userId', filters.userId);
      logsParams.append('limit', filters.limit.toString());

      try {
        const logsData = await apiRootGet(`admin/audit/audit-logs?${logsParams}`, headers);
        setAuditLogs(logsData.logs || []);
      } catch (_) { /* silent */ }
      try {
        const eventsData = await apiRootGet('admin/audit/security-events', headers);
        setSecurityEvents(eventsData.events || []);
      } catch (_) { /* silent */ }
      try {
        const statsData = await apiRootGet('admin/audit/audit-stats', headers);
        setStats(statsData || {});
      } catch (_) { /* silent */ }

    } catch (err) {
      setError('Failed to load audit data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async (format = 'json') => {
    try {
      const blobData = await apiRootPost('admin/audit/audit-logs/export', { format, filters }, {
        'Authorization': `Bearer ${token}`
      });
      // api helper returns parsed JSON/text; for export we fallback to direct fetch if binary needed
      if (blobData && blobData instanceof Blob) {
        const url = window.URL.createObjectURL(blobData);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${Date.now()}.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        // Fallback: re-fetch as blob directly
        const resp = await fetch('http://localhost:5000/admin/audit/audit-logs/export', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ format, filters })
        });
        if (resp.ok) {
          const blob = await resp.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `audit-logs-${Date.now()}.${format}`;
          a.click();
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      setError('Failed to export logs: ' + err.message);
    }
  };

  const updateSecurityEventStatus = async (eventId, status, notes) => {
    try {
      await apiRootPut(`admin/audit/security-events/${eventId}/investigate`, { status, notes }, { 'Authorization': `Bearer ${token}` });
      loadData();
    } catch (err) {
      setError('Failed to update security event: ' + err.message);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getEventTypeColor = (eventType) => {
    const colors = {
      'user_login': '#4CAF50',
      'admin_login': '#FF9800',
      'failed_login': '#F44336',
      'user_registration': '#2196F3',
      'reservation_created': '#9C27B0',
      'payment_processed': '#00BCD4',
      'system_start': '#795548'
    };
    return colors[eventType] || '#757575';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'low': '#4CAF50',
      'medium': '#FF9800',
      'high': '#F44336',
      'critical': '#9C27B0'
    };
    return colors[severity] || '#757575';
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You need administrator privileges to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Loading audit data...</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1>Audit Dashboard</h1>
      
      {error && (
        <div style={{ 
          padding: 10, 
          marginBottom: 20, 
          backgroundColor: '#ffebee', 
          color: '#c62828', 
          borderRadius: 4,
          border: '1px solid #ef5350'
        }}>
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ 
          flex: 1, 
          minWidth: 200, 
          padding: 15, 
          backgroundColor: '#f5f5f5', 
          borderRadius: 8,
          border: '1px solid #ddd'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Active Sessions</h3>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2196F3' }}>
            {stats.activeSessions || 0}
          </div>
        </div>
        
        <div style={{ 
          flex: 1, 
          minWidth: 200, 
          padding: 15, 
          backgroundColor: '#f5f5f5', 
          borderRadius: 8,
          border: '1px solid #ddd'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Failed Logins (24h)</h3>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#F44336' }}>
            {stats.failedLoginsLast24h || 0}
          </div>
        </div>
        
        <div style={{ 
          flex: 1, 
          minWidth: 200, 
          padding: 15, 
          backgroundColor: '#f5f5f5', 
          borderRadius: 8,
          border: '1px solid #ddd'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Security Events</h3>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#FF9800' }}>
            {securityEvents.length || 0}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ 
        padding: 15, 
        marginBottom: 20, 
        backgroundColor: '#fafafa', 
        borderRadius: 8,
        border: '1px solid #ddd'
      }}>
        <h3 style={{ margin: '0 0 15px 0' }}>Filters</h3>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
          <div>
            <label>Event Type:</label>
            <select 
              value={filters.eventType} 
              onChange={(e) => setFilters({...filters, eventType: e.target.value})}
              style={{ marginLeft: 5, padding: 5 }}
            >
              <option value="">All</option>
              <option value="user_login">User Login</option>
              <option value="admin_login">Admin Login</option>
              <option value="failed_login">Failed Login</option>
              <option value="user_registration">Registration</option>
              <option value="reservation_created">Reservations</option>
              <option value="payment_processed">Payments</option>
            </select>
          </div>
          
          <div>
            <label>User ID:</label>
            <input 
              type="text"
              value={filters.userId} 
              onChange={(e) => setFilters({...filters, userId: e.target.value})}
              placeholder="Filter by user ID"
              style={{ marginLeft: 5, padding: 5 }}
            />
          </div>
          
          <div>
            <label>Limit:</label>
            <select 
              value={filters.limit} 
              onChange={(e) => setFilters({...filters, limit: parseInt(e.target.value)})}
              style={{ marginLeft: 5, padding: 5 }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 20 }}>
        <button 
          onClick={() => setActiveTab('logs')}
          style={{ 
            padding: '10px 20px', 
            marginRight: 10,
            backgroundColor: activeTab === 'logs' ? '#2196F3' : '#f5f5f5',
            color: activeTab === 'logs' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Audit Logs ({auditLogs.length})
        </button>
        
        <button 
          onClick={() => setActiveTab('security')}
          style={{ 
            padding: '10px 20px', 
            marginRight: 10,
            backgroundColor: activeTab === 'security' ? '#2196F3' : '#f5f5f5',
            color: activeTab === 'security' ? 'white' : 'black',
            border: '1px solid #ddd',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Security Events ({securityEvents.length})
        </button>
        
        <button 
          onClick={() => exportLogs('json')}
          style={{ 
            padding: '10px 20px', 
            marginRight: 5,
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Export JSON
        </button>
        
        <button 
          onClick={() => exportLogs('csv')}
          style={{ 
            padding: '10px 20px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'logs' && (
        <div>
          <h2>Audit Logs</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Timestamp</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Event Type</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>User ID</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Action</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Result</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log, index) => (
                  <tr key={index}>
                    <td style={{ padding: 10, border: '1px solid #ddd', fontSize: 12 }}>
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>
                      <span style={{ 
                        padding: '4px 8px',
                        backgroundColor: getEventTypeColor(log.event_type),
                        color: 'white',
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        {log.event_type}
                      </span>
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>{log.user_id || '-'}</td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>{log.action || '-'}</td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>
                      <span style={{ 
                        color: log.result === 'success' ? '#4CAF50' : '#F44336',
                        fontWeight: 'bold'
                      }}>
                        {log.result || '-'}
                      </span>
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>{log.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {auditLogs.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              No audit logs found with current filters.
            </div>
          )}
        </div>
      )}

      {activeTab === 'security' && (
        <div>
          <h2>Security Events</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Timestamp</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Event Type</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Severity</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Status</th>
                  <th style={{ padding: 10, textAlign: 'left', border: '1px solid #ddd' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {securityEvents.map((event, index) => (
                  <tr key={index}>
                    <td style={{ padding: 10, border: '1px solid #ddd', fontSize: 12 }}>
                      {formatTimestamp(event.created_at)}
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>{event.event_type}</td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>
                      <span style={{ 
                        padding: '4px 8px',
                        backgroundColor: getSeverityColor(event.severity),
                        color: 'white',
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        {event.severity}
                      </span>
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>
                      {event.investigation_status || 'pending'}
                    </td>
                    <td style={{ padding: 10, border: '1px solid #ddd' }}>
                      <select 
                        onChange={(e) => {
                          if (e.target.value) {
                            let notes = '';
                            try {
                              notes = window.prompt('Investigation notes (optional):');
                            } catch (err) {
                              console.warn('Prompt bloqueado por el navegador:', err);
                            }
                            updateSecurityEventStatus(event.id, e.target.value, notes);
                          }
                        }}
                        style={{ padding: 5, fontSize: 12 }}
                      >
                        <option value="">Update Status...</option>
                        <option value="investigating">Mark Investigating</option>
                        <option value="resolved">Mark Resolved</option>
                        <option value="false_positive">Mark False Positive</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {securityEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              No security events found.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditDashboard;
