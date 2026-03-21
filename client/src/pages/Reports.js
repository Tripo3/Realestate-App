import React, { useState, useEffect, useCallback } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const fmt = (v) =>
  '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtPct = (v) => Number(v || 0).toFixed(1) + '%';

const COLORS = ['#4361ee', '#2ec4b6', '#e63946', '#f4a261', '#7209b7', '#4895ef', '#3a0ca3', '#f72585', '#560bad', '#90be6d'];

const Reports = () => {
  const [activeTab, setActiveTab] = useState('income-statement');
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [cashFlowData, setCashFlowData] = useState([]);
  const [taxData, setTaxData] = useState(null);
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });

  const loadProperties = useCallback(async () => {
    try {
      const res = await api.get('/properties');
      setProperties(Array.isArray(res.data) ? res.data : res.data.properties || []);
    } catch (err) { /* ignore */ }
  }, []);

  const loadIncomeStatement = useCallback(async () => {
    try {
      const res = await api.get(`/reports/income-statement?start_date=${dateRange.start_date}&end_date=${dateRange.end_date}`);
      setReportData(res.data);
    } catch (err) {
      setReportData({ income: {}, expenses: {}, total_income: 0, total_expenses: 0, net_income: 0 });
    }
  }, [dateRange]);

  const loadCashFlow = useCallback(async () => {
    try {
      const res = await api.get('/reports/cash-flow?months=12');
      setCashFlowData(res.data.monthly || res.data || []);
    } catch (err) {
      setCashFlowData([]);
    }
  }, []);

  const loadTaxSummary = useCallback(async () => {
    try {
      const res = await api.get(`/reports/tax-summary?year=${new Date(dateRange.start_date).getFullYear()}`);
      setTaxData(res.data);
    } catch (err) {
      setTaxData({ properties: [] });
    }
  }, [dateRange]);

  useEffect(() => {
    const init = async () => {
      await loadProperties();
      setLoading(false);
    };
    init();
  }, [loadProperties]);

  useEffect(() => {
    if (activeTab === 'income-statement') loadIncomeStatement();
    if (activeTab === 'cash-flow') loadCashFlow();
    if (activeTab === 'tax-summary') loadTaxSummary();
  }, [activeTab, loadIncomeStatement, loadCashFlow, loadTaxSummary]);

  if (loading) return <LoadingSpinner size="large" message="Loading reports..." />;

  const tabs = [
    { key: 'income-statement', label: 'Income Statement' },
    { key: 'cash-flow', label: 'Cash Flow' },
    { key: 'tax-summary', label: 'Tax Summary' },
    { key: 'property-comparison', label: 'Property Comparison' },
  ];

  const incomeData = reportData || {};
  const incomeCategories = Object.entries(incomeData.income || {});
  const expenseCategories = Object.entries(incomeData.expenses || {});
  const totalIncome = incomeData.total_income || incomeCategories.reduce((s, [, v]) => s + Number(v), 0);
  const totalExpenses = incomeData.total_expenses || expenseCategories.reduce((s, [, v]) => s + Number(v), 0);
  const netIncome = incomeData.net_income || totalIncome - totalExpenses;

  const expensePieData = expenseCategories.map(([name, value]) => ({ name, value: Math.abs(Number(value)) }));

  let runningTotal = 0;
  const cashFlowWithRunning = cashFlowData.map((m) => {
    runningTotal += Number(m.net || 0);
    return { ...m, running_total: runningTotal };
  });

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {/* Income Statement */}
        {activeTab === 'income-statement' && (
          <>
            <div className="report-date-range">
              <div className="form-group">
                <label>From</label>
                <input
                  type="date"
                  value={dateRange.start_date}
                  onChange={(e) => setDateRange({ ...dateRange, start_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>To</label>
                <input
                  type="date"
                  value={dateRange.end_date}
                  onChange={(e) => setDateRange({ ...dateRange, end_date: e.target.value })}
                />
              </div>
              <button className="btn btn-primary" onClick={loadIncomeStatement}>
                Update
              </button>
            </div>

            <div className="charts-row">
              <div className="card">
                <div className="card-header"><h2>Income Statement</h2></div>
                <div className="report-category-header">Income</div>
                {incomeCategories.length === 0 ? (
                  <div className="report-line-item"><span>No income recorded</span><span>$0</span></div>
                ) : (
                  incomeCategories.map(([cat, val]) => (
                    <div key={cat} className="report-line-item">
                      <span>{cat}</span><span className="amount-income">{fmt(val)}</span>
                    </div>
                  ))
                )}
                <div className="report-subtotal"><span>Total Income</span><span className="amount-income">{fmt(totalIncome)}</span></div>

                <div className="report-category-header">Expenses</div>
                {expenseCategories.length === 0 ? (
                  <div className="report-line-item"><span>No expenses recorded</span><span>$0</span></div>
                ) : (
                  expenseCategories.map(([cat, val]) => (
                    <div key={cat} className="report-line-item">
                      <span>{cat}</span><span className="amount-expense">{fmt(Math.abs(val))}</span>
                    </div>
                  ))
                )}
                <div className="report-subtotal"><span>Total Expenses</span><span className="amount-expense">{fmt(totalExpenses)}</span></div>

                <div className="report-summary-row">
                  <span>Net Income</span>
                  <span className={netIncome >= 0 ? 'amount-income' : 'amount-expense'}>{fmt(netIncome)}</span>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h2>Expense Breakdown</h2></div>
                {expensePieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={expensePieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {expensePieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state"><p>No expense data to display</p></div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Cash Flow */}
        {activeTab === 'cash-flow' && (
          <>
            <div className="chart-container">
              <h3>Monthly Income vs Expenses & Net Cash Flow</h3>
              {cashFlowWithRunning.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={cashFlowWithRunning}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="income" fill="#2ec4b6" name="Income" />
                    <Bar dataKey="expenses" fill="#e63946" name="Expenses" />
                    <Line type="monotone" dataKey="net" stroke="#4361ee" strokeWidth={2} name="Net Cash Flow" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state"><p>No cash flow data available</p></div>
              )}
            </div>

            <div className="card">
              <div className="card-header"><h2>Running Totals</h2></div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Month</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Net</th><th className="text-right">Running Total</th></tr>
                  </thead>
                  <tbody>
                    {cashFlowWithRunning.length === 0 ? (
                      <tr><td colSpan="5" className="text-center text-muted" style={{ padding: '32px' }}>No data</td></tr>
                    ) : (
                      cashFlowWithRunning.map((m, i) => (
                        <tr key={i}>
                          <td>{m.month}</td>
                          <td className="text-right amount-income">{fmt(m.income)}</td>
                          <td className="text-right amount-expense">{fmt(m.expenses)}</td>
                          <td className={`text-right ${Number(m.net || 0) >= 0 ? 'amount-income' : 'amount-expense'}`}>{fmt(m.net)}</td>
                          <td className={`text-right font-bold ${m.running_total >= 0 ? 'amount-income' : 'amount-expense'}`}>{fmt(m.running_total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Tax Summary */}
        {activeTab === 'tax-summary' && (
          <>
            <div className="report-date-range">
              <div className="form-group">
                <label>Tax Year</label>
                <select
                  value={new Date(dateRange.start_date).getFullYear()}
                  onChange={(e) => {
                    const year = e.target.value;
                    setDateRange({
                      start_date: `${year}-01-01`,
                      end_date: `${year}-12-31`,
                    });
                  }}
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h2>Schedule E - Rental Income and Expenses</h2></div>
              {(taxData?.properties || []).length === 0 && properties.length === 0 ? (
                <div className="empty-state"><p>No property data for tax summary</p></div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        {(taxData?.properties || properties).map((p) => (
                          <th key={p.id || p.property_id} className="text-right">{p.name || p.property_name}</th>
                        ))}
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="report-category-header">
                        <td colSpan={(taxData?.properties || properties).length + 2}><strong>Rental Income</strong></td>
                      </tr>
                      <tr>
                        <td>Gross Rent</td>
                        {(taxData?.properties || properties).map((p) => (
                          <td key={p.id || p.property_id} className="text-right">{fmt(p.rental_income || p.monthly_rent * 12)}</td>
                        ))}
                        <td className="text-right font-bold">
                          {fmt((taxData?.properties || properties).reduce((s, p) => s + Number(p.rental_income || p.monthly_rent * 12 || 0), 0))}
                        </td>
                      </tr>
                      <tr className="report-category-header">
                        <td colSpan={(taxData?.properties || properties).length + 2}><strong>Expenses</strong></td>
                      </tr>
                      {['Mortgage Interest', 'Insurance', 'Property Tax', 'Repairs', 'Maintenance', 'Management', 'HOA', 'Utilities', 'Depreciation'].map((cat) => (
                        <tr key={cat}>
                          <td>{cat}</td>
                          {(taxData?.properties || properties).map((p) => {
                            const expenses = p.expenses || {};
                            return <td key={p.id || p.property_id} className="text-right">{fmt(expenses[cat] || 0)}</td>;
                          })}
                          <td className="text-right">
                            {fmt((taxData?.properties || properties).reduce((s, p) => s + Number((p.expenses || {})[cat] || 0), 0))}
                          </td>
                        </tr>
                      ))}
                      <tr className="table-summary">
                        <td><strong>Total Expenses</strong></td>
                        {(taxData?.properties || properties).map((p) => (
                          <td key={p.id || p.property_id} className="text-right font-bold amount-expense">
                            {fmt(p.total_expenses || Object.values(p.expenses || {}).reduce((s, v) => s + Number(v), 0))}
                          </td>
                        ))}
                        <td className="text-right font-bold amount-expense">
                          {fmt((taxData?.properties || properties).reduce(
                            (s, p) => s + Number(p.total_expenses || Object.values(p.expenses || {}).reduce((ss, v) => ss + Number(v), 0)),
                            0
                          ))}
                        </td>
                      </tr>
                      <tr className="table-summary">
                        <td><strong>Net Rental Income</strong></td>
                        {(taxData?.properties || properties).map((p) => {
                          const income = Number(p.rental_income || p.monthly_rent * 12 || 0);
                          const exp = Number(p.total_expenses || Object.values(p.expenses || {}).reduce((s, v) => s + Number(v), 0));
                          const net = income - exp;
                          return <td key={p.id || p.property_id} className={`text-right font-bold ${net >= 0 ? 'amount-income' : 'amount-expense'}`}>{fmt(net)}</td>;
                        })}
                        <td className="text-right font-bold">
                          {fmt((taxData?.properties || properties).reduce((s, p) => {
                            const income = Number(p.rental_income || p.monthly_rent * 12 || 0);
                            const exp = Number(p.total_expenses || Object.values(p.expenses || {}).reduce((ss, v) => ss + Number(v), 0));
                            return s + income - exp;
                          }, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Property Comparison */}
        {activeTab === 'property-comparison' && (
          <div className="card">
            <div className="card-header"><h2>Property Comparison</h2></div>
            {properties.length === 0 ? (
              <div className="empty-state"><p>No properties to compare</p></div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {properties.map((p) => <th key={p.id} className="text-right">{p.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Current Value</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt(p.current_value)}</td>)}</tr>
                    <tr><td>Purchase Price</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt(p.purchase_price)}</td>)}</tr>
                    <tr><td>Mortgage Balance</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt(p.mortgage_balance)}</td>)}</tr>
                    <tr><td>Equity</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt((p.current_value || 0) - (p.mortgage_balance || 0))}</td>)}</tr>
                    <tr><td>Monthly Rent</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt(p.monthly_rent)}</td>)}</tr>
                    <tr><td>Monthly Mortgage</td>{properties.map((p) => <td key={p.id} className="text-right">{fmt(p.monthly_mortgage)}</td>)}</tr>
                    <tr><td>Net Cash Flow</td>{properties.map((p) => <td key={p.id} className={`text-right ${Number(p.net_cash_flow || 0) >= 0 ? 'amount-income' : 'amount-expense'}`}>{fmt(p.net_cash_flow)}</td>)}</tr>
                    <tr><td>Cap Rate</td>{properties.map((p) => <td key={p.id} className="text-right">{fmtPct(p.cap_rate)}</td>)}</tr>
                    <tr><td>Cash on Cash Return</td>{properties.map((p) => <td key={p.id} className="text-right">{fmtPct(p.cash_on_cash_return)}</td>)}</tr>
                    <tr><td>Vacancy Rate</td>{properties.map((p) => <td key={p.id} className="text-right">{fmtPct(p.vacancy_rate)}</td>)}</tr>
                    <tr><td>Status</td>{properties.map((p) => <td key={p.id} className="text-right"><span className={`badge badge-${(p.status || 'active').toLowerCase()}`}>{p.status || 'Active'}</span></td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
