import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '\u25C9' },
  { path: '/properties', label: 'Properties', icon: '\u2302' },
  { path: '/transactions', label: 'Transactions', icon: '\u21C4' },
  { path: '/reports', label: 'Reports', icon: '\u25C8' },
  { path: '/bank-connections', label: 'Bank Connections', icon: '\u229E' },
  { path: '/documents', label: 'Documents', icon: '\u22A1' },
  { path: '/leases', label: 'Leases', icon: '\u229F' },
  { path: '/settings', label: 'Settings', icon: '\u2699' },
];

const Sidebar = () => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <button
        className="hamburger-btn"
        onClick={() => setCollapsed(!collapsed)}
        aria-label="Toggle menu"
      >
        {collapsed ? '\u2630' : '\u2715'}
      </button>
      <aside className={`sidebar ${collapsed ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <h1>RETracker Pro</h1>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
              onClick={() => setCollapsed(false)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">
              {user?.first_name?.[0] || user?.email?.[0] || 'U'}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">
                {user?.first_name
                  ? `${user.first_name} ${user.last_name || ''}`
                  : user?.email || 'User'}
              </span>
              <span className="sidebar-user-email">{user?.email}</span>
            </div>
          </div>
          <button className="sidebar-logout" onClick={logout} title="Logout">
            Logout
          </button>
        </div>
      </aside>
      {collapsed && (
        <div className="sidebar-overlay" onClick={() => setCollapsed(false)} />
      )}
    </>
  );
};

export default Sidebar;
