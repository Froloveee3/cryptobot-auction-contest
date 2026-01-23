

import { useToast } from '../context/ToastContext';


export { useToast };


export const notifySuccess = (message: string, duration?: number) => {
  
  
  throw new Error('notifySuccess must be called from a component using useToast hook. Use useToast().showToast instead.');
};


export const notifyError = (message: string, duration?: number) => {
  throw new Error('notifyError must be called from a component using useToast hook. Use useToast().showToast instead.');
};


export const notifyInfo = (message: string, duration?: number) => {
  throw new Error('notifyInfo must be called from a component using useToast hook. Use useToast().showToast instead.');
};


export const notifyWarning = (message: string, duration?: number) => {
  throw new Error('notifyWarning must be called from a component using useToast hook. Use useToast().showToast instead.');
};


export const useNotifications = () => {
  const { showToast } = useToast();

  return {
    success: (message: string, duration?: number) => showToast('success', message, duration),
    error: (message: string, duration?: number) => showToast('error', message, duration),
    info: (message: string, duration?: number) => showToast('info', message, duration),
    warning: (message: string, duration?: number) => showToast('warning', message, duration),
  };
};
