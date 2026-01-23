

export const TEST_CONFIG = {
  
  USE_REAL_BACKEND: process.env.REACT_APP_TEST_USE_REAL_BACKEND === 'true',
  API_URL: process.env.REACT_APP_TEST_API_URL || 'http://localhost:3000/api',
  WS_URL: process.env.REACT_APP_TEST_WS_URL || 'http://localhost:3000',
  ADMIN_USERNAME: process.env.REACT_APP_TEST_ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.REACT_APP_TEST_ADMIN_PASSWORD || 'adminadmin',
  
  TIMEOUT: 30000, 
  WS_TIMEOUT: 10000, 
};


export async function checkBackendAvailable(): Promise<boolean> {
  if (!TEST_CONFIG.USE_REAL_BACKEND) {
    return false;
  }
  try {
    
    const apiUrl = TEST_CONFIG.API_URL;
    const response = await fetch(`${apiUrl}/metrics`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Skip test if backend is not available
 */
export function skipIfNoBackend(testName: string): void {
  if (!TEST_CONFIG.USE_REAL_BACKEND) {
    test.skip(testName, () => {
      // Test skipped - backend not available
    });
  }
}
