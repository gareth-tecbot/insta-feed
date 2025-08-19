// server.js - mini-Elfsight backend (dev)
import express from "express";
import axios from "axios";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 5000;
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "tokens.json");

if (!APP_ID || !APP_SECRET) {
  console.warn("WARNING: APP_ID or APP_SECRET not set in .env — OAuth will not work until provided.");
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple file-backed storage (dev)
function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch (e) {
    return {};
  }
}
function writeStore(obj) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

// Helpers
async function exchangeCodeForShortLivedToken(code) {
  // Exchange code for short-lived user access token
  const url = `https://graph.facebook.com/v17.0/oauth/access_token`;
  const res = await axios.get(url, {
    params: {
      client_id: APP_ID,
      redirect_uri: REDIRECT_URI,
      client_secret: APP_SECRET,
      code,
    },
    timeout: 20000,
  });
  return res.data; // { access_token, token_type, expires_in }
}

async function exchangeShortToLongLived(shortToken) {
  const url = `https://graph.facebook.com/v17.0/oauth/access_token`;
  const res = await axios.get(url, {
    params: {
      grant_type: "fb_exchange_token",
      client_id: APP_ID,
      client_secret: APP_SECRET,
      fb_exchange_token: shortToken,
    },
    timeout: 20000,
  });
  return res.data; // { access_token, token_type, expires_in }
}

async function getPageAndIgBusinessAccount(longLivedToken) {
  // Get pages of the user (we need the page connected to IG business)
  const pagesRes = await axios.get(`https://graph.facebook.com/v17.0/me/accounts`, {
    params: { access_token: longLivedToken },
  });
  const pages = pagesRes.data.data || [];
  // Find a Page that has an instagram_business_account connection
  for (const p of pages) {
    try {
      const pageWithIg = await axios.get(`https://graph.facebook.com/v17.0/${p.id}`, {
        params: { fields: "instagram_business_account", access_token: p.access_token },
      });
      const ig = pageWithIg.data.instagram_business_account;
      if (ig && ig.id) {
        return {
          pageId: p.id,
          pageAccessToken: p.access_token,
          igUserId: ig.id,
        };
      }
    } catch (e) {
      // continue trying other pages
    }
  }
  return null;
}

async function fetchIgMedia(igUserId, accessToken, limit = 12) {
  // Use Graph API to fetch media for the IG business account
  // Use Graph endpoint on graph.facebook.com for v17.0 (works when page-token used)
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const url = `https://graph.facebook.com/v17.0/${igUserId}/media`;
  const res = await axios.get(url, {
    params: {
      fields,
      access_token: accessToken,
      limit,
    },
    timeout: 20000,
  });
  return res.data.data || [];
}

/* -------------------------
   Routes
   -------------------------*/

// 1) Start OAuth flow: redirect user to FB dialog
app.get("/auth/login", (req, res) => {
  if (!APP_ID) return res.status(500).send("Server not configured with APP_ID.");
  const state = Math.random().toString(36).slice(2);
  // store state in temporary store? for dev we skip CSRF state persistence, but you should in prod
  const scope = ["pages_read_engagement", "pages_show_list", "pages_read_user_content", "instagram_basic"].join(",");
  const dialog = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&response_type=code&auth_type=rerequest`;
  res.redirect(dialog);
});

// 2) OAuth callback: exchange code -> short token -> long token -> identify IG business account -> save tokens
app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.status(400).send("OAuth error: " + JSON.stringify(req.query));
  }
  if (!code) return res.status(400).send("Missing code");
  try {
    const shortData = await exchangeCodeForShortLivedToken(code); // short-lived token
    const shortToken = shortData.access_token;
    const longData = await exchangeShortToLongLived(shortToken); // long-lived token
    const longToken = longData.access_token;
    // Now get page + IG business account info
    const mapping = await getPageAndIgBusinessAccount(longToken);
    if (!mapping) {
      return res.status(400).send("Could not find a connected Facebook Page with an Instagram Business account. Make sure your IG account is a Business/Creator and connected to a Page.");
    }
    // Save to store keyed by ig username placeholder - we can fetch username from IG later
    // We'll attempt to fetch profile info (username) using IG API:
    const igProfile = await axios.get(`https://graph.facebook.com/v17.0/${mapping.igUserId}`, {
      params: { fields: "username", access_token: longToken },
    }).catch(() => null);

    const username = igProfile?.data?.username || `ig_${mapping.igUserId}`;

    const store = readStore();
    store[username] = {
      igUserId: mapping.igUserId,
      pageId: mapping.pageId,
      pageAccessToken: mapping.pageAccessToken,
      longLivedToken: longToken,
      savedAt: Date.now(),
      expiresInSec: longData.expires_in || null,
    };
    writeStore(store);

    // Redirect to a simple success page with instructions and a sample embed code
    const embedUrl = `${BASE_URL}/embed/${encodeURIComponent(username)}`; // public iframe URL
    res.send(`<h2>Connected Instagram account: ${username}</h2>
      <p>Embed URL (copy & paste into any site):</p>
      <pre>&lt;iframe src="${embedUrl}" width="600" height="600" frameborder="0"&gt;&lt;/iframe&gt;</pre>
      <p><a href="${embedUrl}" target="_blank">Open embed preview</a></p>`);
  } catch (e) {
    console.error("auth callback error:", e?.response?.data || e?.message || e);
    res.status(500).send("OAuth callback failed: " + (e?.response?.data?.error?.message || e?.message || "unknown"));
  }
});

// 3) Public API: fetch posts JSON for given username (the username here is the "key" stored above)
app.get("/api/embed-json/:username", async (req, res) => {
  const username = req.params.username;
  const store = readStore();
  const entry = store[username];
  if (!entry) return res.status(404).json({ success: false, error: "Account not found. Connect first." });

  try {
    // prefer pageAccessToken (works for business IG media read)
    const token = entry.pageAccessToken || entry.longLivedToken;
    const posts = await fetchIgMedia(entry.igUserId, token, 12);
    // Minimal shape for frontend
    const result = posts.map(p => ({
      id: p.id,
      caption: p.caption,
      media_type: p.media_type,
      media_url: p.media_url || p.thumbnail_url,
      permalink: p.permalink,
      timestamp: p.timestamp,
    }));
    res.json({ success: true, posts: result });
  } catch (e) {
    console.error("fetch embed-json error:", e?.response?.data || e?.message || e);
    const status = e?.response?.status || 500;
    res.status(status).json({ success: false, error: e?.response?.data || e?.message || "Failed to fetch posts" });
  }
});

// 4) Public embed page (iframe content) - simple HTML that fetches JSON and displays grid
app.get("/embed/:username", (req, res) => {
  const username = req.params.username;
  const jsonUrl = `${BASE_URL}/api/embed-json/${encodeURIComponent(username)}`;
  // simple responsive HTML. You can style further.
  res.setHeader("Content-Type", "text/html");
  res.send(`<!doctype html>
  <html><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Instagram Embed: ${username}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:8px;background:#fff}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
      .item{position:relative;overflow:hidden;border-radius:6px}
      .item img{display:block;width:100%;height:100%;object-fit:cover}
      .caption{font-size:12px;padding:6px 4px;color:#111}
      .meta{font-size:11px;color:#666;padding:0 4px 6px}
      a.view{display:block;text-decoration:none;color:#3897f0;padding:6px 8px;font-weight:600}
    </style>
  </head><body>
    <div id="root"><p>Loading...</p></div>
    <script>
      async function load(){
        try{
          const r = await fetch("${jsonUrl}");
          if(!r.ok) throw r;
          const j = await r.json();
          if(!j.success) throw j;
          const posts = j.posts || [];
          const root = document.getElementById('root');
          if(posts.length===0){ root.innerHTML='<p>No posts found.</p>'; return; }
          let html = '<div class="grid">';
          for(const p of posts){
            html += '<div class="item"><a class="view" href="'+(p.permalink||'#')+'" target="_blank"><img src="'+(p.media_url||'')+'" alt=""/></a>';
            html += '<div class="caption">'+(p.caption? p.caption.substring(0,140):'')+'</div>';
            html += '<div class="meta">'+(new Date(p.timestamp||'').toLocaleString())+'</div></div>';
          }
          html += '</div>';
          root.innerHTML = html;
        }catch(err){
          console.error('embed load err', err);
          document.getElementById('root').innerHTML = '<p>Failed to load feed.</p>';
        }
      }
      load();
    </script>
  </body></html>`);
});

// optional: route to list connected accounts (dev)
app.get("/admin/list", (req, res) => {
  const store = readStore();
  res.json({ success: true, accounts: Object.keys(store), store });
});

// simple health
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`Mini-Elfsight server running on ${BASE_URL} (port ${PORT})`);
  console.log(`OAuth redirect URI: ${REDIRECT_URI}`);
});
