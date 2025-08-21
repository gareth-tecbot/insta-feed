require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 8000;

/**
 * In-memory store. In prod, replace with DB.
 * [{ pageId, pageToken, instagramId, name }]
 */
let instagramAccounts = [];

const MAIN_USER_TOKEN = process.env.MAIN_USER_TOKEN; // long-lived USER token (60-day), NOT a page token

if (!MAIN_USER_TOKEN) {
  console.warn('⚠️  MAIN_USER_TOKEN not set. Set it in .env');
}

/**
 * Helpers
 */
async function fbGet(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json?.error?.message || `Facebook API error for ${url}`;
    const code = json?.error?.code;
    const type = json?.error?.type;
    throw new Error(`${msg}${code ? ` (code ${code})` : ''}${type ? ` [${type}]` : ''}`);
  }
  return json;
}

/**
 * Add a new Instagram account by Page ID.
 * - Validates we can see the linked IG account
 * - Fetches THAT PAGE's access_token
 * - Stores per-account token + ig id
 */
app.post('/api/add-instagram-account', async (req, res) => {
  const { pageId } = req.body;
  if (!pageId) return res.status(400).json({ error: 'Page ID is required' });

  try {
    // 1) Get IG biz account + page name via USER token
    const pageFields = 'instagram_business_account,name';
    const pageInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=${pageFields}&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );

    const instagramBiz = pageInfo.instagram_business_account?.id;
    if (!instagramBiz) {
      return res.status(400).json({
        error:
          'No Instagram Business/Creator account linked to this Page (or your user/app lacks permissions).'
      });
    }

    // 2) Get THIS PAGE’s page access token (this is the token you must use for that IG account)
    const tokenInfo = await fbGet(
      `https://graph.facebook.com/v18.0/${pageId}?fields=access_token&access_token=${encodeURIComponent(MAIN_USER_TOKEN)}`
    );

    const pageToken = tokenInfo.access_token;
    if (!pageToken) {
      return res.status(400).json({
        error:
          'Could not fetch this Page’s access token. Ensure your user token has pages_show_list and you are a Page admin.'
      });
    }

    // 3) Store/update account
    const existingIdx = instagramAccounts.findIndex(a => a.pageId === pageId);
    const account = {
      pageId,
      pageToken, // <- IMPORTANT: per-page token
      instagramId: instagramBiz,
      name: pageInfo.name || pageId
    };

    if (existingIdx >= 0) {
      instagramAccounts[existingIdx] = account;
    } else {
      instagramAccounts.push(account);
    }

    res.json({ message: 'Instagram account added', account });
  } catch (err) {
    console.error('Add account error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List added accounts
 */
app.get('/api/instagram-accounts', (req, res) => {
  res.json({ accounts: instagramAccounts });
});

/**
 * Fetch posts for a specific Instagram Business ID
 */
app.get('/api/instagram-posts/:instagramId', async (req, res) => {
  const { instagramId } = req.params;
  const account = instagramAccounts.find(acc => acc.instagramId === instagramId);

  if (!account) return res.status(404).json({ error: 'Account not found. Add it first.' });

  try {
    const url = `https://graph.facebook.com/v18.0/${instagramId}/media?fields=id,caption,media_url,thumbnail_url,permalink,media_type,timestamp&access_token=${encodeURIComponent(
      account.pageToken
    )}`;
    const data = await fbGet(url);
    res.json({ data: data.data || [] });
  } catch (err) {
    console.error('Fetch posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Basic health
 */
app.get('/api/health', (_req, res) => res.json({ ok: true, count: instagramAccounts.length }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
