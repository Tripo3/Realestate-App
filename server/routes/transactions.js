const express = require('express');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

const CATEGORIES = [
  'Mortgage Payment',
  'Property Tax',
  'Insurance',
  'HOA Fees',
  'Property Management',
  'Repairs & Maintenance',
  'Utilities',
  'Advertising',
  'Legal & Professional',
  'Office Expenses',
  'Travel',
  'Cleaning & Landscaping',
  'Capital Improvements',
  'Other Expense',
  'Rental Income',
  'Other Income'
];

// GET /api/transactions/categories
router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

// GET /api/transactions
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { property_id, type, category, start_date, end_date, search, limit, offset } = req.query;

    let sql = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [req.user.id];

    if (property_id) {
      sql += ' AND property_id = ?';
      params.push(property_id);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (start_date) {
      sql += ' AND date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND date <= ?';
      params.push(end_date);
    }
    if (search) {
      sql += ' AND (description LIKE ? OR notes LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get total count
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const { total } = db.prepare(countSql).get(...params);

    sql += ' ORDER BY date DESC';

    if (limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(limit));
    }
    if (offset) {
      sql += ' OFFSET ?';
      params.push(parseInt(offset));
    }

    const transactions = db.prepare(sql).all(...params);

    res.json({ transactions, total });
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ error: 'Failed to list transactions' });
  }
});

// POST /api/transactions
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { property_id, date, description, amount, category, type, account_name, notes } = req.body;

    if (!date || amount === undefined || !type) {
      return res.status(400).json({ error: 'Date, amount, and type are required' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Type must be income or expense' });
    }

    const result = db.prepare(`
      INSERT INTO transactions (user_id, property_id, date, description, amount, category, type, account_name, is_manual, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(req.user.id, property_id || null, date, description || null, amount, category || null, type, account_name || null, notes || null);

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ transaction });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const { property_id, date, description, amount, category, type, account_name, notes } = req.body;

    if (type && type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Type must be income or expense' });
    }

    db.prepare(`
      UPDATE transactions SET
        property_id = ?, date = ?, description = ?, amount = ?,
        category = ?, type = ?, account_name = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `).run(
      property_id ?? existing.property_id,
      date ?? existing.date,
      description ?? existing.description,
      amount ?? existing.amount,
      category ?? existing.category,
      type ?? existing.type,
      account_name ?? existing.account_name,
      notes ?? existing.notes,
      req.params.id, req.user.id
    );

    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    res.json({ transaction });
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// POST /api/transactions/categorize
router.post('/categorize', (req, res) => {
  try {
    const db = getDb();
    const { transaction_ids, category } = req.body;

    if (!transaction_ids || !Array.isArray(transaction_ids) || !category) {
      return res.status(400).json({ error: 'transaction_ids (array) and category are required' });
    }

    const placeholders = transaction_ids.map(() => '?').join(',');
    const result = db.prepare(`
      UPDATE transactions SET category = ?
      WHERE id IN (${placeholders}) AND user_id = ?
    `).run(category, ...transaction_ids, req.user.id);

    res.json({ updated: result.changes });
  } catch (err) {
    console.error('Categorize transactions error:', err);
    res.status(500).json({ error: 'Failed to categorize transactions' });
  }
});

module.exports = router;
