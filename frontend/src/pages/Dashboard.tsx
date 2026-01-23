import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { Auction } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { AuctionCard } from '../components/AuctionCard';

type TabType = 'active' | 'all' | 'history';

const Dashboard: React.FC = () => {
  const { user, updateBalance, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [balanceChange, setBalanceChange] = useState(0);
  const pageSize = 10;

  const normalizeDate = (value?: string | Date | null) => {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  };

  const normalizeLobbyAuction = (item: any): Auction => ({
    ...item,
    createdAt: normalizeDate(item.createdAt)!,
    startedAt: normalizeDate(item.startedAt),
    endedAt: normalizeDate(item.endedAt),
    currentRoundEndsAt: normalizeDate(item.currentRoundEndsAt),
  });

  useEffect(() => {
    setLoading(true);
    setCurrentPage(1);
    setAuctions([]);
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  
  
  const { syncLobby, isConnected } = useWebSocket({
    autoJoinLobby: true,
    onLobbySnapshot: (payload) => {
      if (payload.tab && payload.tab !== activeTab) return;
      if (payload.page === 1) {
        const normalized = payload.data.map(normalizeLobbyAuction);
        setAuctions((prev) => (currentPage === 1 ? normalized : [...normalized, ...prev.slice(pageSize)]));
        setHasMore(payload.page < payload.totalPages);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      if (payload.page === currentPage) {
        const normalized = payload.data.map(normalizeLobbyAuction);
        setAuctions((prev) => {
          const next = [...prev];
          const start = (payload.page - 1) * pageSize;
          if (start >= next.length) {
            return [...next, ...normalized];
          }
          next.splice(start, normalized.length, ...normalized);
          return next;
        });
        setHasMore(payload.page < payload.totalPages);
        setLoadingMore(false);
      }
    },
    onAuctionUpdated: (payload) => {
      setAuctions((prev) => {
        const idx = prev.findIndex((a) => String(a._id) === String(payload._id));
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: payload.status as Auction['status'],
          currentRound: payload.currentRound ?? next[idx].currentRound,
          totalGiftsDistributed: payload.totalGiftsDistributed ?? next[idx].totalGiftsDistributed,
          endedAt: normalizeDate(payload.endedAt ?? next[idx].endedAt),
          currentRoundEndsAt: normalizeDate(payload.currentRoundEndsAt ?? next[idx].currentRoundEndsAt),
          remainingSupply:
            typeof payload.remainingSupply === 'number' ? payload.remainingSupply : next[idx].remainingSupply,
        };
        return next;
      });
    },
  });

  useEffect(() => {
    syncLobby({ status: activeTab, page: currentPage, limit: pageSize });
  }, [activeTab, currentPage, pageSize, syncLobby]);

  useEffect(() => {
    
  }, [isConnected]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handleBalanceChange = async (amount: number) => {
    try {
      await updateBalance(amount);
      setBalanceChange(0);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to update balance:', error);
      }
      alert(getApiErrorMessage(error, 'Failed to update balance'));
    }
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? '1rem' : '2rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Auction Dashboard</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>Welcome, {user?.username}!</span>
          <button
            onClick={() => navigate('/profile')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '0.5rem',
            }}
          >
            Profile
          </button>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to logout?')) {
                logout();
                navigate('/login');
              }
            }}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Balance Management */}
      <div
        style={{
          padding: '1.5rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Balance Management</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <strong>Current Balance:</strong>{' '}
            {typeof user?.balance === 'number' && Number.isFinite(user.balance) ? user.balance.toLocaleString() : '—'} Stars
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="number"
              value={balanceChange || ''}
              onChange={(e) => setBalanceChange(Number(e.target.value))}
              placeholder="Amount"
              style={{
                width: '150px',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
            <button
              onClick={() => balanceChange > 0 && handleBalanceChange(balanceChange)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              + Add
            </button>
            <button
              onClick={() => balanceChange > 0 && handleBalanceChange(-balanceChange)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              - Subtract
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => handleBalanceChange(1000)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            +1,000
          </button>
          <button
            onClick={() => handleBalanceChange(5000)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            +5,000
          </button>
          <button
            onClick={() => handleBalanceChange(10000)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            +10,000
          </button>
        </div>
      </div>

      {/* Actions */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/auctions/create')}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Create New Auction
        </button>
      </div>

      {/* Auctions List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Auctions</h2>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              backgroundColor: '#f8f9fa',
              padding: '0.25rem',
              borderRadius: '8px',
            }}
          >
            {(['active', 'all', 'history'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: activeTab === tab ? '#007bff' : 'transparent',
                  color: activeTab === tab ? 'white' : '#666',
                  fontWeight: activeTab === tab ? 'bold' : 'normal',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s',
                }}
              >
                {tab === 'all' ? 'All' : tab === 'active' ? 'Active' : 'History'}
              </button>
            ))}
          </div>
        </div>

        {loading && auctions.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>Loading auctions...</div>
        ) : auctions.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>
            <p>No auctions found. Create your first auction!</p>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {auctions.map((auction) => (
                <AuctionCard
                  key={auction._id}
                  auction={auction}
                  onClick={() => navigate(`/auctions/${auction._id}`)}
                />
              ))}
            </div>

            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '0.75rem 2rem',
                    fontSize: '1rem',
                    backgroundColor: loadingMore ? '#ccc' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loadingMore ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
