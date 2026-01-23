

import axios, { AxiosInstance } from 'axios';
import { TEST_CONFIG } from './test-config.helper';


export function createTestApiClient(baseURL: string = TEST_CONFIG.API_URL): AxiosInstance {
  return axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: TEST_CONFIG.TIMEOUT,
  });
}


export async function createTestUser(
  api: AxiosInstance,
  username: string = `testuser${Date.now()}`,
  password: string = 'testpass123',
): Promise<{ username: string; password: string; token: string; userId: string }> {
  const { data } = await api.post('/auth/register', { username, password });
  const token = data.accessToken;

  // Get user ID
  const { data: user } = await api.get('/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    username,
    password,
    token,
    userId: user.id || user._id,
  };
}

/**
 * Login as admin
 */
export async function loginAsAdmin(api: AxiosInstance): Promise<string> {
  const { data } = await api.post('/auth/login', {
    username: TEST_CONFIG.ADMIN_USERNAME,
    password: TEST_CONFIG.ADMIN_PASSWORD,
  });
  return data.accessToken;
}

/**
 * Create a test auction
 */
export async function createTestAuction(
  api: AxiosInstance,
  adminToken: string,
  overrides: Partial<{
    title: string;
    description: string;
    totalRounds: number;
    winnersPerRound: number;
    roundDuration: number;
    minBid: number;
    minIncrement: number;
  }> = {},
): Promise<string> {
  const defaultAuction = {
    title: `Test Auction ${Date.now()}`,
    description: 'Test auction for integration tests',
    totalRounds: 3,
    winnersPerRound: 2,
    roundDuration: 60, // 60 seconds
    minBid: 100,
    minIncrement: 10,
  };

  const { data } = await api.post(
    '/auctions',
    { ...defaultAuction, ...overrides },
    {
      headers: { Authorization: `Bearer ${adminToken}` },
    },
  );

  return data.id || data._id;
}

/**
 * Wait for a condition to be true
 */
export function waitFor(condition: () => boolean, timeout: number = TEST_CONFIG.TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for condition after ${timeout}ms`));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
