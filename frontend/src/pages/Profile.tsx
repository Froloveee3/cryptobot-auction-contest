import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { profileService } from '../services/profile.service';
import type { BalanceTransaction, UserBidHistoryEntry, UserGiftCollectionEntry } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

type Tab = 'collection' | 'bids' | 'balance';

const PAGE_SIZE = 20;

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('collection');
  const [loading, setLoading] = useState(false);

  const [collectionPage, setCollectionPage] = useState(1);
  const [bidsPage, setBidsPage] = useState(1);
  const [balancePage, setBalancePage] = useState(1);

  const [collection, setCollection] = useState<Array<UserGiftCollectionEntry>>([]);
  const [collectionTotalPages, setCollectionTotalPages] = useState(1);

  const [bids, setBids] = useState<Array<UserBidHistoryEntry>>([]);
  const [bidsTotalPages, setBidsTotalPages] = useState(1);

  const [txs, setTxs] = useState<Array<BalanceTransaction>>([]);
  const [txsTotalPages, setTxsTotalPages] = useState(1);

  const activePage = useMemo(() => {
    if (tab === 'collection') return collectionPage;
    if (tab === 'bids') return bidsPage;
    return balancePage;
  }, [tab, collectionPage, bidsPage, balancePage]);

  const totalPages = useMemo(() => {
    if (tab === 'collection') return collectionTotalPages;
    if (tab === 'bids') return bidsTotalPages;
    return txsTotalPages;
  }, [tab, collectionTotalPages, bidsTotalPages, txsTotalPages]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        if (tab === 'collection') {
          const page = collectionPage;
          const r = await profileService.getMyCollection(page, PAGE_SIZE);
          if (!mounted) return;
          setCollection(r.data);
          setCollectionTotalPages(Math.max(1, r.totalPages || 1));
        } else if (tab === 'bids') {
          const page = bidsPage;
          const r = await profileService.getMyBids(page, PAGE_SIZE);
          if (!mounted) return;
          setBids(r.data);
          setBidsTotalPages(Math.max(1, r.totalPages || 1));
        } else {
          const page = balancePage;
          const r = await profileService.getMyBalanceHistory(page, PAGE_SIZE);
          if (!mounted) return;
          setTxs(r.data);
          setTxsTotalPages(Math.max(1, r.totalPages || 1));
        }
      } catch (e) {
        if (!mounted) return;
        alert(getApiErrorMessage(e, 'Failed to load profile data'));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [tab, collectionPage, bidsPage, balancePage]);

  const renderTabs = () => (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        backgroundColor: '#f8f9fa',
        padding: '0.25rem',
        borderRadius: '8px',
        flexWrap: 'wrap',
      }}
    >
      {[
        { id: 'collection' as const, label: 'Коллекция' },
        { id: 'bids' as const, label: 'История ставок' },
        { id: 'balance' as const, label: 'История баланса' },
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: tab === t.id ? '#007bff' : 'transparent',
            color: tab === t.id ? 'white' : '#666',
            fontWeight: tab === t.id ? 'bold' : 'normal',
            transition: 'all 0.2s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  const renderPager = () => (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' }}>
      <button
        onClick={() => {
          if (tab === 'collection') setCollectionPage((p) => Math.max(1, p - 1));
          else if (tab === 'bids') setBidsPage((p) => Math.max(1, p - 1));
          else setBalancePage((p) => Math.max(1, p - 1));
        }}
        disabled={loading || activePage <= 1}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #ddd',
          borderRadius: '6px',
          cursor: loading || activePage <= 1 ? 'not-allowed' : 'pointer',
          background: 'white',
        }}
      >
        ← Prev
      </button>
      <div style={{ color: '#666' }}>
        Page <strong>{activePage}</strong> / {totalPages}
      </div>
      <button
        onClick={() => {
          if (tab === 'collection') setCollectionPage((p) => Math.min(collectionTotalPages, p + 1));
          else if (tab === 'bids') setBidsPage((p) => Math.min(bidsTotalPages, p + 1));
          else setBalancePage((p) => Math.min(txsTotalPages, p + 1));
        }}
        disabled={loading || activePage >= totalPages}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid #ddd',
          borderRadius: '6px',
          cursor: loading || activePage >= totalPages ? 'not-allowed' : 'pointer',
          background: 'white',
        }}
      >
        Next →
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ← Back to Dashboard
        </button>
        <div style={{ color: '#666' }}>
          <strong>{user?.username ?? 'Profile'}</strong>
          {typeof user?.balance === 'number' ? ` · Balance: ${user.balance.toLocaleString()} Stars` : ''}
        </div>
      </div>

      <h1 style={{ marginTop: 0 }}>Профиль</h1>
      {renderTabs()}

      <div style={{ marginTop: '1.5rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : tab === 'collection' ? (
          collection.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Пока нет выигранных подарков.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {collection.map((g) => (
                <div key={g.id} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: '8px', background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>Gift #{g.giftNumber}</strong> · Round {g.wonRoundNumber}
                    </div>
                    <div style={{ color: '#666' }}>{formatDate(g.wonAt)}</div>
                  </div>
                  <div style={{ marginTop: '0.25rem', color: '#666' }}>
                    Auction:{' '}
                    <button
                      onClick={() => navigate(`/auctions/${g.auctionId}`)}
                      style={{ border: 'none', background: 'transparent', color: '#007bff', cursor: 'pointer', padding: 0 }}
                    >
                      {g.auctionTitle || g.auctionId}
                    </button>
                    {' · '}Winning bid: {g.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'bids' ? (
          bids.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>История ставок пуста.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {bids.map((b) => (
                <div key={b._id} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: '8px', background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{b.amount.toLocaleString()}</strong> · <span style={{ color: '#666' }}>{b.status}</span>
                      {b.wonRoundNumber ? ` · won round ${b.wonRoundNumber}` : ''}
                      {b.giftNumber ? ` · gift #${b.giftNumber}` : ''}
                    </div>
                    <div style={{ color: '#666' }}>{formatDate(b.timestamp)}</div>
                  </div>
                  <div style={{ marginTop: '0.25rem', color: '#666' }}>
                    Auction:{' '}
                    <button
                      onClick={() => navigate(`/auctions/${b.auctionId}`)}
                      style={{ border: 'none', background: 'transparent', color: '#007bff', cursor: 'pointer', padding: 0 }}
                    >
                      {b.auctionTitle || b.auctionId}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : txs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>История баланса пуста.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {txs.map((t) => (
              <div key={t.id} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: '8px', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{t.type}</strong> · {t.amount.toLocaleString()}
                  </div>
                  <div style={{ color: '#666' }}>{formatDate(t.createdAt)}</div>
                </div>
                <div style={{ marginTop: '0.25rem', color: '#666' }}>
                  Balance: {t.balanceBefore.toLocaleString()} → {t.balanceAfter.toLocaleString()}
                </div>
                <div style={{ marginTop: '0.25rem', color: '#666' }}>{t.description}</div>
              </div>
            ))}
          </div>
        )}

        {renderPager()}
      </div>
    </div>
  );
};

export default Profile;

