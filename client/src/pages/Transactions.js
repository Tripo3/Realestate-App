import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const CATEGORIES = ['Rent', 'Mortgage', 'Insurance', 'Property Tax', 'Repairs', 'Maintenance', 'Utilities', 'HOA', 'Management', 'Depreciation', 'Other'];
const PER_PAGE = 20;

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const [selected, setSelected] = useState(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [filters, setFilters] = useState({
    property_id: '', type: '', category: '', start_date: '', end_date: '',
  });

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '', amount: '', type: 'expense', category: '', property_id: '',
  });

  const loadTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', PER_PAGE);
      params.append('sort', sortField);
      params.append('order', sortDir);
      if (filters.property_id) params.append('property_id', filters.property_id);
      if (filters.type) params.append('type', filters.type);
      if (filters.category) params.append('category', filters.category);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);

      const res = await api.get(`/transactions?${params.toString()}`);
      const data = res.data;
      setTransactions(data.transactions || data || []);
      setTotalCount(data.total || data.count || (data.transactions || data || []).length);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, sortField, sortDir, filters]);

  const loadProperties = useCallback(async () => {
    try {
      const res = await api.get('/properties');
      setProperties(Array.isArray(res.data) ? res.data : res.data.properties || []);
    } catch (err) { /* ignore */ }
  }, []);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };

  const handleFormChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const openAddModal = () => {
    setEditingTx(null);
    setForm({
      date: new Date().toISOString().split('T')[0],
      description: '', amount: '', type: 'expense', category: '', property_id: '',
    });
    setShowModal(true);
    setError('');
  };

  const openEditModal = (tx) => {
    setEditingTx(tx);
    setForm({
      date: tx.date ? tx.date.split('T')[0] : '',
      description: tx.description || '',
      amount: Math.abs(tx.amount) || '',
      type: tx.type || 'expense',
      category: tx.category || '',
      property_id: tx.property_id || '',
    });
    setShowModal(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingTx) {
        await api.put(`/transactions/${editingTx.id}`, form);
      } else {
        await api.post('/transactions', form);
      }
      setShowModal(false);
      loadTransactions();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (txId) => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/transactions/${txId}`);
      loadTransactions();
    } catch (err) {
      setError('Failed to delete transaction');
    }
  };

  // Multi-select handlers
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((tx) => tx.id)));
    }
  };

  const handleBulkUpdate = async (updates) => {
    setBulkUpdating(true);
    setError('');
    try {
      await api.post('/transactions/batch-update', {
        transaction_ids: Array.from(selected),
        ...updates,
      });
      setSelected(new Set());
      loadTransactions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update transactions');
    } finally {
      setBulkUpdating(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Description', 'Property', 'Category', 'Type', 'Amount'];
    const rows = transactions.map((tx) => [
      tx.date ? new Date(tx.date).toLocaleDateString() : '',
      `"${(tx.description || '').replace(/"/g, '""')}"`,
      `"${(tx.property_name || '').replace(/"/g, '""')}"`,
      tx.category || '',
      tx.type || '',
      tx.amount || 0,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalCount / PER_PAGE);
  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

  if (loading) return <LoadingSpinner size="large" message="Loading transactions..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Transactions</h1>
        <div className="page-header-actions">
          <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-primary" onClick={openAddModal}>+ Add Transaction</button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="form-group">
          <label>Property</label>
          <select value={filters.property_id} onChange={(e) => handleFilterChange('property_id', e.target.value)}>
            <option value="">All Properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={filters.type} onChange={(e) => handleFilterChange('type', e.target.value)}>
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="form-group">
          <label>Category</label>
          <select value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>From</label>
          <input type="date" value={filters.start_date} onChange={(e) => handleFilterChange('start_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>To</label>
          <input type="date" value={filters.end_date} onChange={(e) => handleFilterChange('end_date', e.target.value)} />
        </div>
      </div>

      {error && <div className="auth-error mb-16">{error}</div>}

      {selected.size > 0 && (
        <div className="bulk-toolbar">
          <span className="bulk-toolbar-count">{selected.size} selected</span>
          <div className="bulk-toolbar-actions">
            <label>
              Property:
              <select
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value !== '') handleBulkUpdate({ property_id: e.target.value });
                }}
              >
                <option value="" disabled>Assign...</option>
                <option value="">None</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              Type:
              <select
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleBulkUpdate({ type: e.target.value });
                }}
              >
                <option value="" disabled>Change...</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label>
              Category:
              <select
                disabled={bulkUpdating}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value !== '') handleBulkUpdate({ category: e.target.value });
                }}
              >
                <option value="" disabled>Set...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setSelected(new Set())}
          >
            Clear Selection
          </button>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={transactions.length > 0 && selected.size === transactions.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="sortable" onClick={() => handleSort('date')}>
                  Date {sortField === 'date' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                </th>
                <th className="sortable" onClick={() => handleSort('description')}>
                  Description {sortField === 'description' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                </th>
                <th>Property</th>
                <th className="sortable" onClick={() => handleSort('category')}>
                  Category {sortField === 'category' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                </th>
                <th>Type</th>
                <th className="sortable text-right" onClick={() => handleSort('amount')}>
                  Amount {sortField === 'amount' ? (sortDir === 'asc' ? '\u2191' : '\u2193') : ''}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan="8" className="text-center text-muted" style={{ padding: '32px' }}>No transactions found.</td></tr>
              ) : (
                <>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={selected.has(tx.id) ? 'row-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                        />
                      </td>
                      <td>{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</td>
                      <td>{tx.description}</td>
                      <td>{tx.property_name || '-'}</td>
                      <td>{tx.category || 'Uncategorized'}</td>
                      <td><span className={`badge badge-${tx.type}`}>{tx.type}</span></td>
                      <td className={`text-right ${tx.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEditModal(tx)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tx.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="table-summary">
                    <td></td>
                    <td colSpan="5" className="text-right"><strong>Totals:</strong></td>
                    <td className="text-right">
                      <span className="amount-income">+{fmt(totalIncome)}</span>
                      {' / '}
                      <span className="amount-expense">-{fmt(totalExpense)}</span>
                    </td>
                    <td></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p;
              if (totalPages <= 7) { p = i + 1; }
              else if (page <= 4) { p = i + 1; }
              else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
              else { p = page - 3 + i; }
              return (
                <button key={p} className={page === p ? 'active' : ''} onClick={() => setPage(p)}>
                  {p}
                </button>
              );
            })}
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
            <span className="pagination-info">Page {page} of {totalPages} ({totalCount} total)</span>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingTx ? 'Edit Transaction' : 'Add Transaction'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : editingTx ? 'Save Changes' : 'Add Transaction'}
            </button>
          </>
        }
      >
        {error && <div className="auth-error mb-16">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input type="date" name="date" value={form.date} onChange={handleFormChange} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select name="type" value={form.type} onChange={handleFormChange}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input name="description" value={form.description} onChange={handleFormChange} required placeholder="e.g. Monthly rent payment" />
            </div>
            <div className="form-group">
              <label>Amount ($)</label>
              <input type="number" name="amount" value={form.amount} onChange={handleFormChange} required step="0.01" min="0" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select name="category" value={form.category} onChange={handleFormChange}>
                <option value="">Select...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Property</label>
              <select name="property_id" value={form.property_id} onChange={handleFormChange}>
                <option value="">No property</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Transactions;
