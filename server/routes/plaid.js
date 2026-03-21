const express = require('express');
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { getDb } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// Configure Plaid client
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Auto-categorize based on transaction name patterns
function autoCategorize(name) {
  const lower = (name || '').toLowerCase();

  if (/mortgage|loan payment/i.test(lower)) return { category: 'Mortgage Payment', type: 'expense' };
  if (/property tax|county tax/i.test(lower)) return { category: 'Property Tax', type: 'expense' };
  if (/insurance|allstate|state farm|geico/i.test(lower)) return { category: 'Insurance', type: 'expense' };
  if (/hoa|homeowner.*assoc/i.test(lower)) return { category: 'HOA Fees', type: 'expense' };
  if (/management|property mgmt/i.test(lower)) return { category: 'Property Management', type: 'expense' };
  if (/repair|maintenance|plumb|electric|hvac|handyman/i.test(lower)) return { category: 'Repairs & Maintenance', type: 'expense' };
  if (/water|electric|gas|sewer|trash|utility|power/i.test(lower)) return { category: 'Utilities', type: 'expense' };
  if (/advertis|marketing|zillow|realtor/i.test(lower)) return { category: 'Advertising', type: 'expense' };
  if (/legal|attorney|lawyer|accounting|cpa/i.test(lower)) return { category: 'Legal & Professional', type: 'expense' };
  if (/office|supplies|staples/i.test(lower)) return { category: 'Office Expenses', type: 'expense' };
  if (/travel|mileage|gas station|fuel/i.test(lower)) return { category: 'Travel', type: 'expense' };
  if (/clean|landscap|lawn|garden|mow/i.test(lower)) return { category: 'Cleaning & Landscaping', type: 'expense' };
  if (/rent|tenant|lease payment/i.test(lower)) return { category: 'Rental Income', type: 'income' };

  return { category: 'Other Expense', type: 'expense' };
}

// POST /api/plaid/create-link-token
router.post('/create-link-token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: String(req.user.id),
      },
      client_name: 'Real Estate Investment Tracker',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error('Create link token error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// POST /api/plaid/exchange-token
router.post('/exchange-token', async (req, res) => {
  try {
    const { public_token, institution } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token is required' });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const { access_token, item_id } = exchangeResponse.data;

    const db = getDb();

    // Store plaid item
    const itemResult = db.prepare(`
      INSERT INTO plaid_items (user_id, item_id, access_token, institution_name, institution_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      item_id,
      access_token,
      institution?.name || null,
      institution?.institution_id || null
    );

    const plaidItemId = itemResult.lastInsertRowid;

    // Fetch and store accounts
    const accountsResponse = await plaidClient.accountsGet({ access_token });
    const accounts = accountsResponse.data.accounts;

    const insertAccount = db.prepare(`
      INSERT INTO plaid_accounts (plaid_item_id, account_id, name, official_name, type, subtype, mask)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const account of accounts) {
      insertAccount.run(
        plaidItemId,
        account.account_id,
        account.name,
        account.official_name || null,
        account.type,
        account.subtype || null,
        account.mask || null
      );
    }

    res.json({
      item_id,
      accounts: accounts.map(a => ({
        account_id: a.account_id,
        name: a.name,
        official_name: a.official_name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
      })),
    });
  } catch (err) {
    console.error('Exchange token error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// POST /api/plaid/sync-transactions
router.post('/sync-transactions', async (req, res) => {
  try {
    const db = getDb();
    const plaidItems = db.prepare('SELECT * FROM plaid_items WHERE user_id = ?').all(req.user.id);

    if (plaidItems.length === 0) {
      return res.json({ added: 0, modified: 0, removed: 0 });
    }

    let totalAdded = 0;
    let totalModified = 0;
    let totalRemoved = 0;

    for (const item of plaidItems) {
      let cursor = item.cursor || undefined;
      let hasMore = true;

      while (hasMore) {
        const syncResponse = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor: cursor,
        });

        const { added, modified, removed, next_cursor, has_more } = syncResponse.data;

        // Process added transactions
        const insertTxn = db.prepare(`
          INSERT OR IGNORE INTO transactions
            (user_id, plaid_transaction_id, date, description, amount, category, type, account_name, is_manual)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        for (const txn of added) {
          const { category, type } = autoCategorize(txn.name);
          // Plaid amounts: positive = money spent (expense), negative = money received (income)
          const txnType = txn.amount < 0 ? 'income' : 'expense';
          const finalCategory = txnType === 'income' && type === 'expense' ? 'Other Income' : category;

          insertTxn.run(
            req.user.id,
            txn.transaction_id,
            txn.date,
            txn.name,
            Math.abs(txn.amount),
            txnType === 'income' ? (finalCategory.includes('Income') ? finalCategory : 'Other Income') : finalCategory,
            txnType,
            txn.account_id
          );
          totalAdded++;
        }

        // Process modified transactions
        const updateTxn = db.prepare(`
          UPDATE transactions SET date = ?, description = ?, amount = ?
          WHERE plaid_transaction_id = ? AND user_id = ?
        `);

        for (const txn of modified) {
          updateTxn.run(
            txn.date,
            txn.name,
            Math.abs(txn.amount),
            txn.transaction_id,
            req.user.id
          );
          totalModified++;
        }

        // Process removed transactions
        const deleteTxn = db.prepare(
          'DELETE FROM transactions WHERE plaid_transaction_id = ? AND user_id = ?'
        );

        for (const txn of removed) {
          deleteTxn.run(txn.transaction_id, req.user.id);
          totalRemoved++;
        }

        cursor = next_cursor;
        hasMore = has_more;
      }

      // Update cursor for this item
      db.prepare('UPDATE plaid_items SET cursor = ? WHERE id = ?').run(cursor, item.id);
    }

    res.json({ added: totalAdded, modified: totalModified, removed: totalRemoved });
  } catch (err) {
    console.error('Sync transactions error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to sync transactions' });
  }
});

// GET /api/plaid/accounts
router.get('/accounts', (req, res) => {
  try {
    const db = getDb();
    const accounts = db.prepare(`
      SELECT pa.*, pi.institution_name, pi.institution_id, pi.item_id
      FROM plaid_accounts pa
      JOIN plaid_items pi ON pa.plaid_item_id = pi.id
      WHERE pi.user_id = ?
      ORDER BY pi.institution_name, pa.name
    `).all(req.user.id);

    res.json({ accounts });
  } catch (err) {
    console.error('List accounts error:', err);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// DELETE /api/plaid/accounts/:itemId
router.delete('/accounts/:itemId', async (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM plaid_items WHERE item_id = ? AND user_id = ?').get(req.params.itemId, req.user.id);

    if (!item) {
      return res.status(404).json({ error: 'Linked account not found' });
    }

    // Remove from Plaid
    try {
      await plaidClient.itemRemove({ access_token: item.access_token });
    } catch (plaidErr) {
      console.error('Plaid item remove error (continuing):', plaidErr.response?.data || plaidErr);
    }

    // Delete associated transactions synced from this item
    const accountIds = db.prepare(
      'SELECT account_id FROM plaid_accounts WHERE plaid_item_id = ?'
    ).all(item.id).map(a => a.account_id);

    if (accountIds.length > 0) {
      const placeholders = accountIds.map(() => '?').join(',');
      db.prepare(`
        DELETE FROM transactions
        WHERE account_name IN (${placeholders}) AND user_id = ? AND is_manual = 0
      `).run(...accountIds, req.user.id);
    }

    // Delete accounts and item
    db.prepare('DELETE FROM plaid_accounts WHERE plaid_item_id = ?').run(item.id);
    db.prepare('DELETE FROM plaid_items WHERE id = ?').run(item.id);

    res.json({ message: 'Account removed successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

// GET /api/plaid/connections - alias for frontend compatibility
router.get('/connections', (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM plaid_items WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const connections = items.map(item => {
      const accounts = db.prepare('SELECT * FROM plaid_accounts WHERE plaid_item_id = ?').all(item.id);
      return {
        id: item.id,
        item_id: item.item_id,
        institution_name: item.institution_name,
        institution_id: item.institution_id,
        status: 'active',
        last_synced: item.cursor ? item.created_at : null,
        accounts: accounts.map(a => ({
          id: a.id,
          account_id: a.account_id,
          name: a.name,
          official_name: a.official_name,
          type: a.type,
          subtype: a.subtype,
          mask: a.mask,
        })),
      };
    });
    res.json({ connections });
  } catch (err) {
    console.error('List connections error:', err);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

// POST /api/plaid/sync/:connectionId - alias for frontend compatibility
router.post('/sync/:connectionId', async (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM plaid_items WHERE id = ? AND user_id = ?').get(req.params.connectionId, req.user.id);
    if (!item) return res.status(404).json({ error: 'Connection not found' });

    let cursor = item.cursor || undefined;
    let hasMore = true;
    let totalAdded = 0;

    while (hasMore) {
      const syncResponse = await plaidClient.transactionsSync({
        access_token: item.access_token,
        cursor: cursor,
      });
      const { added, next_cursor, has_more } = syncResponse.data;
      const insertTxn = db.prepare(
        'INSERT OR IGNORE INTO transactions (user_id, plaid_transaction_id, date, description, amount, category, type, account_name, is_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
      );
      for (const txn of added) {
        const { category } = autoCategorize(txn.name);
        const txnType = txn.amount < 0 ? 'income' : 'expense';
        insertTxn.run(req.user.id, txn.transaction_id, txn.date, txn.name, Math.abs(txn.amount),
          txnType === 'income' ? 'Rental Income' : category, txnType, txn.account_id);
        totalAdded++;
      }
      cursor = next_cursor;
      hasMore = has_more;
    }
    db.prepare('UPDATE plaid_items SET cursor = ? WHERE id = ?').run(cursor, item.id);
    res.json({ added: totalAdded });
  } catch (err) {
    console.error('Sync error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to sync' });
  }
});

// DELETE /api/plaid/connections/:connectionId - alias for frontend compatibility
router.delete('/connections/:connectionId', async (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM plaid_items WHERE id = ? AND user_id = ?').get(req.params.connectionId, req.user.id);
    if (!item) return res.status(404).json({ error: 'Connection not found' });
    try { await plaidClient.itemRemove({ access_token: item.access_token }); } catch (e) { /* continue */ }
    db.prepare('DELETE FROM plaid_accounts WHERE plaid_item_id = ?').run(item.id);
    db.prepare('DELETE FROM plaid_items WHERE id = ?').run(item.id);
    res.json({ message: 'Disconnected' });
  } catch (err) {
    console.error('Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
