import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContextStore = {
  requestId: string;
};

const als = new AsyncLocalStorage<RequestContextStore>();

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return als.run({ requestId }, fn);
}

export function getCurrentRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

