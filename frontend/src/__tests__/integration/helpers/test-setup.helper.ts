

import { createTestApiClient, loginAsAdmin } from './test-api.helper';
import { TEST_CONFIG } from './test-config.helper';


export async function cleanupTestData(): Promise<void> {
  
  
}


export async function setupTestEnvironment(): Promise<{
  api: ReturnType<typeof createTestApiClient>;
  adminToken: string;
}> {
  const api = createTestApiClient();
  const adminToken = await loginAsAdmin(api);

  return { api, adminToken };
}


export function resetStorage(): void {
  localStorage.clear();
  sessionStorage.clear();
}


export function setTestTimeout(timeout: number = TEST_CONFIG.TIMEOUT): void {
  jest.setTimeout(timeout);
}
