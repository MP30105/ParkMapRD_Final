import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from './api';

const ChatWidget = ({ token }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [supportView, setSupportView] = useState('create'); // 'create' | 'list'
  
  // Chat state
  const [chatSession, setChatSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef(null);
  
  // Support state
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    category: 'general',
    priority: 'medium',
    description: ''
  });
  const [showSuccessMessage, setShowSuccessMessage] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const startChat = async () => {
    setIsLoading(true);
    try {
      const response = await apiPost('parkmaprd/support/chat/start', {}, { Authorization: `Bearer ${token}` });
      setChatSession(response);
      
      if (!response.existing) {
        // Add welcome message for new chats
        setMessages([{
          id: 'welcome',
          senderId: 'bot',
          senderName: 'Asistente PARKMAPRD',
          message: '¡Hola! Soy tu asistente de PARKMAPRD. ¿En qué puedo ayudarte hoy?',
          createdAt: Date.now(),
          messageType: 'text'
        }]);
      } else {
        loadMessages(response.sessionId);
      }
    } catch (error) {
      console.error('Error starting chat:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async (sessionId) => {
    try {
      const data = await apiGet(`parkmaprd/support/chat/${sessionId}/messages`, { Authorization: `Bearer ${token}` });
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !chatSession) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    // Add user message optimistically
    const userMessage = {
      id: 'temp_' + Date.now(),
      sessionId: chatSession.sessionId,
      senderId: 'user',
      senderName: 'Tú',
      message: messageText,
      createdAt: Date.now(),
      messageType: 'text'
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      await apiPost(`parkmaprd/support/chat/${chatSession.sessionId}/messages`, 
        { message: messageText }, 
        { Authorization: `Bearer ${token}` }
      );

      // Poll for bot response
      setTimeout(() => {
        loadMessages(chatSession.sessionId);
      }, 2000);

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const toggleWidget = () => {
    if (!isOpen && !chatSession && activeTab === 'chat') {
      startChat();
    }
    setIsOpen(!isOpen);
    setUnreadCount(0);
  };

  const minimizeWidget = () => {
    setIsMinimized(!isMinimized);
  };

  // Support functions
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
    } finally {
      setLoading(false);
    }
  };

  // Load support data when opening widget or switching to soporte tab
  useEffect(() => {
    if (isOpen && activeTab === 'support') {
      loadCategories();
      if (supportView === 'list') {
        loadTickets();
      }
    }
  }, [isOpen, activeTab, supportView]);

  // Simulated new message notification (in real app would come from websockets)
  useEffect(() => {
    if (!isOpen && chatSession && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.senderId === 'bot' || lastMessage.senderId === 'system') {
        setUnreadCount(prev => prev + 1);
      }
    }
  }, [messages, isOpen, chatSession]);

  return (
    <>
      {/* Support Widget */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          right: '20px',
          width: '400px',
          height: isMinimized ? '60px' : '550px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'height 0.3s ease'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #3498db, #2980b9)',
            color: 'white',
            padding: '15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: isMinimized ? 'pointer' : 'default'
          }} onClick={() => isMinimized && minimizeWidget()}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>🤖 Asistente ParkMapRD</div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>
                ¿En qué podemos ayudarte? Chat, soporte y más
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); minimizeWidget(); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '18px',
                  cursor: 'pointer',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isMinimized ? '▲' : '▼'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '18px',
                  cursor: 'pointer',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
                {[
                  { id: 'chat', label: '💬 Chat', desc: 'Respuesta inmediata' },
                  { id: 'support', label: '🛠️ Soporte', desc: 'Tickets y ayuda' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1,
                      padding: '12px 8px',
                      border: 'none',
                      background: activeTab === tab.id ? '#f8f9fa' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: activeTab === tab.id ? '3px solid #3498db' : '3px solid transparent',
                      transition: 'all 0.3s ease',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{tab.label}</div>
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>{tab.desc}</div>
                  </button>
                ))}
              </div>

              {/* Content */}
              <div style={{ flex: 1, padding: '15px', overflowY: 'auto' }}>
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
                          disabled={isLoading}
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
                          {isLoading ? 'Iniciando...' : 'Iniciar Chat'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        {/* Chat Messages */}
                        <div style={{
                          height: '300px',
                          overflowY: 'auto',
                          border: '1px solid #eee',
                          borderRadius: '8px',
                          padding: '15px',
                          marginBottom: '15px',
                          backgroundColor: '#f8f9fa'
                        }}>
                          {messages.map(msg => (
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
                                  maxWidth: '80%',
                                  padding: '8px 12px',
                                  borderRadius: '15px',
                                  backgroundColor: msg.senderId === 'system' || msg.senderId === 'bot' ? '#e3f2fd' : '#3498db',
                                  color: msg.senderId === 'system' || msg.senderId === 'bot' ? '#333' : 'white',
                                  fontSize: '14px'
                                }}
                              >
                                <strong>{msg.senderName}: </strong>
                                {msg.message}
                                <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '5px' }}>
                                  {formatTime(msg.createdAt)}
                                </div>
                              </div>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
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
                            onClick={sendMessage}
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

                {/* Unified Support Center */}
                {activeTab === 'support' && (
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <h3 style={{margin:0}}>Centro de Soporte</h3>
                      <div style={{display:'flex',gap:8}}>
                        <button
                          onClick={() => setSupportView('create')}
                          style={{
                            padding:'6px 10px',border:'1px solid #3498db',background:supportView==='create'?'#3498db':'#fff',color:supportView==='create'?'#fff':'#3498db',borderRadius:4,cursor:'pointer',fontSize:12
                          }}
                        >Nuevo Ticket</button>
                        <button
                          onClick={() => setSupportView('list')}
                          style={{
                            padding:'6px 10px',border:'1px solid #3498db',background:supportView==='list'?'#3498db':'#fff',color:supportView==='list'?'#fff':'#3498db',borderRadius:4,cursor:'pointer',fontSize:12
                          }}
                        >Mis Tickets</button>
                      </div>
                    </div>
                    {supportView==='create' && (
                      <div>
                        {showSuccessMessage && (
                          <div style={{
                            padding: '10px 15px',
                            background: '#d4edda',
                            color: '#155724',
                            border: '1px solid #c3e6cb',
                            borderRadius: '5px',
                            marginBottom: '15px'
                          }}>
                            {showSuccessMessage}
                          </div>
                        )}
                        <form onSubmit={createTicket}>
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display:'block',fontWeight:'bold',marginBottom:4 }}>Asunto *</label>
                            <input type="text" required value={ticketForm.subject} onChange={e=>setTicketForm({...ticketForm,subject:e.target.value})} style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:4}} />
                          </div>
                          <div style={{ display:'flex',gap:10,marginBottom:10 }}>
                            <div style={{flex:1}}>
                              <label style={{ display:'block',fontWeight:'bold',marginBottom:4 }}>Categoría</label>
                              <select value={ticketForm.category} onChange={e=>setTicketForm({...ticketForm,category:e.target.value})} style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:4}}>
                                <option value="general">General</option>
                                <option value="technical">Técnico</option>
                                <option value="payment">Pagos</option>
                                <option value="account">Cuenta</option>
                              </select>
                            </div>
                            <div style={{flex:1}}>
                              <label style={{ display:'block',fontWeight:'bold',marginBottom:4 }}>Prioridad</label>
                              <select value={ticketForm.priority} onChange={e=>setTicketForm({...ticketForm,priority:e.target.value})} style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:4}}>
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="urgent">Urgente</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom:'10px' }}>
                            <label style={{ display:'block',fontWeight:'bold',marginBottom:4 }}>Descripción *</label>
                            <textarea required rows={4} value={ticketForm.description} onChange={e=>setTicketForm({...ticketForm,description:e.target.value})} style={{width:'100%',padding:'8px 10px',border:'1px solid #ddd',borderRadius:4,resize:'vertical'}} />
                          </div>
                          <button type="submit" disabled={loading} style={{background:'#3498db',color:'#fff',border:'none',padding:'10px 18px',borderRadius:5,cursor:loading?'not-allowed':'pointer',width:'100%',fontWeight:'bold'}}>
                            {loading ? 'Creando...' : 'Crear Ticket'}
                          </button>
                        </form>
                        {categories.length>0 && (
                          <div style={{marginTop:18}}>
                            <div style={{fontSize:12,color:'#555',marginBottom:6}}>Categorías disponibles:</div>
                            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                              {categories.map(c => (
                                <span key={c.id} style={{background:'#f1f5f9',padding:'4px 8px',borderRadius:12,fontSize:11,border:'1px solid #e2e8f0'}}>{c.name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {supportView==='list' && (
                      <div>
                        {loading ? (
                          <div>Cargando tickets...</div>
                        ) : tickets.length === 0 ? (
                          <div style={{textAlign:'center',padding:'30px',color:'#666'}}>
                            <div style={{fontSize:42,marginBottom:12}}>📋</div>
                            <p style={{margin:0}}>No tienes tickets creados.</p>
                          </div>
                        ) : (
                          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                            {tickets.map(ticket => (
                              <div key={ticket.id} style={{border:'1px solid #eee',borderRadius:8,padding:12,marginBottom:12,background:'#fafafa'}}>
                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                                  <strong style={{fontSize:14}}>{ticket.subject}</strong>
                                  <span style={{
                                    padding:'2px 8px',borderRadius:12,fontSize:11,
                                    background: ticket.status==='open' ? '#fff3cd' : ticket.status==='in_progress' ? '#d4edda' : '#f8d7da',
                                    color: ticket.status==='open' ? '#856404' : ticket.status==='in_progress' ? '#155724' : '#721c24'
                                  }}>{ticket.status}</span>
                                </div>
                                <div style={{fontSize:11,color:'#555'}}>
                                  #{ticket.id} • {new Date(ticket.createdAt).toLocaleDateString()}
                                </div>
                                <div style={{fontSize:13,color:'#444',marginTop:6}}>
                                  {ticket.description.length > 160 ? ticket.description.slice(0,160)+'…' : ticket.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={toggleWidget}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3498db, #2980b9)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '24px',
          boxShadow: '0 4px 20px rgba(52, 152, 219, 0.4)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          animation: unreadCount > 0 ? 'pulse 2s infinite' : 'none'
        }}
        className="fab"
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
        }}
      >
        {isOpen ? '×' : '🤖'}
        
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#e74c3c',
            color: 'white',
            borderRadius: '50%',
            width: '20px',
            height: '20px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <style>
        {`
          @keyframes pulse {
            0% { box-shadow: 0 4px 20px rgba(52, 152, 219, 0.4); }
            50% { box-shadow: 0 4px 20px rgba(231, 76, 60, 0.6); }
            100% { box-shadow: 0 4px 20px rgba(52, 152, 219, 0.4); }
          }
        `}
      </style>
    </>
  );
};

export default ChatWidget;