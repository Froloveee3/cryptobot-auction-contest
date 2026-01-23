
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AppLoggerService } from '../src/common/services/logger.service';

export async function setupTestApp(app: INestApplication): Promise<void> {
  app.setGlobalPrefix('api');
  
  
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  
  const logger = await app.resolve(AppLoggerService);
  app.useGlobalFilters(new HttpExceptionFilter(logger));
}

export type ApiClient = ReturnType<typeof request>;

export function http(app: INestApplication): ApiClient {
  
  return request(app.getHttpServer()) as unknown as ApiClient;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function poll<T>(
  fn: () => Promise<T | null>,
  { timeoutMs = 20000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fn();
    if (res) return res;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`poll timeout after ${timeoutMs}ms`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
}

export function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function loginUser(
  api: ApiClient,
  username: string,
  password: string,
): Promise<{ accessToken: string }> {
  const resp = await api.post('/api/auth/login').send({ username, password });
  expect([200, 201]).toContain(resp.status);
  expect(resp.body?.accessToken).toBeTruthy();
  return { accessToken: resp.body.accessToken as string };
}

export async function registerUser(api: ApiClient, username?: string): Promise<{ username: string; accessToken: string }> {
  const u = username || `e2eu${Date.now()}${Math.random().toString(16).slice(2)}`;
  const resp = await api.post('/api/auth/register').send({ username: u, password: 'password123' });
  expect(resp.status).toBe(201);
  expect(resp.body?.accessToken).toBeTruthy();
  return { username: u, accessToken: resp.body.accessToken };
}

export type MeDto = {
  _id: string;
  username: string;
  balance: number;
};

export async function getMe(api: ApiClient, token: string): Promise<MeDto> {
  const resp = await api.get('/api/users/me').set(authHeader(token));
  expect(resp.status).toBe(200);
  expect(typeof resp.body?._id).toBe('string');
  expect(typeof resp.body?.username).toBe('string');
  expect(typeof resp.body?.balance).toBe('number');
  return resp.body as MeDto;
}

export async function loginAdmin(api: ApiClient): Promise<{ accessToken: string }> {
  // Credentials are bootstrapped from env in setup-e2e.ts
  return loginUser(api, 'admin', 'adminadmin');
}

export async function depositMe(api: ApiClient, token: string, amount: number): Promise<void> {
  const resp = await api.post('/api/users/me/deposit').set(authHeader(token)).send({ amount });
  expect([200, 201]).toContain(resp.status);
  expect(typeof resp.body?.balance).toBe('number');
}

