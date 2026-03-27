const express = require('express');
const multer = require('multer');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// POST /api/transactions/batch-update
router.post('/batch-update', (req, res) => {
  try {
    const db = getDb();
    const { transaction_ids, property_id, type, category } = req.body;

    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'transaction_ids array is required' });
    }

    const fields = [];
    const values = [];

    if (property_id !== undefined) {
      fields.push('property_id = ?');
      values.push(property_id === '' ? null : property_id);
    }
    if (type !== undefined) {
      if (type !== 'income' && type !== 'expense') {
        return res.status(400).json({ error: 'Type must be income or expense' });
      }
      fields.push('type = ?');
      values.push(type);
    }
    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'At least one field to update is required' });
    }

    const placeholders = transaction_ids.map(() => '?').join(',');
    const result = db.prepare(
      `UPDATE transactions SET ${fields.join(', ')} WHERE id IN (${placeholders}) AND user_id = ?`
    ).run(...values, ...transaction_ids, req.user.id);

    res.json({ updated: result.changes });
  } catch (err) {
    console.error('Batch update error:', err);
    res.status(500).json({ error: 'Failed to update transactions' });
  }
});

// POST /api/transactions/import-csv
router.post('/import-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV file must have a header row and at least one data row' });
    }

    // Parse header to detect columns
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

    const columnMap = detectColumns(headers);

    if (!columnMap.date || !columnMap.amount) {
      return res.status(400).json({
        error: 'Could not detect required columns. CSV must contain at least a date and amount column.',
        detected: columnMap,
        headers: headers,
      });
    }

    const db = getDb();
    const accountName = req.body.account_name || req.file.originalname.replace(/\.csv$/i, '');
    const insertStmt = db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category, type, account_name, is_manual, notes) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
    );

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        try {
          insertStmt.run(
            req.user.id,
            row.date,
            row.description,
            Math.abs(row.amount),
            row.category,
            row.type,
            accountName,
            null
          );
          imported++;
        } catch (err) {
          skipped++;
          errors.push(`Row: ${row.original} - ${err.message}`);
        }
      }
    });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 2) continue;

      const dateVal = values[columnMap.date];
      const amountVal = values[columnMap.amount];

      if (!dateVal || !amountVal) {
        skipped++;
        continue;
      }

      const parsedDate = parseDate(dateVal.trim());
      if (!parsedDate) {
        skipped++;
        errors.push(`Row ${i + 1}: Invalid date "${dateVal}"`);
        continue;
      }

      const parsedAmount = parseFloat(amountVal.replace(/[$,"\s]/g, ''));
      if (isNaN(parsedAmount) || parsedAmount === 0) {
        skipped++;
        continue;
      }

      const description = columnMap.description !== undefined
        ? values[columnMap.description]?.trim() || ''
        : '';

      // Determine income vs expense
      let type;
      let amount = parsedAmount;
      if (columnMap.debit !== undefined && columnMap.credit !== undefined) {
        // Separate debit/credit columns
        const debit = parseFloat((values[columnMap.debit] || '').replace(/[$,"\s]/g, '')) || 0;
        const credit = parseFloat((values[columnMap.credit] || '').replace(/[$,"\s]/g, '')) || 0;
        if (credit > 0) {
          type = 'income';
          amount = credit;
        } else {
          type = 'expense';
          amount = debit || Math.abs(parsedAmount);
        }
      } else {
        // Single amount column: most bank CSVs show withdrawals/charges as
        // positive and deposits as negative (or the reverse). Capital One and
        // many others use positive = debit (expense), negative = credit (income).
        type = parsedAmount > 0 ? 'expense' : 'income';
        amount = Math.abs(parsedAmount);
      }

      // Auto-categorize
      const categorized = autoCategorize(description);
      if (categorized.type) {
        type = categorized.type;
      }

      rows.push({
        date: parsedDate,
        description,
        amount,
        category: categorized.category,
        type,
        original: lines[i].substring(0, 80),
      });
    }

    insertMany(rows);

    res.json({
      imported,
      skipped,
      total: lines.length - 1,
      errors: errors.slice(0, 5),
    });
  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// Parse a CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// Detect which column index maps to which field
function detectColumns(headers) {
  const map = {};

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!map.date && /\b(date|posted|transaction.?date|posting.?date)\b/.test(h)) {
      map.date = i;
    } else if (!map.amount && /\b(amount|total|sum)\b/.test(h) && !/debit|credit/.test(h)) {
      map.amount = i;
    } else if (!map.description && /\b(description|memo|narrative|details|payee|merchant|name|transaction)\b/.test(h) && !/date|type|amount/.test(h)) {
      map.description = i;
    } else if (!map.debit && /\bdebit\b/.test(h)) {
      map.debit = i;
    } else if (!map.credit && /\bcredit\b/.test(h)) {
      map.credit = i;
    } else if (!map.category && /\b(category|type)\b/.test(h)) {
      map.category = i;
    }
  }

  // If no amount but we have debit/credit, use debit as the amount column
  if (!map.amount && map.debit !== undefined) {
    map.amount = map.debit;
  }

  // Fallback: if only 2-3 columns with no headers matching, guess by position
  if (!map.date && !map.amount && headers.length >= 2) {
    map.date = 0;
    map.amount = headers.length - 1;
    if (headers.length >= 3) {
      map.description = 1;
    }
  }

  return map;
}

// Parse various date formats into YYYY-MM-DD
function parseDate(str) {
  if (!str) return null;
  str = str.replace(/["']/g, '').trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // MM/DD/YYYY or M/D/YYYY
  let match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // MM/DD/YY or M/D/YY
  match = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (match) {
    const year = parseInt(match[3]) > 50 ? '19' + match[3] : '20' + match[3];
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }

  // Try native Date parsing as fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

// Auto-categorize based on description
function autoCategorize(name) {
  const lower = (name || '').toLowerCase();

  if (/mortgage|loan payment/i.test(lower)) return { category: 'Mortgage Payment', type: 'expense' };
  if (/property tax|county tax/i.test(lower)) return { category: 'Property Tax', type: 'expense' };
  if (/insurance|allstate|state farm|geico/i.test(lower)) return { category: 'Insurance', type: 'expense' };
  if (/hoa|homeowner.*assoc/i.test(lower)) return { category: 'HOA Fees', type: 'expense' };
  if (/management|property mgmt/i.test(lower)) return { category: 'Property Management', type: 'expense' };
  if (/repair|maintenance|plumb|electric|hvac|handyman/i.test(lower)) return { category: 'Repairs & Maintenance', type: 'expense' };
  if (/water|sewer|trash|utility|power/i.test(lower)) return { category: 'Utilities', type: 'expense' };
  if (/advertis|marketing|zillow|realtor/i.test(lower)) return { category: 'Advertising', type: 'expense' };
  if (/legal|attorney|lawyer|accounting|cpa/i.test(lower)) return { category: 'Legal & Professional', type: 'expense' };
  if (/office|supplies|staples/i.test(lower)) return { category: 'Office Expenses', type: 'expense' };
  if (/travel|mileage|gas station|fuel/i.test(lower)) return { category: 'Travel', type: 'expense' };
  if (/clean|landscap|lawn|garden|mow/i.test(lower)) return { category: 'Cleaning & Landscaping', type: 'expense' };
  if (/rent|tenant|lease payment/i.test(lower)) return { category: 'Rental Income', type: 'income' };

  return { category: 'Other Expense', type: null };
}

module.exports = router;
