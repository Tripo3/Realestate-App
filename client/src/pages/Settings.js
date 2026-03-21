import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const Settings = () => {
  const { user, logout } = useAuth();
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleProfileChange = (e) =>
    setProfileForm({ ...profileForm, [e.target.name]: e.target.value });

  const handlePasswordChange = (e) =>
    setPasswordForm({ ...passwordForm, [e.target.name]: e.target.value });

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setProfileMsg('');
    try {
      await api.put('/auth/profile', profileForm);
      setProfileMsg('Profile updated successfully');
    } catch (err) {
      setProfileError(err.response?.data?.error || err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    setPasswordMsg('');
    try {
      await api.put('/auth/password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordMsg('Password changed successfully');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.error || err.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      await api.delete('/auth/account');
      logout();
    } catch (err) {
      setProfileError('Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {/* Profile Section */}
      <div className="settings-section">
        <h2>Profile</h2>
        {profileMsg && <div style={{ color: '#2ec4b6', marginBottom: '12px', fontSize: '0.9rem' }}>{profileMsg}</div>}
        {profileError && <div className="auth-error mb-16">{profileError}</div>}
        <form onSubmit={handleProfileSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name</label>
              <input name="first_name" value={profileForm.first_name} onChange={handleProfileChange} required />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input name="last_name" value={profileForm.last_name} onChange={handleProfileChange} required />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Email</label>
              <input type="email" name="email" value={profileForm.email} onChange={handleProfileChange} required />
            </div>
          </div>
          <div className="settings-section" style={{ border: 'none', boxShadow: 'none', padding: 0, margin: 0 }}>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Update Profile'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="settings-section">
        <h2>Change Password</h2>
        {passwordMsg && <div style={{ color: '#2ec4b6', marginBottom: '12px', fontSize: '0.9rem' }}>{passwordMsg}</div>}
        {passwordError && <div className="auth-error mb-16">{passwordError}</div>}
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Current Password</label>
              <input type="password" name="current_password" value={passwordForm.current_password} onChange={handlePasswordChange} required />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" name="new_password" value={passwordForm.new_password} onChange={handlePasswordChange} required placeholder="Min 6 characters" />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input type="password" name="confirm_password" value={passwordForm.confirm_password} onChange={handlePasswordChange} required />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={savingPassword}>
              {savingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="settings-section danger-zone">
        <h2>Delete Account</h2>
        <p style={{ marginBottom: '12px', fontSize: '0.9rem', color: '#666' }}>
          Once you delete your account, all of your data including properties, transactions, leases, and documents
          will be permanently removed. This action cannot be undone.
        </p>
        {!showDeleteConfirm ? (
          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete My Account
          </button>
        ) : (
          <div>
            <p style={{ marginBottom: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
              Type <strong>DELETE</strong> to confirm:
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                style={{ padding: '8px 12px', border: '1.5px solid #e63946', borderRadius: '6px', maxWidth: '200px' }}
              />
              <button
                className="btn btn-danger"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* App Info */}
      <div className="settings-section">
        <h2>About</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-item-label">Application</span>
            <span className="detail-item-value">RETracker Pro</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Version</span>
            <span className="detail-item-value">1.0.0</span>
          </div>
          <div className="detail-item">
            <span className="detail-item-label">Description</span>
            <span className="detail-item-value">Real Estate Investment Tracking Application</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
