import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import api from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const PlaidLinkButton = ({ onSuccess: onSuccessProp }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);

  const fetchLinkToken = async () => {
    setLoadingToken(true);
    try {
      const res = await api.post('/plaid/create-link-token');
      setLinkToken(res.data.link_token);
    } catch (err) {
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
    <button
      className="btn btn-primary"
      onClick={fetchLinkToken}
      disabled={loadingToken}
    >
      {loadingToken ? 'Connecting...' : '+ Connect Bank Account'}
    </button>
  );
};

const BankConnections = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [error, setError] = useState('');

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

  if (loading) return <LoadingSpinner size="large" message="Loading bank connections..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Bank Connections</h1>
        <div className="page-header-actions">
          <PlaidLinkButton onSuccess={loadConnections} />
        </div>
      </div>

      {error && <div className="auth-error mb-16">{error}</div>}

      {connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\u229E'}</div>
          <h3>No bank accounts connected</h3>
          <p>Connect your bank account to automatically import transactions.</p>
          <PlaidLinkButton onSuccess={loadConnections} />
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
                      {acc.name || acc.official_name} ({acc.type}) ****{acc.mask}
                    </span>
                  ))}
                  {!conn.accounts && conn.account_name && (
                    <span>{conn.account_name} ({conn.account_type}) ****{conn.mask}</span>
                  )}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>
                  {conn.last_synced
                    ? `Last synced: ${new Date(conn.last_synced).toLocaleString()}`
                    : 'Not yet synced'}
                </p>
              </div>
            </div>
            <div className="bank-card-actions">
              <span className={`badge ${conn.status === 'active' || !conn.status ? 'badge-active' : 'badge-yellow'}`}>
                {conn.status || 'Connected'}
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => handleSync(conn.id)}
                disabled={syncing[conn.id]}
              >
                {syncing[conn.id] ? 'Syncing...' : 'Sync Transactions'}
              </button>
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
