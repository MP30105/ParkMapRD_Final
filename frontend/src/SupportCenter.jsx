import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from './api';

const SupportCenter = ({ token, onClose }) => {
  const [activeTab, setActiveTab] = useState('chat');
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Chat state
  const [chatSession, setChatSession] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Ticket form state
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'general',
    priority: 'medium',
    description: ''
  });
  
  const [showSuccessMessage, setShowSuccessMessage] = useState('');

  useEffect(() => {
    loadCategories();
    if (activeTab === 'tickets') {
      loadTickets();
    }
  }, [activeTab]);

  const loadCategories = async () => {
    try {
      const data = await apiGet('parkmaprd/support/categories');
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await apiGet('parkmaprd/support/tickets', { Authorization: `Bearer ${token}` });
      setTickets(data);
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async () => {
    setIsChatLoading(true);
    try {
      const response = await apiPost('parkmaprd/support/chat/start', {}, { Authorization: `Bearer ${token}` });
      setChatSession(response);
      loadChatMessages(response.sessionId);
    } catch (error) {
      console.error('Error starting chat:', error);
    } finally {
      setIsChatLoading(false);
    }
  };

  const loadChatMessages = async (sessionId) => {
    try {
      const messages = await apiGet(`parkmaprd/support/chat/${sessionId}/messages`, { Authorization: `Bearer ${token}` });
      setChatMessages(messages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendChatMessage = async () => {
    if (!newMessage.trim() || !chatSession) return;
    
    const messageText = newMessage.trim();
    setNewMessage('');
    
    // Add message optimistically
    const tempMessage = {
      id: 'temp_' + Date.now(),
      sessionId: chatSession.sessionId,
      senderId: 'user',
      senderName: 'Tú',
      message: messageText,
      createdAt: Date.now()
    };
    
    setChatMessages(prev => [...prev, tempMessage]);
    
    try {
      await apiPost(`parkmaprd/support/chat/${chatSession.sessionId}/messages`, 
        { message: messageText }, 
        { Authorization: `Bearer ${token}` }
      );
      
      // Reload messages to get bot response
      setTimeout(() => {
        loadChatMessages(chatSession.sessionId);
      }, 3000);
      
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setChatMessages(prev => prev.filter(m => m.id !== tempMessage.id));
    }
  };

  const createTicket = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await apiPost('parkmaprd/support/tickets', ticketForm, { Authorization: `Bearer ${token}` });
      
      setShowSuccessMessage('Ticket creado exitosamente. Te contactaremos pronto.');
      setTicketForm({
        subject: '',
        category: 'general', 
        priority: 'medium',
        description: ''
      });
      
      // Reload tickets
      loadTickets();
      
      setTimeout(() => setShowSuccessMessage(''), 5000);
      
    } catch (error) {
      console.error('Error creating ticket:', error);
      setShowSuccessMessage('Error creando el ticket. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      'open': '#e74c3c',
      'in-progress': '#f39c12', 
      'resolved': '#27ae60',
      'closed': '#95a5a6'
    };
    return colors[status] || '#95a5a6';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'low': '#27ae60',
      'medium': '#f39c12',
      'high': '#e74c3c'
    };
    return colors[priority] || '#f39c12';
  };

  return (
    <div className="support-center" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #3498db, #2980b9)',
          color: 'white'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px' }}>🤖 Asistente ParkMapRD</h2>
            <p style={{ margin: '5px 0 0', opacity: 0.9 }}>¿En qué podemos ayudarte? Chat, soporte y más</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #eee'
        }}>
          {[
            { id: 'chat', label: '💬 Chat en Vivo', desc: 'Respuesta inmediata' },
            { id: 'ticket', label: '🎫 Crear Ticket', desc: 'Problema detallado' },
            { id: 'tickets', label: '📋 Mis Tickets', desc: 'Historial de soporte' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '15px',
                border: 'none',
                background: activeTab === tab.id ? '#f8f9fa' : 'transparent',
                cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '3px solid #3498db' : '3px solid transparent',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{tab.label}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ padding: '20px', height: '500px', overflow: 'auto' }}>
          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div>
              {!chatSession ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px' }}>💬</div>
                  <h3>Chat en Vivo</h3>
                  <p style={{ color: '#666', marginBottom: '30px' }}>
                    Inicia una conversación con nuestro asistente virtual para obtener ayuda inmediata.
                  </p>
                  <button
                    onClick={startChat}
                    disabled={isChatLoading}
                    style={{
                      background: '#3498db',
                      color: 'white',
                      border: 'none',
                      padding: '12px 30px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    {isChatLoading ? 'Iniciando...' : 'Iniciar Chat'}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Chat Messages */}
                  <div style={{
                    height: '350px',
                    overflowY: 'auto',
                    border: '1px solid #eee',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '15px',
                    backgroundColor: '#f8f9fa'
                  }}>
                    {chatMessages.map(msg => (
                      <div
                        key={msg.id}
                        style={{
                          marginBottom: '15px',
                          display: 'flex',
                          justifyContent: msg.senderId === 'system' || msg.senderId === 'bot' ? 'flex-start' : 'flex-end'
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            padding: '10px 15px',
                            borderRadius: '18px',
                            backgroundColor: msg.senderId === 'system' || msg.senderId === 'bot' ? '#e3f2fd' : '#3498db',
                            color: msg.senderId === 'system' || msg.senderId === 'bot' ? '#333' : 'white',
                            wordWrap: 'break-word'
                          }}
                        >
                          <div style={{ fontSize: '14px' }}>{msg.message}</div>
                          <div style={{
                            fontSize: '11px',
                            opacity: 0.8,
                            marginTop: '5px',
                            textAlign: 'right'
                          }}>
                            {formatDate(msg.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Message Input */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Escribe tu mensaje..."
                      style={{
                        flex: 1,
                        padding: '10px 15px',
                        border: '1px solid #ddd',
                        borderRadius: '25px',
                        outline: 'none'
                      }}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!newMessage.trim()}
                      style={{
                        background: '#3498db',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '25px',
                        cursor: 'pointer'
                      }}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Create Ticket Tab */}
          {activeTab === 'ticket' && (
            <div>
              <h3>Crear Ticket de Soporte</h3>
              
              {showSuccessMessage && (
                <div style={{
                  padding: '10px 15px',
                  backgroundColor: showSuccessMessage.includes('Error') ? '#f8d7da' : '#d4edda',
                  color: showSuccessMessage.includes('Error') ? '#721c24' : '#155724',
                  borderRadius: '6px',
                  marginBottom: '20px'
                }}>
                  {showSuccessMessage}
                </div>
              )}
              
              <form onSubmit={createTicket}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Asunto *
                  </label>
                  <input
                    type="text"
                    required
                    value={ticketForm.subject}
                    onChange={(e) => setTicketForm({...ticketForm, subject: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                    placeholder="Describe brevemente tu problema"
                  />
                </div>

                <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Categoría
                    </label>
                    <select
                      value={ticketForm.category}
                      onChange={(e) => setTicketForm({...ticketForm, category: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '6px'
                      }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                      Prioridad
                    </label>
                    <select
                      value={ticketForm.priority}
                      onChange={(e) => setTicketForm({...ticketForm, priority: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '6px'
                      }}
                    >
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Descripción *
                  </label>
                  <textarea
                    required
                    rows="6"
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm({...ticketForm, description: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                    placeholder="Describe tu problema en detalle..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    padding: '12px 30px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  {loading ? 'Creando...' : 'Crear Ticket'}
                </button>
              </form>
            </div>
          )}

          {/* My Tickets Tab */}
          {activeTab === 'tickets' && (
            <div>
              <h3>Mis Tickets de Soporte</h3>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div>Cargando tickets...</div>
                </div>
              ) : tickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px' }}>📋</div>
                  <p style={{ color: '#666' }}>No tienes tickets de soporte aún.</p>
                </div>
              ) : (
                <div>
                  {tickets.map(ticket => (
                    <div
                      key={ticket.id}
                      style={{
                        border: '1px solid #eee',
                        borderRadius: '8px',
                        padding: '15px',
                        marginBottom: '15px',
                        backgroundColor: '#f9f9f9'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 5px', fontSize: '16px' }}>{ticket.subject}</h4>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            #{ticket.id} • {formatDate(ticket.createdAt)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span
                            style={{
                              background: getPriorityColor(ticket.priority),
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              textTransform: 'uppercase'
                            }}
                          >
                            {ticket.priority === 'low' ? 'Baja' : ticket.priority === 'medium' ? 'Media' : 'Alta'}
                          </span>
                          <span
                            style={{
                              background: getStatusColor(ticket.status),
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              textTransform: 'uppercase'
                            }}
                          >
                            {ticket.status === 'open' ? 'Abierto' : 
                             ticket.status === 'in-progress' ? 'En Progreso' :
                             ticket.status === 'resolved' ? 'Resuelto' : 'Cerrado'}
                          </span>
                        </div>
                      </div>
                      
                      <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#555' }}>
                        {ticket.description.length > 150 
                          ? ticket.description.substring(0, 150) + '...'
                          : ticket.description
                        }
                      </p>
                      
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        Categoría: {categories.find(c => c.id === ticket.category)?.name || ticket.category}
                        {ticket.messageCount > 0 && (
                          <span style={{ marginLeft: '15px' }}>
                            💬 {ticket.messageCount} mensajes
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportCenter;