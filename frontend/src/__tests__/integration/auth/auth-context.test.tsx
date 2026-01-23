

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../context/AuthContext';
import { authService } from '../../../services/auth.service';
import { createTestApiClient, createTestUser } from '../helpers/test-api.helper';
import { TEST_CONFIG, checkBackendAvailable } from '../helpers/test-config.helper';


jest.mock('../../../services/auth.service');
jest.mock('../../../services/users.service', () => ({
  usersService: {
    me: jest.fn(),
    depositMe: jest.fn(),
  },
}));

const TestComponent: React.FC = () => {
  const { user, authMode, login, register, logout } = useAuth();

  return (
    <div>
      <div data-testid="user">{user ? user.username : 'null'}</div>
      <div data-testid="auth-mode">{authMode || 'null'}</div>
      <button
        data-testid="login-btn"
        onClick={() => login('testuser', 'testpass')}
      >
        Login
      </button>
      <button
        data-testid="register-btn"
        onClick={() => register('newuser', 'newpass')}
      >
        Register
      </button>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

describe('AuthContext Integration', () => {
  let isBackendAvailable = false;

  beforeAll(async () => {
    isBackendAvailable = await checkBackendAvailable();
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  describe('Web Auth Flow', () => {
    it('should login user and update context', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const api = createTestApiClient();
      const testUser = await createTestUser(api);

      (authService.login as jest.Mock).mockResolvedValue({
        accessToken: testUser.token,
      });

      const { usersService } = require('../../../services/users.service');
      usersService.me.mockResolvedValue({
        _id: testUser.userId,
        username: testUser.username,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      const loginBtn = screen.getByTestId('login-btn');
      loginBtn.click();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testUser.username);
        expect(screen.getByTestId('auth-mode')).toHaveTextContent('web');
      });
    });

    it('should register user and update context', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const api = createTestApiClient();
      const testUser = await createTestUser(api);

      (authService.register as jest.Mock).mockResolvedValue({
        accessToken: testUser.token,
      });

      const { usersService } = require('../../../services/users.service');
      usersService.me.mockResolvedValue({
        _id: testUser.userId,
        username: testUser.username,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      const registerBtn = screen.getByTestId('register-btn');
      registerBtn.click();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testUser.username);
        expect(screen.getByTestId('auth-mode')).toHaveTextContent('web');
      });
    });

    it('should logout and clear context', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const api = createTestApiClient();
      const testUser = await createTestUser(api);

      localStorage.setItem('accessToken', testUser.token);

      const { usersService } = require('../../../services/users.service');
      usersService.me.mockResolvedValue({
        _id: testUser.userId,
        username: testUser.username,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testUser.username);
      });

      const logoutBtn = screen.getByTestId('logout-btn');
      logoutBtn.click();

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('null');
        expect(localStorage.getItem('accessToken')).toBeNull();
      });
    });
  });

  describe('Token Restoration', () => {
    it('should restore user from localStorage token', async () => {
      if (!isBackendAvailable) {
        return;
      }

      const api = createTestApiClient();
      const testUser = await createTestUser(api);

      localStorage.setItem('accessToken', testUser.token);

      const { usersService } = require('../../../services/users.service');
      usersService.me.mockResolvedValue({
        _id: testUser.userId,
        username: testUser.username,
        balance: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testUser.username);
        expect(screen.getByTestId('auth-mode')).toHaveTextContent('web');
      });
    });
  });
});
