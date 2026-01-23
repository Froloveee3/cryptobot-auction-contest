import React from 'react';
import { useToast, ToastType } from '../context/ToastContext';

const ToastHost: React.FC = () => {
  const { toasts, removeToast } = useToast();

  const getToastStyles = (type: ToastType) => {
    const baseStyles: React.CSSProperties = {
      padding: '1rem 1.5rem',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      minWidth: '300px',
      maxWidth: '500px',
      animation: 'slideIn 0.3s ease-out',
      cursor: 'pointer',
    };

    switch (type) {
      case 'success':
        return {
          ...baseStyles,
          backgroundColor: '#28a745',
          color: 'white',
        };
      case 'error':
        return {
          ...baseStyles,
          backgroundColor: '#dc3545',
          color: 'white',
        };
      case 'warning':
        return {
          ...baseStyles,
          backgroundColor: '#ffc107',
          color: '#333',
        };
      case 'info':
      default:
        return {
          ...baseStyles,
          backgroundColor: '#17a2b8',
          color: 'white',
        };
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes slideOut {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `}
      </style>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={getToastStyles(toast.type)}
          onClick={() => removeToast(toast.id)}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <span style={{ flex: 1, fontWeight: 500 }}>{toast.message}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeToast(toast.id);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: 0,
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;
