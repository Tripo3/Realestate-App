import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import api from '../utils/api';
import KPICard from '../components/KPICard';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  v != null
    ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '$0';

const fmtPct = (v) => (v != null ? Number(v).toFixed(1) + '%' : '0.0%');

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [cashFlow, setCashFlow] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const [sumRes, cfRes, txRes, propRes] = await Promise.all([
        api.get('/reports/portfolio-summary').catch(() => ({ data: {} })),
        api.get('/reports/cash-flow?months=12').catch(() => ({ data: { monthly: [] } })),
        api.get('/transactions?limit=10').catch(() => ({ data: { transactions: [] } })),
        api.get('/properties').catch(() => ({ data: [] })),
      ]);
      setSummary(sumRes.data);
      setCashFlow(cfRes.data.monthly || cfRes.data || []);
      setTransactions(txRes.data.transactions || txRes.data || []);
      setProperties(Array.isArray(propRes.data) ? propRes.data : propRes.data.properties || []);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <LoadingSpinner size="large" message="Loading dashboard..." />;

  const s = summary || {};

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {error && <div className="auth-error mb-16">{error}</div>}

      <div className="kpi-grid">
        <KPICard
          label="Total Portfolio Value"
          value={fmt(s.total_value)}
          icon="$"
          color="#4361ee"
          subtitle="Across all properties"
        />
        <KPICard
          label="Total Equity"
          value={fmt(s.total_equity)}
          icon="$"
          color="#3a0ca3"
          subtitle="Value minus mortgages"
        />
        <KPICard
          label="Monthly Cash Flow"
          value={fmt(s.total_net_cash_flow)}
          icon={s.total_net_cash_flow >= 0 ? '+' : '-'}
          color={s.total_net_cash_flow >= 0 ? '#2ec4b6' : '#e63946'}
          subtitle="Net monthly income"
        />
        <KPICard
          label="Avg Cash on Cash"
          value={fmtPct(s.avg_cash_on_cash)}
          icon="%"
          color="#7209b7"
          subtitle="Return on investment"
        />
        <KPICard
          label="Avg Cap Rate"
          value={fmtPct(s.avg_cap_rate)}
          icon="%"
          color="#f72585"
          subtitle="NOI / Property value"
        />
        <KPICard
          label="Total Properties"
          value={s.total_properties || properties.length || 0}
          icon="#"
          color="#4895ef"
          subtitle="In your portfolio"
        />
      </div>

      <div className="charts-row">
        <div className="chart-container">
          <h3>Monthly Cash Flow</h3>
          {cashFlow.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Bar dataKey="income" fill="#2ec4b6" name="Income" />
                <Bar dataKey="expenses" fill="#e63946" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <p>No cash flow data yet</p>
            </div>
          )}
        </div>

        <div className="chart-container">
          <h3>Income vs Expenses</h3>
          {cashFlow.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={cashFlow}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#2ec4b6"
                  fill="#2ec4b6"
                  fillOpacity={0.3}
                  name="Income"
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#e63946"
                  fill="#e63946"
                  fillOpacity={0.15}
                  name="Expenses"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <p>No data available</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent Transactions</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Property</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-muted" style={{ padding: '32px' }}>
                    No transactions yet. Connect a bank or add manually.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{new Date(tx.date).toLocaleDateString()}</td>
                    <td>{tx.description}</td>
                    <td>{tx.property_name || '-'}</td>
                    <td>
                      <span className={`badge badge-${tx.type === 'income' ? 'income' : 'expense'}`}>
                        {tx.category || 'Uncategorized'}
                      </span>
                    </td>
                    <td className={`text-right ${tx.type === 'income' ? 'amount-income' : 'amount-expense'}`}>
                      {tx.type === 'income' ? '+' : '-'}
                      {fmt(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Property Performance</h2>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th className="text-right">Value</th>
                <th className="text-right">Monthly Rent</th>
                <th className="text-right">Net Cash Flow</th>
                <th className="text-right">Cap Rate</th>
                <th className="text-right">Cash on Cash</th>
              </tr>
            </thead>
            <tbody>
              {properties.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted" style={{ padding: '32px' }}>
                    No properties added yet.
                  </td>
                </tr>
              ) : (
                properties.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/properties/${p.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{p.name}</strong>
                      <br />
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                        {p.address}
                      </span>
                    </td>
                    <td className="text-right">{fmt(p.current_value)}</td>
                    <td className="text-right">{fmt(p.monthly_rent)}</td>
                    <td className={`text-right ${p.net_cash_flow >= 0 ? 'amount-income' : 'amount-expense'}`}>
                      {fmt(p.net_cash_flow)}
                    </td>
                    <td className="text-right">{fmtPct(p.cap_rate)}</td>
                    <td className="text-right">{fmtPct(p.cash_on_cash_return)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
