const express = require('express');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// GET /api/leases
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { property_id, status } = req.query;

    let sql = 'SELECT * FROM leases WHERE user_id = ?';
    const params = [req.user.id];

    if (property_id) {
      sql += ' AND property_id = ?';
      params.push(property_id);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const leases = db.prepare(sql).all(...params);
    res.json({ leases });
  } catch (err) {
    console.error('List leases error:', err);
    res.status(500).json({ error: 'Failed to list leases' });
  }
});

// POST /api/leases
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      property_id, tenant_name, tenant_email, tenant_phone,
      start_date, end_date, monthly_rent, security_deposit, status, notes
    } = req.body;

    if (!tenant_name) {
      return res.status(400).json({ error: 'Tenant name is required' });
    }

    const result = db.prepare(`
      INSERT INTO leases (user_id, property_id, tenant_name, tenant_email, tenant_phone,
        start_date, end_date, monthly_rent, security_deposit, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      property_id || null,
      tenant_name,
      tenant_email || null,
      tenant_phone || null,
      start_date || null,
      end_date || null,
      monthly_rent || null,
      security_deposit || null,
      status || 'active',
      notes || null
    );

    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ lease });
  } catch (err) {
    console.error('Create lease error:', err);
    res.status(500).json({ error: 'Failed to create lease' });
  }
});

// PUT /api/leases/:id
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM leases WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    const {
      property_id, tenant_name, tenant_email, tenant_phone,
      start_date, end_date, monthly_rent, security_deposit, status, notes
    } = req.body;

    db.prepare(`
      UPDATE leases SET
        property_id = ?, tenant_name = ?, tenant_email = ?, tenant_phone = ?,
        start_date = ?, end_date = ?, monthly_rent = ?, security_deposit = ?,
        status = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `).run(
      property_id ?? existing.property_id,
      tenant_name ?? existing.tenant_name,
      tenant_email ?? existing.tenant_email,
      tenant_phone ?? existing.tenant_phone,
      start_date ?? existing.start_date,
      end_date ?? existing.end_date,
      monthly_rent ?? existing.monthly_rent,
      security_deposit ?? existing.security_deposit,
      status ?? existing.status,
      notes ?? existing.notes,
      req.params.id, req.user.id
    );

    const lease = db.prepare('SELECT * FROM leases WHERE id = ?').get(req.params.id);
    res.json({ lease });
  } catch (err) {
    console.error('Update lease error:', err);
    res.status(500).json({ error: 'Failed to update lease' });
  }
});

// DELETE /api/leases/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM leases WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Lease not found' });
    }

    db.prepare('DELETE FROM leases WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Lease deleted successfully' });
  } catch (err) {
    console.error('Delete lease error:', err);
    res.status(500).json({ error: 'Failed to delete lease' });
  }
});

module.exports = router;
