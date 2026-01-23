
import { wsManager } from './ws-manager';
import type { Socket } from 'socket.io-client';


export const wsService = {
  connect: () => wsManager.connect(),
  disconnect: () => wsManager.disconnect(),
  getSocket: (): Socket | null => wsManager.getSocket(),
};
