

import { authService } from '../../../services/auth.service';
import { createTestApiClient, createTestUser, loginAsAdmin } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';

describe('Auth API Integration', () => {
  const api = createTestApiClient();
  let isBackendAvailable = false;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
    if (!isBackendAvailable) {
      console.warn('Backend not available, skipping integration tests');
    }
  });

  describe('Web Auth', () => {
    it('should register a new user', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const username = `testregister${Date.now()}`;
      const password = 'testpass123';

      const result = await authService.register(username, password);

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });

    it('should login with valid credentials', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const { username, password } = await createTestUser(api);

      const result = await authService.login(username, password);

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
    });

    it('should reject login with invalid credentials', async () => {
      if (!isBackendAvailable) {
        return;
      }

      await expect(authService.login('nonexistent', 'wrongpass')).rejects.toThrow();
    });

    it('should reject registration with duplicate username', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const { username } = await createTestUser(api);

      await expect(authService.register(username, 'anotherpass')).rejects.toThrow();
    });
  });

  describe('Telegram Auth', () => {
    it('should login with valid Telegram initData', async () => {
      if (!isBackendAvailable) {
        return;
      }

      // Real Telegram initData from WebView
      // Format: query_id=...&user=...&auth_date=...&hash=...
      const initData =
        'query_id=AAH0acQOAAAAAPRpxA5iUcVk&user=%7B%22id%22%3A247753204%2C%22first_name%22%3A%22Vadim%22%2C%22last_name%22%3A%22Frolov%22%2C%22username%22%3A%22Froloweeeb3%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FF6fvfO7F84k59zhlJWu_vWtS-EEiw6U8n9lilaBKWn0.svg%22%7D&auth_date=1769083885&signature=QN9euBJG4EpSXOYnbgohZWAmmKPmfNEcPSNe4dbPWFE23oY2LlJUxqaVjdoW4V-xjzfelcj-zwoOR6nKAuRiAg&hash=0118d18a8dcf2d6f437c307ed95cfb1a31c34a9f79ee13a5f65484514db61736';

      const result = await authService.loginTelegram(initData);

      expect(result).toHaveProperty('accessToken');
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);

      // Verify we can use the token to get user info
      const { data: user } = await api.get('/users/me', {
        headers: { Authorization: `Bearer ${result.accessToken}` },
      });

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username');
      // Telegram user should have username like tg247753204
      expect(user.username).toMatch(/^tg\d+$/);
    });
  });

  describe('Admin Auth', () => {
    it('should login as admin', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const token = await loginAsAdmin(api);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });
});
