import { useState, useEffect } from 'react';

// Hook personalizado para manejar el estado de conexión
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Notificar que hemos vuelto online
        console.log('Connection restored');
        setWasOffline(false);
        
        // Trigger background sync if available
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
          navigator.serviceWorker.ready.then(registration => {
            return registration.sync.register('parking-sync');
          }).catch(err => console.log('Background sync registration failed'));
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      console.log('Connection lost');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return { isOnline, wasOffline };
};

// Hook para manejar datos con caché offline
export const useOfflineStorage = (key, initialValue = null) => {
  const [data, setData] = useState(() => {
    try {
      const item = localStorage.getItem(`offline_${key}`);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading offline data for ${key}:`, error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      setData(value);
      if (value === null) {
        localStorage.removeItem(`offline_${key}`);
      } else {
        localStorage.setItem(`offline_${key}`, JSON.stringify(value));
      }
    } catch (error) {
      console.error(`Error storing offline data for ${key}:`, error);
    }
  };

  const clearValue = () => setValue(null);

  return [data, setValue, clearValue];
};

// Hook para hacer requests con fallback offline
export const useApiWithOffline = () => {
  const { isOnline } = useNetworkStatus();

  const makeRequest = async (requestFn, fallbackData = null, cacheKey = null) => {
    try {
      if (isOnline) {
        const result = await requestFn();
        
        // Cache successful result if key provided
        if (cacheKey && result) {
          localStorage.setItem(`cache_${cacheKey}`, JSON.stringify({
            data: result,
            timestamp: Date.now()
          }));
        }
        
        return { data: result, fromCache: false, error: null };
      } else {
        throw new Error('No internet connection');
      }
    } catch (error) {
      console.warn('API request failed, trying cache:', error.message);
      
      // Try to get cached data
      if (cacheKey) {
        try {
          const cached = localStorage.getItem(`cache_${cacheKey}`);
          if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            const maxAge = 30 * 60 * 1000; // 30 minutes
            
            if (age < maxAge) {
              return { data, fromCache: true, error: null };
            }
          }
        } catch (cacheError) {
          console.error('Cache read error:', cacheError);
        }
      }
      
      // Return fallback data if available
      if (fallbackData !== null) {
        return { data: fallbackData, fromCache: true, error: null };
      }
      
      // No fallback available
      return { data: null, fromCache: false, error: error.message };
    }
  };

  return { makeRequest, isOnline };
};

// Hook para detectar instalación PWA
export const usePWAInstall = () => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (installPrompt) {
      const { outcome } = await installPrompt.userChoice;
      setInstallPrompt(null);
      setIsInstallable(false);
      return outcome === 'accepted';
    }
    return false;
  };

  return { install, isInstallable, isInstalled };
};

// Utility functions for PWA features
export const registerForPushNotifications = async () => {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission not granted for notifications');
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY
      });

      console.log('Push notification subscription:', subscription);
      return subscription;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }
  return null;
};

export const unregisterPushNotifications = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        console.log('Push notification unsubscribed');
        return true;
      }
    } catch (error) {
      console.error('Error unregistering push notifications:', error);
    }
  }
  return false;
};

export default {
  useNetworkStatus,
  useOfflineStorage, 
  useApiWithOffline,
  usePWAInstall,
  registerForPushNotifications,
  unregisterPushNotifications
};