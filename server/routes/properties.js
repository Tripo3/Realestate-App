const express = require('express');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply auth to all routes
router.use(authenticateToken);

function computeMetrics(property) {
  const monthlyRent = property.monthly_rent || 0;
  const mortgage = property.monthly_mortgage || 0;
  const insurance = property.insurance_monthly || 0;
  const taxMonthly = (property.tax_annual || 0) / 12;
  const hoa = property.hoa_monthly || 0;
  const managementFee = monthlyRent * (property.management_fee_pct || 0) / 100;
  const vacancyRate = property.vacancy_rate || 0;
  const purchasePrice = property.purchase_price || 0;
  const currentValue = property.current_value || 0;

  const monthlyExpenses = mortgage + insurance + taxMonthly + hoa + managementFee;
  const annualGrossIncome = monthlyRent * 12;
  const effectiveGrossIncome = annualGrossIncome * (1 - vacancyRate / 100);
  const annualExpenses = monthlyExpenses * 12;

  // NOI excludes debt service
  const noi = effectiveGrossIncome - (annualExpenses - mortgage * 12);

  const capRate = currentValue > 0 ? (noi / currentValue) * 100 : 0;

  // Assuming 25% down payment
  const downPayment = purchasePrice * 0.25;
  const cashOnCashReturn = downPayment > 0
    ? ((effectiveGrossIncome - annualExpenses) / downPayment) * 100
    : 0;

  const netMonthlyCashFlow = (monthlyRent * (1 - vacancyRate / 100)) - monthlyExpenses;

  return {
    monthly_expenses: Math.round(monthlyExpenses * 100) / 100,
    annual_gross_income: Math.round(annualGrossIncome * 100) / 100,
    effective_gross_income: Math.round(effectiveGrossIncome * 100) / 100,
    annual_expenses: Math.round(annualExpenses * 100) / 100,
    noi: Math.round(noi * 100) / 100,
    cap_rate: Math.round(capRate * 100) / 100,
    cash_on_cash_return: Math.round(cashOnCashReturn * 100) / 100,
    net_monthly_cash_flow: Math.round(netMonthlyCashFlow * 100) / 100
  };
}

// GET /api/properties
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const properties = db.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ properties });
  } catch (err) {
    console.error('List properties error:', err);
    res.status(500).json({ error: 'Failed to list properties' });
  }
});

// GET /api/properties/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const property = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const metrics = computeMetrics(property);
    res.json({ property: { ...property, ...metrics } });
  } catch (err) {
    console.error('Get property error:', err);
    res.status(500).json({ error: 'Failed to get property' });
  }
});

// POST /api/properties
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      name, address, city, state, zip, property_type,
      purchase_date, purchase_price, current_value, mortgage_balance,
      monthly_mortgage, monthly_rent, vacancy_rate, management_fee_pct,
      insurance_monthly, tax_annual, hoa_monthly, notes, status
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Property name is required' });
    }

    const result = db.prepare(`
      INSERT INTO properties (user_id, name, address, city, state, zip, property_type,
        purchase_date, purchase_price, current_value, mortgage_balance,
        monthly_mortgage, monthly_rent, vacancy_rate, management_fee_pct,
        insurance_monthly, tax_annual, hoa_monthly, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, name, address || null, city || null, state || null, zip || null,
      property_type || 'Single Family', purchase_date || null,
      purchase_price || null, current_value || null, mortgage_balance || null,
      monthly_mortgage || null, monthly_rent || null, vacancy_rate ?? 5,
      management_fee_pct ?? 0, insurance_monthly ?? 0, tax_annual ?? 0,
      hoa_monthly ?? 0, notes || null, status || 'active'
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ property });
  } catch (err) {
    console.error('Create property error:', err);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// PUT /api/properties/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const {
      name, address, city, state, zip, property_type,
      purchase_date, purchase_price, current_value, mortgage_balance,
      monthly_mortgage, monthly_rent, vacancy_rate, management_fee_pct,
      insurance_monthly, tax_annual, hoa_monthly, notes, status
    } = req.body;

    db.prepare(`
      UPDATE properties SET
        name = ?, address = ?, city = ?, state = ?, zip = ?, property_type = ?,
        purchase_date = ?, purchase_price = ?, current_value = ?, mortgage_balance = ?,
        monthly_mortgage = ?, monthly_rent = ?, vacancy_rate = ?, management_fee_pct = ?,
        insurance_monthly = ?, tax_annual = ?, hoa_monthly = ?, notes = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      name ?? existing.name, address ?? existing.address, city ?? existing.city,
      state ?? existing.state, zip ?? existing.zip, property_type ?? existing.property_type,
      purchase_date ?? existing.purchase_date, purchase_price ?? existing.purchase_price,
      current_value ?? existing.current_value, mortgage_balance ?? existing.mortgage_balance,
      monthly_mortgage ?? existing.monthly_mortgage, monthly_rent ?? existing.monthly_rent,
      vacancy_rate ?? existing.vacancy_rate, management_fee_pct ?? existing.management_fee_pct,
      insurance_monthly ?? existing.insurance_monthly, tax_annual ?? existing.tax_annual,
      hoa_monthly ?? existing.hoa_monthly, notes ?? existing.notes, status ?? existing.status,
      req.params.id, req.user.id
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
    res.json({ property });
  } catch (err) {
    console.error('Update property error:', err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// DELETE /api/properties/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    db.prepare('DELETE FROM properties WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Property deleted successfully' });
  } catch (err) {
    console.error('Delete property error:', err);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// GET /api/properties/:id/summary
router.get('/:id/summary', (req, res) => {
  try {
    const db = getDb();
    const property = db.prepare('SELECT * FROM properties WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const income = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE property_id = ? AND user_id = ? AND type = 'income'
    `).get(req.params.id, req.user.id);

    const expenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE property_id = ? AND user_id = ? AND type = 'expense'
    `).get(req.params.id, req.user.id);

    const byCategory = db.prepare(`
      SELECT category, type, COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE property_id = ? AND user_id = ?
      GROUP BY category, type
      ORDER BY total DESC
    `).all(req.params.id, req.user.id);

    const recentTransactions = db.prepare(`
      SELECT * FROM transactions
      WHERE property_id = ? AND user_id = ?
      ORDER BY date DESC
      LIMIT 10
    `).all(req.params.id, req.user.id);

    const metrics = computeMetrics(property);

    res.json({
      property,
      metrics,
      financial_summary: {
        total_income: income.total,
        total_expenses: expenses.total,
        net_income: income.total - expenses.total,
        by_category: byCategory
      },
      recent_transactions: recentTransactions
    });
  } catch (err) {
    console.error('Property summary error:', err);
    res.status(500).json({ error: 'Failed to get property summary' });
  }
});

module.exports = router;
