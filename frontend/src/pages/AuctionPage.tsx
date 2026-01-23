import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auctionsService } from '../services/auctions.service';
import { bidsService } from '../services/bids.service';
import { botsService } from '../services/bots.service';
import { useWebSocket } from '../hooks/useWebSocket';
import { Auction, Round, Bot } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { usersService } from '../services/users.service';
import { useNotifications } from '../utils/toast';
import type { AuctionSnapshotPayload, AuctionPatchPayload, BidPlacedPayload } from '../contracts/ws';
import { normalizeSnapshotRound, normalizePatchRound } from '../contracts/ws';

const AuctionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const notify = useNotifications();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [roundsHistory, setRoundsHistory] = useState<Round[]>([]);
  
  const isAdmin = user && (Array.isArray(user.roles) ? user.roles.includes('admin') : user.username === 'admin');
  const [bots, setBots] = useState<Bot[]>([]);
  const [bidAmount, setBidAmount] = useState('');
  const [recipientMode, setRecipientMode] = useState<'self' | 'other'>('self');
  const [recipientValue, setRecipientValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  
  const [currentRound, setCurrentRound] = useState<{
    roundId: string | null;
    roundNumber: number | null;
    endsAt: Date | null;
  } | null>(null);
  const [top100, setTop100] = useState<Array<{ userId: string; username?: string; amount: number; rank: number }>>([]);
  const [myRank, setMyRank] = useState<{ rank: number | null; amount: number | null } | null>(null);
  const [remainingSupply, setRemainingSupply] = useState<number>(0);
  const [dynamicMinBid, setDynamicMinBid] = useState<number>(0);
  const [minBid, setMinBid] = useState<number>(0);
  const [minIncrement, setMinIncrement] = useState<number>(0);

  const endsAtRef = useRef<Date | null>(null);

  const detectRecipient = (
    raw: string,
  ):
    | { kind: 'username' | 'telegramId'; value: string; label: string }
    | { error: string } => {
    const v = String(raw || '').trim();
    if (!v) return { error: 'Recipient is required' };
    if (v.startsWith('_bot')) {
      return { error: 'Bot users cannot be selected as gift recipients' };
    }
    if (/^\d/.test(v)) {
      if (!/^\d+$/.test(v)) {
        return { error: 'Telegram ID must contain digits only' };
      }
      return { kind: 'telegramId', value: v, label: 'Telegram ID' };
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(v)) {
      return { error: 'Username must start with a letter and contain only letters and digits' };
    }
    return { kind: 'username', value: v, label: 'Username' };
  };

  const detectedRecipient =
    recipientMode === 'other' && recipientValue.trim().length > 0 ? detectRecipient(recipientValue) : null;

  
  
  
  const hasActiveBid =
    typeof myRank?.amount === 'number' && Number.isFinite(myRank.amount) && myRank.amount > 0;
  const bidMode: 'new' | 'raise' = hasActiveBid ? 'raise' : 'new';

  const deriveMyRank = (
    list: Array<{ userId: string; amount: number; rank: number }>,
  ): { rank: number | null; amount: number | null } | null => {
    if (!user) return null;
    const entry = list.find((item) => item.userId === user._id);
    return {
      rank: entry ? entry.rank : null,
      amount: entry ? entry.amount : null,
    };
  };

  
  useEffect(() => {
    if (id) {
      loadAuction();
      loadRoundsHistory();
      
      if (isAdmin) {
        loadBots();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  
  const endsAtMs = currentRound?.endsAt ? currentRound.endsAt.getTime() : null;
  useEffect(() => {
    if (!endsAtRef.current) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      if (!endsAtRef.current) {
        setTimeRemaining(null);
        return;
      }
      const remaining = Math.max(0, Math.floor((endsAtRef.current.getTime() - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endsAtMs]);

  
  useWebSocket({
    auctionId: id,
    auctionOptions: { wantSnapshot: true },
    onAuctionSnapshot: (snapshot: AuctionSnapshotPayload) => {
      if (snapshot.auctionId !== id) return;

      
      const round = normalizeSnapshotRound(snapshot.currentRound);
      setCurrentRound(round);
      setTop100(snapshot.top100);
      setMyRank(snapshot.me ?? deriveMyRank(snapshot.top100));
      setRemainingSupply(snapshot.remainingSupply);
      setDynamicMinBid(snapshot.dynamicMinBid);
      setMinBid(snapshot.minBid);
      setMinIncrement(snapshot.minIncrement);

      endsAtRef.current = round.endsAt;
      setLoading(false);
    },
    onAuctionPatch: (patch: AuctionPatchPayload) => {
      if (patch.auctionId !== id) return;

      if ('currentRound' in patch) {
        
        const normalizedRound = normalizePatchRound(patch.currentRound);
        if (normalizedRound) {
          setCurrentRound(normalizedRound);
          endsAtRef.current = normalizedRound.endsAt;
        } else if (patch.currentRound === null) {
          setCurrentRound({ roundId: null, roundNumber: null, endsAt: null });
          endsAtRef.current = null;
          setTimeRemaining(null);
        }
      }
      if (patch.top100) {
        setTop100(patch.top100);
        setMyRank(deriveMyRank(patch.top100));
      }
      if (patch.remainingSupply !== undefined) {
        setRemainingSupply(patch.remainingSupply);
      }
      if (patch.dynamicMinBid !== undefined) {
        setDynamicMinBid(patch.dynamicMinBid);
      }
      
    },
    onRoundStarted: (payload) => {
      if (payload.auctionId !== id) return;
      const newEndsAt = payload.endTime instanceof Date ? payload.endTime : new Date(payload.endTime);
      setCurrentRound({ roundId: payload.roundId, roundNumber: payload.roundNumber, endsAt: newEndsAt });
      endsAtRef.current = newEndsAt;
      loadRoundsHistory();
      notify.info('New round started!');
    },
    onRoundEnded: () => {
      setCurrentRound({ roundId: null, roundNumber: null, endsAt: null });
      endsAtRef.current = null;
      setTimeRemaining(null);
      loadAuction();
      loadRoundsHistory();
      void refreshUser();
      notify.info('Round ended. Winners will be announced shortly.');
    },
    onRoundExtended: (payload) => {
      if (payload.auctionId === id) {
        const newEndsAt = payload.newEndsAt instanceof Date ? payload.newEndsAt : new Date(payload.newEndsAt);
        endsAtRef.current = newEndsAt;
        setCurrentRound((prev) => {
          const next = {
            roundId: payload.roundId,
            roundNumber: payload.roundNumber,
            endsAt: newEndsAt,
          };
          return prev ? { ...prev, ...next } : next;
        });
      }
      loadRoundsHistory();
      notify.info('Round extended due to last-minute bids!');
    },
    onBidPlaced: (payload: BidPlacedPayload) => {
      
      if (payload.displacedUserIds && user && payload.displacedUserIds.includes(user._id)) {
        notify.warning(
          'You were displaced from the top 100! Your bid has been refunded. Place a new bid to re-enter.',
          8000
        );
        void refreshUser();
      }
      if (user && payload.userId === user._id) {
        void refreshUser();
      }
      
      loadRoundsHistory();
    },
    onAuctionUpdated: (data) => {
      if (data._id === id) {
        setAuction((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: data.status as Auction['status'],
            currentRound: data.currentRound ?? prev.currentRound,
            totalGiftsDistributed: data.totalGiftsDistributed ?? prev.totalGiftsDistributed,
            endedAt: data.endedAt ? (data.endedAt instanceof Date ? data.endedAt : new Date(data.endedAt)) : prev.endedAt,
          };
        });
      }
    },
  });

  const loadAuction = async () => {
    if (!id) return;
    try {
      const data = await auctionsService.getById(id);
      setAuction(data);
      
      setMinBid(data.minBid);
      setMinIncrement(data.minIncrement);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load auction:', error);
      }
    }
  };

  const loadRoundsHistory = async () => {
    if (!id) return;
    try {
      const rounds = await auctionsService.getRounds(id);
      setRoundsHistory(rounds);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load rounds history:', error);
      }
    }
  };

  const loadBots = async () => {
    if (!id || !isAdmin) return;
    try {
      const data = await botsService.getAll(id);
      setBots(data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load bots:', error);
      }
    }
  };

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !bidAmount || bidding) return;

    setBidding(true);
    try {
      const amount = Number(bidAmount);
      if (isNaN(amount) || amount <= 0) {
        notify.error('Please enter a valid bid amount');
        setBidding(false);
        return;
      }

      const minRequired = bidMode === 'new' ? dynamicMinBid : minIncrement;

      if (amount < minRequired) {
        notify.error(`Minimum ${bidMode === 'new' ? 'bid' : 'increment'} is ${minRequired.toLocaleString()}`);
        setBidding(false);
        return;
      }

      const trimmedRecipient = recipientValue.trim();
      const useRecipient = recipientMode === 'other' && trimmedRecipient.length > 0;
      if (recipientMode === 'other' && !trimmedRecipient) {
        notify.error('Please enter a recipient username or Telegram ID');
        setBidding(false);
        return;
      }

      if (useRecipient) {
        const det = detectRecipient(trimmedRecipient);
        if ('error' in det) {
          notify.error(det.error);
          setBidding(false);
          return;
        }
        const lookup = await usersService.lookup({ kind: det.kind, value: det.value });
        if (!lookup.exists) {
          notify.error('Recipient user not found');
          setBidding(false);
          return;
        }
        const confirmMessage =
          bidMode === 'new'
            ? `This bid will send the gift to "${det.value}". Continue?`
            : `This raise will change the recipient to "${det.value}". Continue?`;
        if (!window.confirm(confirmMessage)) {
          setBidding(false);
          return;
        }
      }

      await bidsService.placeBid(id, {
        amount,
        mode: bidMode,
        recipient:
          useRecipient && detectedRecipient && 'kind' in detectedRecipient
            ? { kind: detectedRecipient.kind, value: detectedRecipient.value }
            : null,
      });
      setBidAmount('');
      notify.success(`Bid placed successfully! ${bidMode === 'new' ? 'Amount' : 'Raised by'}: ${amount.toLocaleString()}`);
      await refreshUser();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to place bid:', error);
      }
      const errorMessage = getApiErrorMessage(error, 'Failed to place bid');
      
      // Handle specific error codes
      if (error?.response?.data?.code) {
        const code = error.response.data.code;
        if (code === 'BID_TOO_LOW') {
          notify.error('Your bid is too low. Please increase the amount.');
        } else if (code === 'INSUFFICIENT_BALANCE') {
          notify.error('Insufficient balance. Please deposit more funds.');
        } else if (code === 'NEW_BID_NOT_ALLOWED_WHEN_ACTIVE_EXISTS') {
          notify.error('Your state is out of sync: you already have an active bid. Please retry (the UI will use raise automatically).');
        } else {
          notify.error(errorMessage);
        }
      } else {
        notify.error(errorMessage);
      }
    } finally {
      setBidding(false);
    }
  };

  const handleCreateBot = async () => {
    if (!id || !isAdmin) return;
    const name = prompt('Enter bot name:');
    if (!name) return;

    try {
      // Reserved prefix required for bot-backed users.
      const botUser = await usersService.create(`_bot${Date.now()}`, 50000);
      const bot = await botsService.create({
        name,
        type: 'simple',
        userId: botUser._id,
        auctionId: id,
        minAmount: auction?.minBid || 100,
        maxAmount: 10000,
        minInterval: 5000,
        maxInterval: 30000,
      });
      await botsService.start(bot._id);
      loadBots();
      notify.success('Bot created and started successfully');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create bot:', error);
      }
      notify.error(getApiErrorMessage(error, 'Failed to create bot'));
    }
  };

  const handleToggleBot = async (botId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await botsService.stop(botId);
        notify.info('Bot stopped');
      } else {
        await botsService.start(botId);
        notify.info('Bot started');
      }
      loadBots();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to toggle bot:', error);
      }
      notify.error(getApiErrorMessage(error, 'Failed to toggle bot'));
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (!auction) {
    return <div style={{ padding: '2rem' }}>Auction not found</div>;
  }

  // Source of truth for "current round" is WS snapshot/patch.
  // HTTP `auction.currentRound` is only a bootstrap fallback before first WS snapshot arrives.
  // Important: after a round ends WS will set roundNumber=null; we must NOT fall back to stale HTTP data.
  const currentRoundNumber =
    currentRound === null ? auction.currentRound : currentRound.roundNumber;
  const isRoundActive = currentRound?.roundId !== null && currentRound?.endsAt !== null;
  const isAuctionFinished = auction.status === 'completed' || auction.status === 'cancelled';

  const giftsDistributed =
    typeof auction.totalGiftsDistributed === 'number' && Number.isFinite(auction.totalGiftsDistributed)
      ? auction.totalGiftsDistributed
      : 0;
  const giftsRemaining = Number.isFinite(remainingSupply) ? remainingSupply : 0;
  const giftsTotal = Math.max(0, giftsDistributed + giftsRemaining);
  const giftsProgressPct = giftsTotal > 0 ? Math.min(100, Math.max(0, (giftsDistributed / giftsTotal) * 100)) : 0;

  const formatDateTime = (d: Date | null | undefined) => {
    if (!d) return '—';
    try {
      return d.toLocaleString();
    } catch {
      return String(d);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div
        style={{
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
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

        <div
          style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            color: '#666',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.875rem' }}>
            <strong>{user?.username ?? 'User'}</strong>
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            Balance:{' '}
            <strong>
              {typeof user?.balance === 'number' && Number.isFinite(user.balance) ? user.balance.toLocaleString() : '—'}
            </strong>{' '}
            Stars
          </div>
          <button
            onClick={() => navigate('/profile')}
            style={{
              padding: '0.35rem 0.6rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              whiteSpace: 'nowrap',
            }}
          >
            Profile
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginTop: 0 }}>{auction.title}</h1>
          <p style={{ color: '#666' }}>{auction.description}</p>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                padding: '0.35rem 0.6rem',
                backgroundColor: '#111827',
                color: 'white',
                borderRadius: '999px',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
              title={`Distributed: ${giftsDistributed} • Remaining: ${giftsRemaining}`}
            >
              Gifts: {giftsDistributed}/{giftsTotal}
              <span
                style={{
                  display: 'inline-block',
                  width: '72px',
                  height: '6px',
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${giftsProgressPct}%`,
                    backgroundColor: '#22c55e',
                  }}
                />
              </span>
            </div>

            <span>
              Round {currentRoundNumber ?? '—'} of {auction.totalRounds}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#666' }}>Winners: {auction.winnersPerRound}</span>
            <span style={{ fontSize: '0.875rem', color: '#666' }}>Min bid: {dynamicMinBid}</span>
            {dynamicMinBid !== minBid && <span style={{ fontSize: '0.875rem', color: '#666' }}>Base min: {minBid}</span>}
            <span style={{ fontSize: '0.875rem', color: '#666' }}>Remaining: {giftsRemaining}</span>
          </div>
        </div>
        {auction.status === 'active' ? (
          <div
            style={{
              padding: '1rem',
              backgroundColor: timeRemaining !== null && timeRemaining < 10 ? '#dc3545' : '#f8f9fa',
              borderRadius: '8px',
              textAlign: 'center',
              minWidth: '140px',
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Time Remaining</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
            </div>
            {!isRoundActive && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>No active round</div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '1rem',
              backgroundColor: isAuctionFinished ? '#f3f4f6' : '#fff3cd',
              borderRadius: '8px',
              textAlign: 'center',
              minWidth: '180px',
              border: isAuctionFinished ? '1px solid #e5e7eb' : '1px solid #ffeeba',
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.25rem' }}>Status</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {auction.status}
            </div>
            {auction.status === 'completed' && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.35rem' }}>
                Ended: {formatDateTime(auction.endedAt)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
        {/* Main Content */}
        <div>
          {/* Place Bid */}
          {auction.status === 'active' && isRoundActive && (
            <div
              style={{
                padding: '1.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                marginBottom: '2rem',
              }}
            >
              <h2 style={{ marginTop: 0 }}>Place Bid</h2>
              {hasActiveBid && myRank && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#e7f3ff', borderRadius: '4px' }}>
                  <strong>Your current bid:</strong> {myRank.amount?.toLocaleString()} (Rank: {myRank.rank ?? 'N/A'})
                </div>
              )}
              <form onSubmit={handlePlaceBid} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    backgroundColor: bidMode === 'raise' ? '#fff3cd' : '#e7f3ff',
                    color: bidMode === 'raise' ? '#856404' : '#0b4a7a',
                  }}
                >
                  <strong>Action:</strong>{' '}
                  {bidMode === 'new'
                    ? `New bid — you enter the full amount (min: ${dynamicMinBid.toLocaleString()}).`
                    : `Raise — you enter the increment/delta (min increment: ${minIncrement.toLocaleString()}).`}
                  {bidMode === 'raise' && hasActiveBid && typeof myRank?.amount === 'number' && Number.isFinite(myRank.amount) && (
                    <>
                      {' '}
                      · Current: {myRank.amount.toLocaleString()}
                      {(() => {
                        const delta = Number(bidAmount);
                        if (!Number.isFinite(delta) || delta <= 0) return null;
                        return <> · After: {(myRank.amount + delta).toLocaleString()}</>;
                      })()}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label>
                    <input
                      type="radio"
                      checked={recipientMode === 'self'}
                      onChange={() => {
                        setRecipientMode('self');
                        setRecipientValue('');
                      }}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Bid for me
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={recipientMode === 'other'}
                      onChange={() => setRecipientMode('other')}
                      style={{ marginRight: '0.5rem' }}
                    />
                    Bid for someone else
                  </label>
                </div>
                {recipientMode === 'other' && (
                  <div>
                    <label htmlFor="recipientValue" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      Recipient (username or Telegram ID)
                    </label>
                    <input
                      id="recipientValue"
                      type="text"
                      value={recipientValue}
                      onChange={(e) => setRecipientValue(e.target.value)}
                      placeholder={'e.g. alice or 123456789'}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '1rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    />
                    {detectedRecipient && (
                      <div style={{ marginTop: '0.5rem', color: 'error' in detectedRecipient ? '#dc3545' : '#666' }}>
                        {'error' in detectedRecipient
                          ? detectedRecipient.error
                          : `Detected: ${detectedRecipient.label}`}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="bidAmount" style={{ display: 'block', marginBottom: '0.5rem' }}>
                      {bidMode === 'raise' ? 'Increment (delta)' : 'Amount'}
                    </label>
                    <input
                      id="bidAmount"
                      type="number"
                      min={bidMode === 'new' ? dynamicMinBid : minIncrement}
                      step={minIncrement}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={bidMode === 'new' ? `Min: ${dynamicMinBid}` : `Min increment: ${minIncrement}`}
                      required
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontSize: '1rem',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={bidding || !bidAmount || (detectedRecipient !== null && 'error' in detectedRecipient)}
                    style={{
                      padding: '0.5rem 1.5rem',
                      fontSize: '1rem',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: bidding ? 'not-allowed' : 'pointer',
                      opacity: bidding ? 0.6 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {bidding ? 'Placing...' : bidMode === 'raise' ? 'Raise Bid' : 'Place Bid'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {auction.status === 'active' && !isRoundActive && (
            <div
              style={{
                padding: '1.5rem',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                marginBottom: '2rem',
                color: '#856404',
              }}
            >
              <strong>No active round.</strong> Waiting for next round to start...
            </div>
          )}

          {isAuctionFinished && (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                marginBottom: '2rem',
                border: '1px solid #e5e7eb',
                color: '#374151',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800 }}>
                  {auction.status === 'completed' ? 'Auction completed' : 'Auction cancelled'}
                </div>
                {auction.endedAt && <div style={{ color: '#6b7280' }}>{formatDateTime(auction.endedAt)}</div>}
              </div>
              <div style={{ marginTop: '0.5rem', color: '#6b7280' }}>
                Final result: <strong>{giftsDistributed}</strong> / {giftsTotal} gifts distributed
              </div>
            </div>
          )}

          {/* Top 100 Leaderboard */}
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Top 100 Leaderboard</h2>
            {top100.length === 0 ? (
              <p>No bids yet</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Rank</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>User</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top100.map((entry) => (
                      <tr
                        key={entry.userId}
                        style={{
                          borderBottom: '1px solid #eee',
                          backgroundColor: entry.userId === user?._id ? '#e7f3ff' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0.5rem' }}>#{entry.rank}</td>
                        <td style={{ padding: '0.5rem' }}>{entry.username || entry.userId}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{entry.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {myRank && myRank.rank === null && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  backgroundColor: '#fff3cd',
                  borderRadius: '4px',
                  color: '#856404',
                }}
              >
                You don't have an active bid right now. Submitting a bid will create a new one.
              </div>
            )}
          </div>

          {/* Rounds History */}
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              marginTop: '2rem',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Rounds History</h2>
            {roundsHistory.length === 0 ? (
              <p style={{ color: '#666' }}>No rounds yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {roundsHistory
                  .slice()
                  .sort((a, b) => b.roundNumber - a.roundNumber)
                  .map((r) => (
                    <div
                      key={r._id}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'white',
                        borderRadius: '6px',
                        border:
                          currentRound?.roundId === r._id ? '2px solid #007bff' : '1px solid #eee',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <div style={{ fontWeight: 'bold' }}>Round {r.roundNumber}</div>
                        <div style={{ fontSize: '0.875rem', color: '#666' }}>{r.status}</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                        Winners: {Array.isArray(r.winners) ? r.winners.length : 0} • Extensions: {r.extensionCount}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Bots Management (admin-only, hidden for regular users) */}
          {isAdmin && (
            <div
              style={{
                padding: '1.5rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                marginBottom: '2rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Bots (Admin)</h2>
                <button
                  onClick={handleCreateBot}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  + Create Bot
                </button>
              </div>
              {bots.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: '#666' }}>No bots created</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {bots.map((bot) => (
                    <div
                      key={bot._id}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 'bold' }}>{bot.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                          {bot.type} • {bot.totalBids} bids
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleBot(bot._id, bot.isActive)}
                        style={{
                          padding: '0.25rem 0.75rem',
                          fontSize: '0.75rem',
                          backgroundColor: bot.isActive ? '#dc3545' : '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {bot.isActive ? 'Stop' : 'Start'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auction Info */}
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Auction Info</h3>
            <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div>
                <strong>Status:</strong> {auction.status}
              </div>
              <div>
                <strong>Total Gifts Distributed:</strong> {auction.totalGiftsDistributed}
              </div>
              <div>
                <strong>Round Duration:</strong> {auction.roundDuration}s
              </div>
              <div>
                <strong>Anti-Sniping:</strong> {auction.antiSnipingWindow}s window, +{auction.antiSnipingExtension}s
              </div>
              <div>
                <strong>Remaining Supply:</strong> {remainingSupply}
              </div>
              <div>
                <strong>Dynamic Min Bid:</strong> {dynamicMinBid}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionPage;
