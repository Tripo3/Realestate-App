import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const Leases = () => {
  const [leases, setLeases] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLease, setEditLease] = useState(null);
  const [form, setForm] = useState({
    property_id: '', tenant_name: '', tenant_email: '', tenant_phone: '',
    start_date: '', end_date: '', monthly_rent: '', security_deposit: '', status: 'active', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [leaseRes, propRes] = await Promise.all([api.get('/leases'), api.get('/properties')]);
      setLeases(leaseRes.data.leases || leaseRes.data || []);
      const pd = propRes.data;
      setProperties(Array.isArray(pd) ? pd : pd.properties || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      if (editLease) await api.put(`/leases/${editLease.id}`, form);
      else await api.post('/leases', form);
      setShowModal(false);
      setEditLease(null);
      setForm({ property_id: '', tenant_name: '', tenant_email: '', tenant_phone: '', start_date: '', end_date: '', monthly_rent: '', security_deposit: '', status: 'active', notes: '' });
      loadData();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleEdit = (lease) => { setEditLease(lease); setForm({ ...lease }); setShowModal(true); };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lease?')) return;
    try { await api.delete(`/leases/${id}`); loadData(); } catch (err) { console.error(err); }
  };

  const getDaysRemaining = (endDate) => {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate) - new Date()) / 86400000);
  };

  const getLeaseStatus = (lease) => {
    const days = getDaysRemaining(lease.end_date);
    if (lease.status === 'expired' || (days !== null && days < 0)) return 'expired';
    if (days !== null && days <= 30) return 'expiring';
    return lease.status;
  };

  if (loading) return <LoadingSpinner size="large" message="Loading leases..." />;

  const grouped = {};
  leases.forEach((l) => {
    const name = properties.find((p) => p.id === l.property_id)?.name || 'Unassigned';
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(l);
  });

  return (
    <div>
      <div className="page-header">
        <h1>Leases</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => { setEditLease(null); setShowModal(true); }}>+ Add Lease</button>
        </div>
      </div>

      {leases.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\u229F'}</div>
          <h3>No Leases</h3>
          <p>Add lease agreements to track tenants and rental income.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Lease</button>
        </div>
      ) : (
        Object.entries(grouped).map(([propName, propLeases]) => (
          <div key={propName} className="card">
            <div className="card-header"><h2>{propName}</h2></div>
            {propLeases.map((lease) => {
              const status = getLeaseStatus(lease);
              const daysLeft = getDaysRemaining(lease.end_date);
              return (
                <div key={lease.id} className="lease-item">
                  <div className="lease-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>{lease.tenant_name}</strong>
                      <span className={`badge badge-${status === 'active' ? 'active' : status === 'expiring' ? 'yellow' : 'gray'}`}>{status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => handleEdit(lease)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(lease.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="lease-details">
                    <span>Rent: {fmt(lease.monthly_rent)}/mo</span>
                    <span>Deposit: {fmt(lease.security_deposit)}</span>
                    <span>{lease.start_date} to {lease.end_date}</span>
                    {daysLeft !== null && <span className={daysLeft < 30 ? 'amount-expense' : 'amount-income'}>{daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'}</span>}
                  </div>
                  {(lease.tenant_email || lease.tenant_phone) && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{lease.tenant_email}{lease.tenant_email && lease.tenant_phone ? ' | ' : ''}{lease.tenant_phone}</p>}
                  {lease.notes && <p className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>{lease.notes}</p>}
                </div>
              );
            })}
          </div>
        ))
      )}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditLease(null); }} title={editLease ? 'Edit Lease' : 'Add Lease'}
        footer={<><button className="btn btn-secondary" onClick={() => { setShowModal(false); setEditLease(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : editLease ? 'Update' : 'Add Lease'}</button></>}>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Property</label><select value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })} required><option value="">Select Property...</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="form-group"><label>Tenant Name</label><input value={form.tenant_name} onChange={(e) => setForm({ ...form, tenant_name: e.target.value })} required /></div>
          <div className="form-grid"><div className="form-group"><label>Email</label><input type="email" value={form.tenant_email} onChange={(e) => setForm({ ...form, tenant_email: e.target.value })} /></div><div className="form-group"><label>Phone</label><input value={form.tenant_phone} onChange={(e) => setForm({ ...form, tenant_phone: e.target.value })} /></div></div>
          <div className="form-grid"><div className="form-group"><label>Start Date</label><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required /></div><div className="form-group"><label>End Date</label><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required /></div></div>
          <div className="form-grid"><div className="form-group"><label>Monthly Rent ($)</label><input type="number" value={form.monthly_rent} onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })} step="0.01" required /></div><div className="form-group"><label>Security Deposit ($)</label><input type="number" value={form.security_deposit} onChange={(e) => setForm({ ...form, security_deposit: e.target.value })} step="0.01" /></div></div>
          <div className="form-group"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="expired">Expired</option><option value="upcoming">Upcoming</option></select></div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="2" /></div>
        </form>
      </Modal>
    </div>
  );
};

export default Leases;
