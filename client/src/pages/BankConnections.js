import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const PlaidLinkButton = ({ onSuccess: onSuccessProp }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState('');

  const fetchLinkToken = async () => {
    setLoadingToken(true);
    setError('');
    try {
      const res = await api.post('/plaid/create-link-token');
      setLinkToken(res.data.link_token);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to connect to bank service';
      setError(message);
      console.error('Failed to get link token:', err);
    } finally {
      setLoadingToken(false);
    }
  };

  const onSuccess = useCallback(
    async (publicToken, metadata) => {
      try {
        await api.post('/plaid/exchange-token', {
          public_token: publicToken,
          institution: metadata.institution,
          accounts: metadata.accounts,
        });
        onSuccessProp();
      } catch (err) {
        console.error('Token exchange failed:', err);
      }
    },
    [onSuccessProp]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {},
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  return (
    <div>
      <button
        className="btn btn-outline btn-sm"
        onClick={fetchLinkToken}
        disabled={loadingToken}
      >
        {loadingToken ? 'Connecting...' : 'Connect via Plaid'}
      </button>
      {error && <div className="auth-error" style={{ marginTop: '8px', fontSize: '0.85rem' }}>{error}</div>}
    </div>
  );
};

const ManualAccountForm = ({ onSuccess, onCancel }) => {
  const [form, setForm] = useState({
    institution_name: '',
    account_name: '',
    account_type: 'checking',
    mask: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.institution_name.trim() || !form.account_name.trim()) {
      setError('Bank name and account name are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/plaid/manual-account', form);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>Add Bank Account Manually</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Bank / Institution Name *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Chase, Bank of America, Wells Fargo"
            value={form.institution_name}
            onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Account Name *</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. Primary Checking, Rental Savings"
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Account Type</label>
            <select
              className="form-input"
              value={form.account_type}
              onChange={(e) => setForm({ ...form, account_type: e.target.value })}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="mortgage">Mortgage</option>
              <option value="investment">Investment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Last 4 Digits (optional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="1234"
              maxLength={4}
              value={form.mask}
              onChange={(e) => setForm({ ...form, mask: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </div>
        {error && <div className="auth-error" style={{ marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Account'}
          </button>
          <button className="btn btn-outline" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const BankConnections = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [error, setError] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const res = await api.get('/plaid/connections');
      setConnections(res.data.connections || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleSync = async (connectionId) => {
    setSyncing({ ...syncing, [connectionId]: true });
    try {
      await api.post(`/plaid/sync/${connectionId}`);
      setError('');
    } catch (err) {
      setError('Failed to sync transactions');
    } finally {
      setSyncing({ ...syncing, [connectionId]: false });
    }
  };

  const handleDisconnect = async (connectionId) => {
    if (!window.confirm('Disconnect this bank account? This will not delete previously synced transactions.')) return;
    try {
      await api.delete(`/plaid/connections/${connectionId}`);
      loadConnections();
    } catch (err) {
      setError('Failed to disconnect');
    }
  };

  const handleManualSuccess = () => {
    setShowManualForm(false);
    loadConnections();
  };

  if (loading) return <LoadingSpinner size="large" message="Loading bank connections..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Bank Connections</h1>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-primary"
            onClick={() => setShowManualForm(true)}
            disabled={showManualForm}
          >
            + Add Bank Account
          </button>
          <PlaidLinkButton onSuccess={loadConnections} />
        </div>
      </div>

      {error && <div className="auth-error mb-16">{error}</div>}

      {showManualForm && (
        <ManualAccountForm
          onSuccess={handleManualSuccess}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      {connections.length === 0 && !showManualForm ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\u229E'}</div>
          <h3>No bank accounts connected</h3>
          <p>Add your bank account manually or connect automatically via Plaid.</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setShowManualForm(true)}>
              + Add Bank Account
            </button>
            <PlaidLinkButton onSuccess={loadConnections} />
          </div>
        </div>
      ) : (
        connections.map((conn) => (
          <div key={conn.id} className="bank-card">
            <div className="bank-card-info">
              <div className="bank-card-icon">{'\u{1F3E6}'}</div>
              <div className="bank-card-details">
                <h3>{conn.institution_name || conn.institution?.name || 'Bank Account'}</h3>
                <p>
                  {(conn.accounts || []).map((acc) => (
                    <span key={acc.id || acc.account_id} style={{ marginRight: '16px' }}>
                      {acc.name || acc.official_name} ({acc.type}){acc.mask ? ` ****${acc.mask}` : ''}
                    </span>
                  ))}
                  {!conn.accounts && conn.account_name && (
                    <span>{conn.account_name} ({conn.account_type}){conn.mask ? ` ****${conn.mask}` : ''}</span>
                  )}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                  {conn.is_manual
                    ? 'Manually added'
                    : conn.last_synced
                      ? `Last synced: ${new Date(conn.last_synced).toLocaleString()}`
                      : 'Not yet synced'}
                </p>
              </div>
            </div>
            <div className="bank-card-actions">
              <span className={`badge ${conn.is_manual ? 'badge-yellow' : conn.status === 'active' || !conn.status ? 'badge-active' : 'badge-yellow'}`}>
                {conn.is_manual ? 'Manual' : conn.status || 'Connected'}
              </span>
              {!conn.is_manual && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleSync(conn.id)}
                  disabled={syncing[conn.id]}
                >
                  {syncing[conn.id] ? 'Syncing...' : 'Sync Transactions'}
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDisconnect(conn.id)}
              >
                Disconnect
              </button>
            </div>
          </div>
        ))
      )}

      <div className="security-info">
        <h3>{'\u{1F512}'} Bank-Level Security</h3>
        <p>
          Your bank credentials are never stored on our servers. We use Plaid, a bank-level
          encrypted service trusted by millions, to securely connect to your financial institution.
          Only read-only transaction data is accessed. Your login credentials are encrypted
          end-to-end and never touch our servers.
        </p>
      </div>
    </div>
  );
};

export default BankConnections;
