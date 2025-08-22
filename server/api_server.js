// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// CORS config (ALLOWED_ORIGINS or REACT_APP_ORIGIN or '*')
const allowed = (process.env.ALLOWED_ORIGINS || process.env.REACT_APP_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

const PORT = process.env.PORT || 8000;

/**
 * In-memory store (replace with DB in production)
 * { pageId, pageToken, instagramId, name, addedAt }
 */
let instagramAccounts = [];

// prefer MAIN_SYSTEM_USER_TOKEN for business/system-user usage; fallback to MAIN_USER_TOKEN
const MAIN_USER_TOKEN = process.env.MAIN_SYSTEM_USER_TOKEN || process.env.MAIN_USER_TOKEN;
const BUSINESS_ID = process.env.BUSINESS_ID || null;

if (!MAIN_USER_TOKEN) {
  console.warn('⚠️  MAIN_SYSTEM_USER_TOKEN / MAIN_USER_TOKEN not set in .env');
}

/**
 * Helper - GET and parse JSON, throw on API/HTTP error
 */
async function fbGet(url) {
  const res = await fetch(url);
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`Invalid JSON response from Facebook for URL: ${url}`);
  }
  if (!res.ok || json.error) {
    const e = json.error || {};
    const msg = e.message || `Facebook API error for ${url}`;
    const code = e.code ? ` (code ${e.code})` : '';
    throw new Error(msg + code);
  }
  return json;
}

/**
 * GET /api/pages
 * Returns pages accessible to the system user (or business-owned pages if BUSINESS_ID set)
 * Response: { pages: [ { id, name, page_access_token, instagram_id } ] }
 */
app.get('/api/pages', async (_req, res) => {
  if (!MAIN_USER_TOKEN) return res.status(500).json({ error: 'MAIN_USER_TOKEN not set on server' });

  try {
    // Try business-owned pages if BUSINESS_ID is set (preferred for system user + business context)
    const listUrl = BUSINESS_ID
      ? `https://graph.facebook.com/v18.0/${BUSINESS_ID}/owned_pages?access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
      : `https://graph.facebook.com/v18.0/me/accounts?access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`;

    const listJson = await fbGet(listUrl);
    const pages = listJson.data || [];

    // Augment each page with linked IG id (best-effort) and page_access_token if available
    const detailed = await Promise.all(
      pages.map(async (p) => {
        const pageObj = { id: p.id, name: p.name || '', page_access_token: p.access_token || null, instagram_id: null };
        try {
          // Try to fetch page-level instagram_business_account
          const fields = 'instagram_business_account';
          const pageInfo = await fbGet(
            `https://graph.facebook.com/v18.0/${p.id}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
          );
          pageObj.instagram_id = pageInfo.instagram_business_account?.id || null;

          // If no page access token in listing, attempt to request it (best-effort)
          if (!pageObj.page_access_token) {
            try {
              const tokenInfo = await fbGet(
                `https://graph.facebook.com/v18.0/${p.id}?fields=access_token&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
              );
              pageObj.page_access_token = tokenInfo.access_token || null;
            } catch (e) {
              // ignore - token might not be available via this token
            }
          }
        } catch (e) {
          // ignore per-page errors and continue
        }
        return pageObj;
      })
    );

    res.json({ pages: detailed });
  } catch (err) {
    console.error('List pages error:', err.message || err);
    res.status(500).json({ error: err.message || 'Failed to list pages' });
  }
});

/**
 * POST /api/add-instagram-account
 * body: { pageId }
 * (keeps existing behavior: fetch instagram_business_account and page access token, store in memory)
 */
app.post('/api/add-instagram-account', async (req, res) => {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'pageId is required in request body' });
  if (!MAIN_USER_TOKEN) return res.status(500).json({ error: 'MAIN_USER_TOKEN not set on server' });

  try {
    // 1) fetch instagram_business_account and page name
    const pageFields = 'instagram_business_account,name';
    const pageInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=${encodeURIComponent(pageFields)}&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );

    const instagramBiz = pageInfo.instagram_business_account?.id;
    if (!instagramBiz) {
      return res.status(400).json({
        error:
          'No Instagram Business/Creator account linked to this Page (or missing permissions). Ensure the IG account is Business/Creator and this Business/System User has access.'
      });
    }

    // 2) fetch THIS PAGE's access_token using the system user token (best-effort)
    const tokenInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );
    const pageToken = tokenInfo.access_token;
    if (!pageToken) {
      return res.status(400).json({
        error:
          'Could not fetch the Page access token. Ensure the system user has proper permissions for this Page (pages_show_list).'
      });
    }

    const existingIdx = instagramAccounts.findIndex(a => a.pageId === pageId);
    const account = {
      pageId,
      pageToken,
      instagramId: instagramBiz,
      name: pageInfo.name || pageId,
      addedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) instagramAccounts[existingIdx] = account;
    else instagramAccounts.push(account);

    return res.json({ message: 'Instagram account added', account });
  } catch (err) {
    console.error('Add account error:', err.message || err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/instagram-accounts
 */
app.get('/api/instagram-accounts', (_req, res) => {
  res.json({ accounts: instagramAccounts });
});

/**
 * DELETE /api/instagram-accounts/:pageId
 */
app.delete('/api/instagram-accounts/:pageId', (req, res) => {
  const { pageId } = req.params;
  const idx = instagramAccounts.findIndex(a => a.pageId === pageId);
  if (idx === -1) return res.status(404).json({ error: 'Account not found' });
  instagramAccounts.splice(idx, 1);
  res.json({ message: 'Account removed', pageId });
});

/**
 * POST /api/refresh-page-token
 */
app.post('/api/refresh-page-token', async (req, res) => {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'pageId is required' });
  if (!MAIN_USER_TOKEN) return res.status(500).json({ error: 'MAIN_USER_TOKEN not set on server' });

  try {
    const tokenInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );
    const pageToken = tokenInfo.access_token;
    if (!pageToken) return res.status(400).json({ error: 'Could not fetch page access token' });

    const idx = instagramAccounts.findIndex(a => a.pageId === pageId);
    if (idx >= 0) {
      instagramAccounts[idx].pageToken = pageToken;
      instagramAccounts[idx].updatedAt = new Date().toISOString();
      return res.json({ message: 'Page token refreshed', account: instagramAccounts[idx] });
    }
    return res.status(404).json({ error: 'Account not found in store' });
  } catch (err) {
    console.error('Refresh token error:', err.message || err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/instagram-posts/:instagramId
 * supports limit & after cursor
 */
app.get('/api/instagram-posts/:instagramId', async (req, res) => {
  const { instagramId } = req.params;
  const account = instagramAccounts.find(acc => acc.instagramId === instagramId);
  if (!account) return res.status(404).json({ error: 'Account not found. Add it first.' });

  const limit = parseInt(req.query.limit, 10) || 8;
  const after = req.query.after ? req.query.after : null;

  try {
    let url = `https://graph.facebook.com/v18.0/${instagramId}/media?fields=id,caption,media_url,thumbnail_url,permalink,media_type,timestamp&limit=${limit}&access_token=${encodeURIComponent(
      account.pageToken
    )}`;
    if (after) url += `&after=${encodeURIComponent(after)}`;

    const json = await fbGet(url);

    const posts = (json.data || []).map(p => ({
      id: p.id,
      caption: p.caption || '',
      media_url: p.media_url || p.thumbnail_url || '',
      permalink: p.permalink,
      media_type: p.media_type,
      timestamp: p.timestamp
    }));

    const nextCursor =
      json.paging && json.paging.cursors && json.paging.cursors.after ? json.paging.cursors.after : null;

    return res.json({ data: posts, paging: { next_cursor: nextCursor } });
  } catch (err) {
    console.error('Fetch posts error:', err.message || err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Debug endpoint (dev only)
 */
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/page/:pageId', async (req, res) => {
    try {
      const { pageId } = req.params;
      const fields = req.query.fields || 'instagram_business_account,name';
      if (!MAIN_USER_TOKEN) return res.status(500).json({ error: 'MAIN_USER_TOKEN not set' });
      const json = await fbGet(
        `https://graph.facebook.com/v18.0/${pageId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(
          MAIN_USER_TOKEN
        )}`
      );
      res.json(json);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
