import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../utils/apiError';
import { isTelegramWebView, getInitData, getTelegramUser } from '../utils/telegram';
import { isValidPassword, isValidUsername } from '../utils/validation';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramConnecting, setTelegramConnecting] = useState(false);
  const { login, register, loginTelegram, user } = useAuth();
  const navigate = useNavigate();
  const isTelegram = isTelegramWebView();
  const tgUser = getTelegramUser();

  
  useEffect(() => {
    if (isTelegram && !user) {
      const initData = getInitData();
      if (initData) {
        setTelegramConnecting(true);
        loginTelegram(initData)
          .then(() => {
            navigate('/');
          })
          .catch((error) => {
            if (process.env.NODE_ENV === 'development') {
              console.error('Telegram auto-login failed:', error);
            }
            const message = getApiErrorMessage(error, 'Failed to authenticate with Telegram');
            alert(message);
            setTelegramConnecting(false);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTelegram]);

  
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    const normalizedUsername = username.trim();
    if (!isValidUsername(normalizedUsername)) {
      alert('Username must start with a letter and contain only letters and digits');
      return;
    }

    setLoading(true);
    try {
      await login(normalizedUsername, password);
      navigate('/');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Login failed:', error);
      }
      alert(getApiErrorMessage(error, 'Failed to login'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !password) return;
    const normalizedUsername = username.trim();
    if (!isValidUsername(normalizedUsername)) {
      alert('Username must start with a letter and contain only letters and digits');
      return;
    }
    if (!isValidPassword(password)) {
      alert('Password must be at least 8 characters and include letters and numbers');
      return;
    }
    setLoading(true);
    try {
      await register(normalizedUsername, password);
      navigate('/');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Register failed:', error);
      }
      alert(getApiErrorMessage(error, 'Failed to register'));
    } finally {
      setLoading(false);
    }
  };

  
  if (isTelegram) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ marginBottom: '1rem' }}>Auction System</h1>
          {telegramConnecting ? (
            <div>
              <p>Connecting...</p>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '1rem' }}>
                Authenticating with Telegram...
              </p>
            </div>
          ) : (
            <div>
              <p>Welcome{tgUser?.first_name ? `, ${tgUser.first_name}` : ''}!</p>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '1rem' }}>
                Please wait while we authenticate you...
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const usernameValid = isValidUsername(username.trim());
  const passwordValid = isValidPassword(password);

  // Web: show login/register form
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: '400px', padding: '2rem', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Auction System</h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
            {!usernameValid && username.trim().length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#dc3545' }}>
                Username must start with a letter and contain only letters and digits.
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
            {!passwordValid && password.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#dc3545' }}>
                Password must be at least 8 characters and include letters and numbers.
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !username.trim() || !password || !usernameValid}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            disabled={loading || !username.trim() || !password || !usernameValid || !passwordValid}
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              marginTop: '0.75rem',
            }}
          >
            {loading ? 'Please wait...' : 'Create account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666', textAlign: 'center' }}>
          Use strict auth for website.
        </p>
      </div>
    </div>
  );
};

export default Login;
