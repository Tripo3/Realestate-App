const express = require('express');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// GET /api/reports/income-statement
router.get('/income-statement', (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date, property_id } = req.query;

    let whereClauses = ['user_id = ?'];
    const params = [req.user.id];

    if (start_date) {
      whereClauses.push('date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push('date <= ?');
      params.push(end_date);
    }
    if (property_id) {
      whereClauses.push('property_id = ?');
      params.push(property_id);
    }

    const where = whereClauses.join(' AND ');

    const income = db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE ${where} AND type = 'income'
      GROUP BY category
      ORDER BY total DESC
    `).all(...params);

    const expenses = db.prepare(`
      SELECT category, COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE ${where} AND type = 'expense'
      GROUP BY category
      ORDER BY total DESC
    `).all(...params);

    const totalIncome = income.reduce((sum, row) => sum + row.total, 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + row.total, 0);

    res.json({
      income,
      expenses,
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_income: totalIncome - totalExpenses,
    });
  } catch (err) {
    console.error('Income statement error:', err);
    res.status(500).json({ error: 'Failed to generate income statement' });
  }
});

// GET /api/reports/cash-flow
router.get('/cash-flow', (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date, property_id } = req.query;

    let whereClauses = ['user_id = ?'];
    const params = [req.user.id];

    if (start_date) {
      whereClauses.push('date >= ?');
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push('date <= ?');
      params.push(end_date);
    }
    if (property_id) {
      whereClauses.push('property_id = ?');
      params.push(property_id);
    }

    const where = whereClauses.join(' AND ');

    const monthly = db.prepare(`
      SELECT
        strftime('%Y-%m', date) as month,
        type,
        COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE ${where}
      GROUP BY month, type
      ORDER BY month ASC
    `).all(...params);

    // Reorganize into monthly cash flow
    const months = {};
    for (const row of monthly) {
      if (!months[row.month]) {
        months[row.month] = { month: row.month, income: 0, expenses: 0, net: 0 };
      }
      if (row.type === 'income') {
        months[row.month].income = row.total;
      } else {
        months[row.month].expenses = row.total;
      }
    }

    const cashFlow = Object.values(months).map(m => ({
      ...m,
      net: m.income - m.expenses,
    }));

    res.json({ cash_flow: cashFlow });
  } catch (err) {
    console.error('Cash flow report error:', err);
    res.status(500).json({ error: 'Failed to generate cash flow report' });
  }
});

// GET /api/reports/portfolio-summary
router.get('/portfolio-summary', (req, res) => {
  try {
    const db = getDb();
    const properties = db.prepare(
      "SELECT * FROM properties WHERE user_id = ? AND status = 'active'"
    ).all(req.user.id);

    let totalValue = 0;
    let totalEquity = 0;
    let totalMonthlyIncome = 0;
    let totalMonthlyExpenses = 0;
    let totalNetCashFlow = 0;
    let capRateSum = 0;
    let cashOnCashSum = 0;

    for (const p of properties) {
      const monthlyRent = p.monthly_rent || 0;
      const mortgage = p.monthly_mortgage || 0;
      const insurance = p.insurance_monthly || 0;
      const taxMonthly = (p.tax_annual || 0) / 12;
      const hoa = p.hoa_monthly || 0;
      const managementFee = monthlyRent * (p.management_fee_pct || 0) / 100;
      const vacancyRate = p.vacancy_rate || 0;
      const currentValue = p.current_value || 0;
      const purchasePrice = p.purchase_price || 0;
      const mortgageBalance = p.mortgage_balance || 0;

      const monthlyExpenses = mortgage + insurance + taxMonthly + hoa + managementFee;
      const annualGrossIncome = monthlyRent * 12;
      const effectiveGrossIncome = annualGrossIncome * (1 - vacancyRate / 100);
      const annualExpenses = monthlyExpenses * 12;
      const noi = effectiveGrossIncome - (annualExpenses - mortgage * 12);
      const capRate = currentValue > 0 ? (noi / currentValue) * 100 : 0;
      const downPayment = purchasePrice * 0.25;
      const cashOnCash = downPayment > 0 ? ((effectiveGrossIncome - annualExpenses) / downPayment) * 100 : 0;
      const netMonthlyCashFlow = (monthlyRent * (1 - vacancyRate / 100)) - monthlyExpenses;

      totalValue += currentValue;
      totalEquity += currentValue - mortgageBalance;
      totalMonthlyIncome += monthlyRent * (1 - vacancyRate / 100);
      totalMonthlyExpenses += monthlyExpenses;
      totalNetCashFlow += netMonthlyCashFlow;
      capRateSum += capRate;
      cashOnCashSum += cashOnCash;
    }

    const count = properties.length || 1;

    res.json({
      total_properties: properties.length,
      total_value: Math.round(totalValue * 100) / 100,
      total_equity: Math.round(totalEquity * 100) / 100,
      total_monthly_income: Math.round(totalMonthlyIncome * 100) / 100,
      total_monthly_expenses: Math.round(totalMonthlyExpenses * 100) / 100,
      average_cap_rate: Math.round((capRateSum / count) * 100) / 100,
      average_cash_on_cash_return: Math.round((cashOnCashSum / count) * 100) / 100,
      total_net_cash_flow: Math.round(totalNetCashFlow * 100) / 100,
    });
  } catch (err) {
    console.error('Portfolio summary error:', err);
    res.status(500).json({ error: 'Failed to generate portfolio summary' });
  }
});

// GET /api/reports/tax-summary
router.get('/tax-summary', (req, res) => {
  try {
    const db = getDb();
    const { year } = req.query;
    const taxYear = year || new Date().getFullYear().toString();

    const properties = db.prepare(
      "SELECT * FROM properties WHERE user_id = ? AND status = 'active'"
    ).all(req.user.id);

    const propertySummaries = [];

    for (const p of properties) {
      // Get income for this property in the tax year
      const income = db.prepare(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE user_id = ? AND property_id = ? AND type = 'income'
          AND date >= ? AND date <= ?
        GROUP BY category
      `).all(req.user.id, p.id, `${taxYear}-01-01`, `${taxYear}-12-31`);

      // Get expenses for this property in the tax year
      const expenses = db.prepare(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE user_id = ? AND property_id = ? AND type = 'expense'
          AND date >= ? AND date <= ?
        GROUP BY category
      `).all(req.user.id, p.id, `${taxYear}-01-01`, `${taxYear}-12-31`);

      const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
      const totalExpenses = expenses.reduce((sum, r) => sum + r.total, 0);

      // Depreciation estimate: purchase_price * 0.8 / 27.5 for residential
      const depreciation = (p.purchase_price || 0) * 0.8 / 27.5;

      propertySummaries.push({
        property_id: p.id,
        property_name: p.name,
        address: p.address,
        rental_income: totalIncome,
        expenses_by_category: expenses,
        total_expenses: totalExpenses,
        depreciation: Math.round(depreciation * 100) / 100,
        net_rental_income: Math.round((totalIncome - totalExpenses - depreciation) * 100) / 100,
      });
    }

    const grandTotalIncome = propertySummaries.reduce((s, p) => s + p.rental_income, 0);
    const grandTotalExpenses = propertySummaries.reduce((s, p) => s + p.total_expenses, 0);
    const grandTotalDepreciation = propertySummaries.reduce((s, p) => s + p.depreciation, 0);

    res.json({
      tax_year: taxYear,
      properties: propertySummaries,
      totals: {
        rental_income: grandTotalIncome,
        total_expenses: grandTotalExpenses,
        total_depreciation: Math.round(grandTotalDepreciation * 100) / 100,
        net_rental_income: Math.round((grandTotalIncome - grandTotalExpenses - grandTotalDepreciation) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Tax summary error:', err);
    res.status(500).json({ error: 'Failed to generate tax summary' });
  }
});

// GET /api/reports/property-comparison
router.get('/property-comparison', (req, res) => {
  try {
    const db = getDb();
    const properties = db.prepare(
      "SELECT * FROM properties WHERE user_id = ? AND status = 'active' ORDER BY name"
    ).all(req.user.id);

    const comparison = properties.map(p => {
      const monthlyRent = p.monthly_rent || 0;
      const mortgage = p.monthly_mortgage || 0;
      const insurance = p.insurance_monthly || 0;
      const taxMonthly = (p.tax_annual || 0) / 12;
      const hoa = p.hoa_monthly || 0;
      const managementFee = monthlyRent * (p.management_fee_pct || 0) / 100;
      const vacancyRate = p.vacancy_rate || 0;
      const currentValue = p.current_value || 0;
      const purchasePrice = p.purchase_price || 0;
      const mortgageBalance = p.mortgage_balance || 0;

      const monthlyExpenses = mortgage + insurance + taxMonthly + hoa + managementFee;
      const annualGrossIncome = monthlyRent * 12;
      const effectiveGrossIncome = annualGrossIncome * (1 - vacancyRate / 100);
      const annualExpenses = monthlyExpenses * 12;
      const noi = effectiveGrossIncome - (annualExpenses - mortgage * 12);
      const capRate = currentValue > 0 ? (noi / currentValue) * 100 : 0;
      const downPayment = purchasePrice * 0.25;
      const cashOnCash = downPayment > 0 ? ((effectiveGrossIncome - annualExpenses) / downPayment) * 100 : 0;
      const netMonthlyCashFlow = (monthlyRent * (1 - vacancyRate / 100)) - monthlyExpenses;

      return {
        id: p.id,
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        property_type: p.property_type,
        purchase_price: purchasePrice,
        current_value: currentValue,
        equity: currentValue - mortgageBalance,
        monthly_rent: monthlyRent,
        monthly_expenses: Math.round(monthlyExpenses * 100) / 100,
        net_monthly_cash_flow: Math.round(netMonthlyCashFlow * 100) / 100,
        noi: Math.round(noi * 100) / 100,
        cap_rate: Math.round(capRate * 100) / 100,
        cash_on_cash_return: Math.round(cashOnCash * 100) / 100,
        vacancy_rate: vacancyRate,
      };
    });

    res.json({ properties: comparison });
  } catch (err) {
    console.error('Property comparison error:', err);
    res.status(500).json({ error: 'Failed to generate property comparison' });
  }
});

module.exports = router;
