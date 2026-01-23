import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ToastHost from './components/ToastHost';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CreateAuction from './pages/CreateAuction';
import AuctionPage from './pages/AuctionPage';
import Profile from './pages/Profile';
import './App.css';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/auctions/create"
              element={
                <PrivateRoute>
                  <CreateAuction />
                </PrivateRoute>
              }
            />
            <Route
              path="/auctions/:id"
              element={
                <PrivateRoute>
                  <AuctionPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
          </Routes>
          <ToastHost />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
