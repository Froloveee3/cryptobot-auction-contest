import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auctionsService } from '../services/auctions.service';
import { CreateAuctionDto } from '../types';
import { getApiErrorMessage } from '../utils/apiError';
import { useAuth } from '../context/AuthContext';

const CreateAuction: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateAuctionDto>({
    title: '',
    description: '',
    totalRounds: 5,
    winnersPerRound: 3,
    roundDuration: 60, 
    minBid: 100,
    minIncrement: 10,
    antiSnipingWindow: 10,
    antiSnipingExtension: 30,
    botsEnabled: false,
    botsCount: 6,
  });
  const draftSaveTimer = useRef<number | null>(null);
  const hasUserEditsRef = useRef(false);
  const latestFormDataRef = useRef<CreateAuctionDto>(formData);

  const getDraftStorageKey = (userId?: string) => `auctionDraft:${userId || 'unknown'}`;
  const stripLegacyFields = (dto: CreateAuctionDto): CreateAuctionDto => {
    // We intentionally hide/remove legacy settings from the UI.
    // Backend has a safe default for maxRoundExtensions, so omit it from drafts and create payloads.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { maxRoundExtensions, ...rest } = dto as any;
    // If bots are disabled, omit botsCount as well (backend will ignore, but keep payload clean)
    if (!rest.botsEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { botsCount, ...withoutBotsCount } = rest as any;
      return withoutBotsCount as CreateAuctionDto;
    }
    return rest as CreateAuctionDto;
  };

  useEffect(() => {
    let mounted = true;
    const loadDraft = async () => {
      const key = getDraftStorageKey(user?._id);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const draftRaw = JSON.parse(raw) as CreateAuctionDto;
          const draft = stripLegacyFields(draftRaw);
          if (mounted) {
            setFormData({
              ...draft,
              title: String((draft as any).title ?? ''),
              description: String((draft as any).description ?? ''),
            });
          }
          return;
        } catch {
          // fall through to server
        }
      }
      try {
        const draft = await auctionsService.getMyDraft();
        if (!mounted || !draft) return;
        const dtoRaw: CreateAuctionDto = {
          title: String(draft.title ?? ''),
          description: String(draft.description ?? ''),
          totalRounds: draft.totalRounds,
          winnersPerRound: draft.winnersPerRound,
          roundDuration: draft.roundDuration,
          minBid: draft.minBid,
          minIncrement: draft.minIncrement,
          antiSnipingWindow: draft.antiSnipingWindow,
          antiSnipingExtension: draft.antiSnipingExtension,
          botsEnabled: Boolean((draft as any).botsEnabled),
        };
        const dto = stripLegacyFields(dtoRaw);
        localStorage.setItem(key, JSON.stringify(dto));
        setFormData(dto);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load draft:', error);
        }
      }
    };
    void loadDraft();
    return () => {
      mounted = false;
    };
  }, [user?._id]);

  useEffect(() => {
    const key = getDraftStorageKey(user?._id);
    if (draftSaveTimer.current) {
      window.clearTimeout(draftSaveTimer.current);
    }
    draftSaveTimer.current = window.setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(formData));
    }, 100);
    return () => {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
      }
    };
  }, [formData, user?._id]);

  useEffect(() => {
    latestFormDataRef.current = formData;
  }, [formData]);

  useEffect(() => {
    return () => {
      const latest = latestFormDataRef.current;
      if (!hasUserEditsRef.current) return;
      void auctionsService.saveDraft(stripLegacyFields(latest));
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const auction = await auctionsService.create(stripLegacyFields(formData));
      // Start auction immediately
      await auctionsService.start(auction._id);
      const key = getDraftStorageKey(user?._id);
      localStorage.removeItem(key);
      navigate(`/auctions/${auction._id}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create auction:', error);
      }
      alert(getApiErrorMessage(error, 'Failed to create auction'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value } = target;
    hasUserEditsRef.current = true;
    const numericFields = new Set([
      'totalRounds',
      'winnersPerRound',
      'roundDuration',
      'minBid',
      'minIncrement',
      'antiSnipingWindow',
      'antiSnipingExtension',
      'botsCount',
    ]);
    setFormData((prev) => ({
      ...prev,
      [name]:
        target.type === 'checkbox'
          ? target.checked
          : numericFields.has(name)
            ? Number(value)
            : value,
    }));
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
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
      </div>

      <h1>Create New Auction</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            id="botsEnabled"
            name="botsEnabled"
            type="checkbox"
            checked={Boolean((formData as any).botsEnabled)}
            onChange={handleChange}
          />
          <label htmlFor="botsEnabled" style={{ margin: 0 }}>
            Enable bots (adds light simulated competition)
          </label>
        </div>

        {Boolean((formData as any).botsEnabled) && (
          <div>
            <label htmlFor="botsCount" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Bots count (participants)
            </label>
            <input
              id="botsCount"
              name="botsCount"
              type="number"
              min="0"
              max="50"
              value={Number.isFinite(Number((formData as any).botsCount)) ? Number((formData as any).botsCount) : 0}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>
        )}

        <div>
          <label htmlFor="title" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={formData.title}
            onChange={handleChange}
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

        <div>
          <label htmlFor="description" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Description *
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
            rows={4}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label htmlFor="totalRounds" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Total Rounds *
            </label>
            <input
              id="totalRounds"
              name="totalRounds"
              type="number"
              min="1"
              value={formData.totalRounds}
              onChange={handleChange}
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

          <div>
            <label htmlFor="winnersPerRound" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Winners per Round *
            </label>
            <input
              id="winnersPerRound"
              name="winnersPerRound"
              type="number"
              min="1"
              value={formData.winnersPerRound}
              onChange={handleChange}
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label htmlFor="roundDuration" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Round Duration (seconds) *
            </label>
            <input
              id="roundDuration"
              name="roundDuration"
              type="number"
              min="10"
              value={formData.roundDuration}
              onChange={handleChange}
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

          <div>
            <label htmlFor="minBid" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Minimum Bid *
            </label>
            <input
              id="minBid"
              name="minBid"
              type="number"
              min="1"
              value={formData.minBid}
              onChange={handleChange}
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label htmlFor="minIncrement" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Minimum Increment *
            </label>
            <input
              id="minIncrement"
              name="minIncrement"
              type="number"
              min="1"
              value={formData.minIncrement}
              onChange={handleChange}
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

          <div>
            <label htmlFor="antiSnipingWindow" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Anti-Sniping Window (seconds)
            </label>
            <input
              id="antiSnipingWindow"
              name="antiSnipingWindow"
              type="number"
              min="1"
              value={formData.antiSnipingWindow}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor="antiSnipingExtension" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Anti-Sniping Extension (seconds)
          </label>
          <input
            id="antiSnipingExtension"
            name="antiSnipingExtension"
            type="number"
            min="1"
            value={formData.antiSnipingExtension}
            onChange={handleChange}
            style={{
              width: '100%',
              padding: '0.5rem',
              fontSize: '1rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create and Start Auction'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateAuction;
