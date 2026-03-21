import React from 'react';

const KPICard = ({ label, value, subtitle, color = '#4361ee', icon }) => {
  return (
    <div className="kpi-card" style={{ borderTopColor: color }}>
      <div className="kpi-card-header">
        {icon && <span className="kpi-icon" style={{ color }}>{icon}</span>}
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {subtitle && <div className="kpi-subtitle">{subtitle}</div>}
    </div>
  );
};

export default KPICard;
