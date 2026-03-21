import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtPct = (v) => Number(v || 0).toFixed(1) + '%';

const emptyProperty = {
  name: '', address: '', city: '', state: '', zip: '', property_type: 'Single Family',
  purchase_date: '', purchase_price: '', current_value: '', mortgage_balance: '',
  monthly_mortgage: '', monthly_rent: '', vacancy_rate: 5, management_fee_pct: 0,
  insurance_monthly: '', tax_annual: '', hoa_monthly: '', notes: '',
};

const statusBadge = (status) => {
  const s = (status || 'active').toLowerCase();
  if (s === 'active') return 'badge badge-active';
  if (s === 'vacant') return 'badge badge-yellow';
  return 'badge badge-gray';
};

const Properties = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyProperty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadProperties = useCallback(async () => {
    try {
      const res = await api.get('/properties');
      setProperties(Array.isArray(res.data) ? res.data : res.data.properties || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/properties', form);
      setShowModal(false);
      setForm(emptyProperty);
      loadProperties();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to add property');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner size="large" message="Loading properties..." />;

  return (
    <div>
      <div className="page-header">
        <h1>Properties</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Add Property
          </button>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\u2302'}</div>
          <h3>No properties yet</h3>
          <p>Add your first property to start tracking your investments.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Add Property
          </button>
        </div>
      ) : (
        <div className="property-grid">
          {properties.map((p) => (
            <div
              key={p.id}
              className="property-card"
              onClick={() => navigate(`/properties/${p.id}`)}
            >
              <div className="property-card-header">
                <span className="property-card-name">{p.name}</span>
                <span className={statusBadge(p.status)}>
                  {p.status || 'Active'}
                </span>
              </div>
              <div className="property-card-address">
                {p.address}, {p.city}, {p.state} {p.zip}
              </div>
              <div className="property-card-metrics">
                <div className="property-metric">
                  <span className="property-metric-label">Value</span>
                  <span className="property-metric-value">{fmt(p.current_value)}</span>
                </div>
                <div className="property-metric">
                  <span className="property-metric-label">Monthly Rent</span>
                  <span className="property-metric-value">{fmt(p.monthly_rent)}/mo</span>
                </div>
                <div className="property-metric">
                  <span className="property-metric-label">Net Cash Flow</span>
                  <span
                    className={`property-metric-value ${
                      (p.net_cash_flow || 0) >= 0 ? 'amount-income' : 'amount-expense'
                    }`}
                  >
                    {fmt(p.net_cash_flow)}/mo
                  </span>
                </div>
                <div className="property-metric">
                  <span className="property-metric-label">Cap Rate</span>
                  <span className="property-metric-value">{fmtPct(p.cap_rate)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setError(''); }}
        title="Add New Property"
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving...' : 'Add Property'}
            </button>
          </>
        }
      >
        {error && <div className="auth-error mb-16">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Property Name</label>
              <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. 123 Main St Rental" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Address</label>
              <input name="address" value={form.address} onChange={handleChange} required placeholder="123 Main St" />
            </div>
            <div className="form-group">
              <label>City</label>
              <input name="city" value={form.city} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>State</label>
              <input name="state" value={form.state} onChange={handleChange} required maxLength="2" placeholder="CA" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>ZIP Code</label>
              <input name="zip" value={form.zip} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Property Type</label>
              <select name="property_type" value={form.property_type} onChange={handleChange}>
                <option>Single Family</option>
                <option>Multi-Family</option>
                <option>Condo</option>
                <option>Townhouse</option>
                <option>Commercial</option>
              </select>
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Purchase Date</label>
              <input type="date" name="purchase_date" value={form.purchase_date} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Purchase Price ($)</label>
              <input type="number" name="purchase_price" value={form.purchase_price} onChange={handleChange} step="0.01" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Current Value ($)</label>
              <input type="number" name="current_value" value={form.current_value} onChange={handleChange} step="0.01" />
            </div>
            <div className="form-group">
              <label>Mortgage Balance ($)</label>
              <input type="number" name="mortgage_balance" value={form.mortgage_balance} onChange={handleChange} step="0.01" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Monthly Mortgage ($)</label>
              <input type="number" name="monthly_mortgage" value={form.monthly_mortgage} onChange={handleChange} step="0.01" />
            </div>
            <div className="form-group">
              <label>Monthly Rent ($)</label>
              <input type="number" name="monthly_rent" value={form.monthly_rent} onChange={handleChange} step="0.01" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Vacancy Rate (%)</label>
              <input type="number" name="vacancy_rate" value={form.vacancy_rate} onChange={handleChange} step="0.1" />
            </div>
            <div className="form-group">
              <label>Management Fee (%)</label>
              <input type="number" name="management_fee_pct" value={form.management_fee_pct} onChange={handleChange} step="0.1" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Monthly Insurance ($)</label>
              <input type="number" name="insurance_monthly" value={form.insurance_monthly} onChange={handleChange} step="0.01" />
            </div>
            <div className="form-group">
              <label>Annual Property Tax ($)</label>
              <input type="number" name="tax_annual" value={form.tax_annual} onChange={handleChange} step="0.01" />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label>Monthly HOA ($)</label>
              <input type="number" name="hoa_monthly" value={form.hoa_monthly} onChange={handleChange} step="0.01" />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows="3" placeholder="Optional notes..." />
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Properties;
