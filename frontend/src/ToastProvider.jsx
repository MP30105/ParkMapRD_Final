import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';

const ToastCtx = createContext({ showToast: () => {} });
export const useToast = () => useContext(ToastCtx);

let idCounter = 0;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const showToast = useCallback((type, message, opts = {}) => {
    const id = ++idCounter;
    const ttl = opts.ttl || (type === 'error' ? 6000 : 4000);
    setToasts(t => [...t, { id, type, message, ttl }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map(t => setTimeout(() => remove(t.id), t.ttl));
    return () => timers.forEach(clearTimeout);
  }, [toasts, remove]);

  const stackRef = useRef(null);
  // Focus newest toast for screen readers (without stealing user focus repeatedly)
  useEffect(() => {
    if (!toasts.length) return;
    const latest = stackRef.current?.querySelector('.toast:last-of-type');
    if (latest) {
      latest.setAttribute('tabindex', '-1');
      latest.focus();
    }
  }, [toasts]);

  return (
    <ToastCtx.Provider value={{ showToast }}>
      {children}
      <div
        ref={stackRef}
        className="toast-stack"
        role="region"
        aria-label="Mensajes"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
          >
            <span className="toast-msg">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="toast-close"
              aria-label="Cerrar"
            >×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
