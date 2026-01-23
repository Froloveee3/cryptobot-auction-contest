import React, { useEffect, useState } from 'react';
import { Auction } from '../types';

interface AuctionCardProps {
  auction: Auction;
  onClick: () => void;
}

export const AuctionCard: React.FC<AuctionCardProps> = ({ auction, onClick }) => {
  const [nowMs, setNowMs] = useState(Date.now());
  const isFinished = auction.status === 'completed' || auction.status === 'cancelled';

  useEffect(() => {
    if (!auction.currentRoundEndsAt || auction.status !== 'active') return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [auction.currentRoundEndsAt, auction.status]);
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#28a745';
      case 'completed':
        return '#6c757d';
      case 'draft':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatTimeLeft = (endsAt?: Date | null) => {
    if (!endsAt) return null;
    const remainingSec = Math.max(0, Math.floor((endsAt.getTime() - nowMs) / 1000));
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeLeft =
    auction.status === 'active' && auction.currentRoundEndsAt
      ? formatTimeLeft(auction.currentRoundEndsAt)
      : null;

  const giftsDistributed =
    typeof auction.totalGiftsDistributed === 'number' && Number.isFinite(auction.totalGiftsDistributed)
      ? auction.totalGiftsDistributed
      : 0;
  const giftsRemaining =
    typeof auction.remainingSupply === 'number' && Number.isFinite(auction.remainingSupply) ? auction.remainingSupply : 0;
  const giftsTotal = Math.max(0, giftsDistributed + giftsRemaining);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '1.5rem',
        border: isFinished ? '1px solid #e5e7eb' : '1px solid #ddd',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        backgroundColor: isFinished ? '#f9fafb' : '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
      onMouseEnter={(e) => {
        if (isFinished) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          return;
        }
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1.25rem', color: '#333' }}>
            {auction.title}
          </h3>
          <p
            style={{
              color: '#666',
              marginBottom: '0.75rem',
              fontSize: '0.9rem',
              lineHeight: '1.5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {auction.description}
          </p>
        </div>
        <span
          style={{
            padding: '0.375rem 0.75rem',
            borderRadius: '6px',
            backgroundColor: getStatusColor(auction.status),
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {auction.status}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.75rem',
          fontSize: '0.875rem',
          color: '#666',
          paddingTop: '0.75rem',
          borderTop: '1px solid #eee',
        }}
      >
        {giftsTotal > 0 && (
          <div>
            <strong style={{ color: '#333' }}>Gifts:</strong> {giftsDistributed}/{giftsTotal}
          </div>
        )}
        <div>
          <strong style={{ color: '#333' }}>Rounds:</strong> {auction.currentRound}/{auction.totalRounds}
        </div>
        <div>
          <strong style={{ color: '#333' }}>Winners:</strong> {auction.winnersPerRound}/round
        </div>
        {typeof auction.remainingSupply === 'number' && (
          <div>
            <strong style={{ color: '#333' }}>Supply:</strong> {auction.remainingSupply}
          </div>
        )}
        {timeLeft && (
          <div>
            <strong style={{ color: '#333' }}>Ends in:</strong> {timeLeft}
          </div>
        )}
      </div>

      {(auction.startedAt || auction.endedAt) && (
        <div style={{ fontSize: '0.8rem', color: '#999', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
          {auction.startedAt && <div>Started: {formatDate(auction.startedAt)}</div>}
          {auction.endedAt && <div>Ended: {formatDate(auction.endedAt)}</div>}
        </div>
      )}
    </div>
  );
};
