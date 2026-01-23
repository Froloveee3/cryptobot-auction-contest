

import { ClientSession } from 'mongoose';


export type MongoSession = ClientSession;


export interface MongoError extends Error {
  code?: number;
  errorLabels?: string[];
  name: string;
  message: string;
}


export function isMongoError(error: Error | MongoError): error is MongoError {
  return (
    error instanceof Error &&
    (typeof (error as MongoError).code === 'number' ||
      Array.isArray((error as MongoError).errorLabels) ||
      (error as MongoError).name === 'MongoServerError' ||
      (error as MongoError).name === 'MongoError')
  );
}


export function isTransientTransactionError(error: unknown): boolean {
  if (!(error instanceof Error) || !isMongoError(error)) {
    return false;
  }
  const msg = String(error.message || '').toLowerCase();
  return (
    error.errorLabels?.includes('TransientTransactionError') === true ||
    error.errorLabels?.includes('UnknownTransactionCommitResult') === true ||
    error.code === 112 || 
    msg.includes('write conflict') ||
    msg.includes('catalog changes')
  );
}


export function isReplicaSetError(error: unknown): boolean {
  if (!(error instanceof Error) || !isMongoError(error)) {
    return false;
  }
  const msg = String(error.message || '');
  return msg.includes('replica set') || msg.includes('mongos');
}
