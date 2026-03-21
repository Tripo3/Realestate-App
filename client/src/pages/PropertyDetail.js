import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Modal from '../components/Modal';
import KPICard from '../components/KPICard';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (v) => Number(v || 0).toFixed(1) + '%';

const CATEGORIES = [
  'Mortgage Payment', 'Property Tax', 'Insurance', 'HOA Fees', 'Property Management',
  'Repairs & Maintenance', 'Utilities', 'Advertising', 'Legal & Professional',
  'Cleaning & Landscaping', 'Capital Improvements', 'Other Expense', 'Rental Income', 'Other Income',
];

const PropertyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [leases, setLeases] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '', amount: '', category: '', type: 'expense', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [propRes, txRes, leaseRes, docRes] = await Promise.all([
        api.get(`/properties/${id}`),
        api.get(`/transactions?property_id=${id}&limit=50`),
        api.get(`/leases?property_id=${id}`),
        api.get(`/documents?property_id=${id}`),
      ]);
      const p = propRes.data.property || propRes.data;
      setProperty(p);
      setEditForm(p);
      setTransactions(txRes.data.transactions || txRes.data || []);
      setLeases(leaseRes.data.leases || leaseRes.data || []);
      setDocuments(docRes.data.documents || docRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEditSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/properties/${id}`, editForm);
      setShowEditModal(false);
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this property? This cannot be undone.')) return;
    try {
      await api.delete(`/properties/${id}`);
      navigate('/properties');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTx = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await api.post('/transactions', { ...txForm, property_id: id });
      setShowTxModal(false);
      setTxForm({
        date: new Date().toISOString().split('T')[0],
        description: '', amount: '', category: '', type: 'expense', notes: '',
      });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('property_id', id);
    formData.append('category', 'Other');
    try {
      await api.post('/documents/upload', formData);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <LoadingSpinner size="large" message="Loading property..." />;
  if (!property) return <div><h2>Property not found</h2></div>;

  const p = property;
  const appreciation = p.current_value && p.purchase_price
    ? ((p.current_value - p.purchase_price) / p.purchase_price * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/properties')}
            style={{ marginBottom: 8 }}
          >
            &#8592; Back to Properties
          </button>
          <h1>{p.name}</h1>
          <p className="text-muted">{p.address}, {p.city}, {p.state} {p.zip}</p>
        </div>
        <div className="page-header-actions">
          <span className={`badge badge-${p.status === 'active' ? 'active' : p.status === 'vacant' ? 'yellow' : 'gray'}`}>
            {p.status}
          </span>
          <button className="btn btn-secondary" onClick={() => setShowEditModal(true)}>Edit</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="kpi-grid">
        <KPICard label="Purchase Price" value={fmt(p.purchase_price)} icon="$" color="#4361ee" />
        <KPICard
          label="Current Value" value={fmt(p.current_value)}
          subtitle={`${appreciation >= 0 ? '+' : ''}${appreciation.toFixed(1)}%`}
          icon="$" color="#3a0ca3"
        />
        <KPICard label="Monthly Rent" value={fmt(p.monthly_rent)} icon="$" color="#2ec4b6" />
        <KPICard
          label="Net Cash Flow"
          value={fmt(p.net_monthly_cash_flow) + '/mo'}
          icon={p.net_monthly_cash_flow >= 0 ? '+' : '-'}
          color={p.net_monthly_cash_flow >= 0 ? '#2ec4b6' : '#e63946'}
        />
        <KPICard label="NOI" value={fmt(p.noi) + '/yr'} icon="$" color="#7209b7" />
        <KPICard label="Cap Rate" value={fmtPct(p.cap_rate)} icon="%" color="#f72585" />
        <KPICard label="Cash on Cash" value={fmtPct(p.cash_on_cash_return)} icon="%" color="#4895ef" />
        <KPICard label="Monthly Expenses" value={fmt(p.monthly_expenses)} icon="$" color="#e63946" />
      </div>

      <div className="tabs">
        {['overview', 'transactions', 'leases', 'documents'].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="card">
          <div className="detail-grid">
            <div><label>Type</label><span>{p.property_type}</span></div>
            <div><label>Purchase Date</label><span>{p.purchase_date || 'N/A'}</span></div>
            <div><label>Mortgage Balance</label><span>{fmt(p.mortgage_balance)}</span></div>
            <div><label>Monthly Mortgage</label><span>{fmt(p.monthly_mortgage)}</span></div>
            <div><label>Vacancy Rate</label><span>{fmtPct(p.vacancy_rate)}</span></div>
            <div><label>Management Fee</label><span>{fmtPct(p.management_fee_pct)}</span></div>
            <div><label>Monthly Insurance</label><span>{fmt(p.insurance_monthly)}</span></div>
            <div><label>Annual Tax</label><span>{fmt(p.tax_annual)}</span></div>
            <div><label>Monthly HOA</label><span>{fmt(p.hoa_monthly)}</span></div>
            <div><label>Equity</label><span>{fmt((p.current_value || 0) - (p.mortgage_balance || 0))}</span></div>
          </div>
          {p.notes && (
            <div style={{ marginTop: 16, padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
              <h4>Notes</h4>
              <p>{p.notes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="card">
          <div className="card-header">
            <h2>Transactions</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowTxModal(true)}>+ Add Transaction</button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th className="text-right">Amount</th></tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted" style={{ padding: 32 }}>No transactions</td></tr>
                ) : transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>{tx.description}</td>
                    <td><span className="badge">{tx.category || 'Uncategorized'}</span></td>
                    <td className={`text-right ${tx.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                      {tx.type === 'income' ? '+' : '-'}{fmt(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'leases' && (
        <div className="card">
          <h3>Leases</h3>
          {leases.length === 0 ? (
            <p className="text-center text-muted">No leases</p>
          ) : leases.map((l) => (
            <div key={l.id} className="lease-item">
              <div className="lease-header">
                <strong>{l.tenant_name}</strong>
                <span className={`badge badge-${l.status === 'active' ? 'active' : 'gray'}`}>{l.status}</span>
              </div>
              <div className="lease-details">
                <span>Rent: {fmt(l.monthly_rent)}/mo</span>
                <span>Deposit: {fmt(l.security_deposit)}</span>
                <span>{l.start_date} to {l.end_date}</span>
              </div>
              {l.tenant_email && <p className="text-muted">{l.tenant_email} | {l.tenant_phone}</p>}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="card">
          <div className="card-header">
            <h2>Documents</h2>
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              Upload <input type="file" hidden onChange={handleFileUpload} />
            </label>
          </div>
          {documents.length === 0 ? (
            <p className="text-center text-muted">No documents</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Name</th><th>Category</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.original_name}</td>
                      <td><span className="badge">{d.category}</span></td>
                      <td>{(d.file_size / 1024).toFixed(1)} KB</td>
                      <td>{new Date(d.uploaded_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => window.open(`/api/documents/${d.id}/download`)}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Property"
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEditSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        <form onSubmit={handleEditSave}>
          <div className="form-group">
            <label>Name</label>
            <input value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Current Value ($)</label>
              <input type="number" value={editForm.current_value || ''} onChange={(e) => setEditForm({ ...editForm, current_value: e.target.value })} step="0.01" />
            </div>
            <div className="form-group">
              <label>Monthly Rent ($)</label>
              <input type="number" value={editForm.monthly_rent || ''} onChange={(e) => setEditForm({ ...editForm, monthly_rent: e.target.value })} step="0.01" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Mortgage Balance ($)</label>
              <input type="number" value={editForm.mortgage_balance || ''} onChange={(e) => setEditForm({ ...editForm, mortgage_balance: e.target.value })} step="0.01" />
            </div>
            <div className="form-group">
              <label>Monthly Mortgage ($)</label>
              <input type="number" value={editForm.monthly_mortgage || ''} onChange={(e) => setEditForm({ ...editForm, monthly_mortgage: e.target.value })} step="0.01" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Insurance/mo ($)</label>
              <input type="number" value={editForm.insurance_monthly || ''} onChange={(e) => setEditForm({ ...editForm, insurance_monthly: e.target.value })} step="0.01" />
            </div>
            <div className="form-group">
              <label>Annual Tax ($)</label>
              <input type="number" value={editForm.tax_annual || ''} onChange={(e) => setEditForm({ ...editForm, tax_annual: e.target.value })} step="0.01" />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>HOA/mo ($)</label>
              <input type="number" value={editForm.hoa_monthly || ''} onChange={(e) => setEditForm({ ...editForm, hoa_monthly: e.target.value })} step="0.01" />
            </div>
            <div className="form-group">
              <label>Vacancy Rate (%)</label>
              <input type="number" value={editForm.vacancy_rate || ''} onChange={(e) => setEditForm({ ...editForm, vacancy_rate: e.target.value })} step="0.1" />
            </div>
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="vacant">Vacant</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows="3" />
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showTxModal}
        onClose={() => setShowTxModal(false)}
        title="Add Transaction"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowTxModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddTx} disabled={saving}>
              {saving ? 'Saving...' : 'Add Transaction'}
            </button>
          </>
        }
      >
        <form onSubmit={handleAddTx}>
          <div className="form-grid">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={txForm.date} onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} required placeholder="Description" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Amount ($)</label>
              <input type="number" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} step="0.01" required />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}>
                <option value="">Select...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} rows="2" />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PropertyDetail;
