// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Configure CORS origins (set REACT_APP_ORIGIN or ALLOWED_ORIGINS in .env)
// Example: ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com"
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
 * Structure: [{ pageId, pageToken, instagramId, name, addedAt }]
 */
let instagramAccounts = [];

const MAIN_USER_TOKEN = process.env.MAIN_USER_TOKEN; // long-lived USER token (60-day)
if (!MAIN_USER_TOKEN) {
  console.warn('⚠️  MAIN_USER_TOKEN not set. Set it in .env');
}

/**
 * Helper: GET from FB Graph and return parsed JSON or throw
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
 * POST /api/add-instagram-account
 * body: { pageId }
 *
 * - Uses MAIN_USER_TOKEN to confirm instagram_business_account
 * - Fetches that Page's page access_token and stores account info
 */
app.post('/api/add-instagram-account', async (req, res) => {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'pageId is required in request body' });

  if (!MAIN_USER_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: MAIN_USER_TOKEN not set' });
  }

  try {
    // 1. get instagram_business_account and page name using user token
    const pageFields = 'instagram_business_account,name';
    const pageInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=${encodeURIComponent(pageFields)}&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );

    const instagramBiz = pageInfo.instagram_business_account?.id;
    if (!instagramBiz) {
      return res.status(400).json({
        error:
          'No Instagram Business/Creator account linked to this Page (or missing permissions). Ensure the IG account is Business/Creator and you are a Page admin.'
      });
    }

    // 2. fetch THIS PAGE's access_token using the user token
    // Note: this returns access_token when the user is admin and permissions are present
    const tokenInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );

    const pageToken = tokenInfo.access_token;
    if (!pageToken) {
      return res.status(400).json({
        error:
          'Could not fetch the Page access token. Ensure your user token has pages_show_list and you are a Page admin.'
      });
    }

    // 3. store or update
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
    console.error('Add account error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/instagram-accounts
 * Returns stored accounts
 */
app.get('/api/instagram-accounts', (req, res) => {
  res.json({ accounts: instagramAccounts });
});

/**
 * DELETE /api/instagram-accounts/:pageId
 * Removes stored account by pageId
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
 * body: { pageId }
 * Re-fetches the page access_token using MAIN_USER_TOKEN and updates stored pageToken
 */
app.post('/api/refresh-page-token', async (req, res) => {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'pageId is required' });

  if (!MAIN_USER_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: MAIN_USER_TOKEN not set' });
  }

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
    console.error('Refresh token error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/instagram-posts/:instagramId
 * Query params:
 *  - limit (default 8)
 *  - after (cursor)
 *
 * Returns: { data: [...], paging: { next_cursor } }
 */
app.get('/api/instagram-posts/:instagramId', async (req, res) => {
  const { instagramId } = req.params;
  const account = instagramAccounts.find(acc => acc.instagramId === instagramId);
  if (!account) return res.status(404).json({ error: 'Account not found. Add it first.' });

  const limit = parseInt(req.query.limit, 10) || 8;
  const after = req.query.after ? req.query.after : null;

  try {
    // Build FB URL with limit and optional after cursor
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
    console.error('Fetch posts error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Basic health check
 */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, accounts: instagramAccounts.length });
});

/**
 * Simple debug endpoint (only in dev) to show raw Graph response for a page (useful for troubleshooting)
 * Query: ?fields=instagram_business_account,name,access_token
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

