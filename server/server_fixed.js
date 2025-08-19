// server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { ScrapflyClient, ScrapeConfig } from "scrapfly-sdk";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const CLIENT_ORIGIN = process.env.CLIENT_URL || "http://localhost:3000";
const API_BASE = process.env.API_BASE || ""; // optional

const scrapfly = new ScrapflyClient({ key: process.env.SCRAPFLY_KEY });

app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);

/**
 * Simple in-memory cache for proxied media:
 * key -> { buffer, contentType, expiresAt }
 * This is intentionally simple. Use Redis/S3/Cloudflare for production.
 */
const mediaCache = new Map();
const MEDIA_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

function setCache(key, buffer, contentType) {
  mediaCache.set(key, {
    buffer,
    contentType,
    expiresAt: Date.now() + MEDIA_CACHE_TTL_MS,
  });
}

function getCache(key) {
  const entry = mediaCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mediaCache.delete(key);
    return null;
  }
  return entry;
}

/**
 * Validate that a URL belongs to allowed Instagram CDN hosts:
 * - scontent-*.cdninstagram.com
 * - instagram.f*.cdninstagram.com
 * - instagram.f*.*.cdninstagram.com
 * - (and any other common IG CDN host patterns)
 *
 * Prevents open proxy abuse.
 */
function isAllowedInstagramUrl(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    // allowlist rules
    if (
      host.endsWith("cdninstagram.com") ||
      host.endsWith("akamaihd.net") ||
      host.endsWith("instagram.com")
    ) {
      // more restrictive: ensure it's not an unrelated domain that happens to contain these strings
      // here we just rely on endsWith which is good for common IG CDN hosts
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Scrape Instagram (using scrapfly)
async function scrapeInstagram(username) {
  try {
    const response = await scrapfly.scrape(
      new ScrapeConfig({
        url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
        headers: {
          // Known Instagram app id for web endpoints (commonly used in scrapers),
          // leaving as is — you might change this if Scrapfly docs recommend another header set.
          "x-ig-app-id": "936619743392459",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          // Accept header should be valid
          "Accept": "application/json, text/plain, */*",
          Connection: "keep-alive",
        },
        asp: true,
        country: "US",
      })
    );

    if (!response?.result?.content) {
      return { success: false, error: "Empty Scrapfly response" };
    }

    const data = JSON.parse(response.result.content);
    if (!data?.data?.user) return { success: false, error: "Invalid Instagram response structure" };

    const user = data.data.user;
    const posts = (user.edge_owner_to_timeline_media?.edges || []).map((edge) => ({
      id: edge.node.id,
      shortcode: edge.node.shortcode,
      caption: edge.node.edge_media_to_caption?.edges[0]?.node.text || "",
      imageUrl: edge.node.display_url,
      thumbnailResources: edge.node.thumbnail_resources || [],
      isVideo: !!edge.node.is_video,
      videoUrl: edge.node.video_url || null,
      timestamp: edge.node.taken_at_timestamp ? new Date(edge.node.taken_at_timestamp * 1000).toISOString() : null,
      postUrl: `https://www.instagram.com/p/${edge.node.shortcode}/`,
    }));

    return { success: true, posts };
  } catch (err) {
    console.error("scrapeInstagram error:", err);
    return { success: false, error: "Failed to fetch Instagram profile" };
  }
}

// Routes
app.post("/api/public-profile", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, error: "Username required" });
  const result = await scrapeInstagram(username);
  res.json(result);
});

/**
 * Proxy image/video from Instagram CDN to avoid CORP/CORS blocking in browser.
 * Query param: url (encoded full upstream URL)
 *
 * Security:
 * - Only allows well-known instagram CDN/hosts via isAllowedInstagramUrl()
 * - Uses simple in-memory caching to reduce repeated upstream hits.
 */
// Replace only the /proxy-image route with the following code
import stream from "stream";
import { promisify } from "util";
const pipeline = promisify(stream.pipeline);

app.get("/proxy-image", async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ ok: false, message: "Missing url query param" });

  console.log("[proxy-image] requested URL:", rawUrl);

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (err) {
    console.log("[proxy-image] invalid URL:", rawUrl);
    return res.status(400).json({ ok: false, message: "Invalid URL format", error: err.message });
  }

  if (!isAllowedInstagramUrl(parsedUrl.href)) {
    return res.status(403).json({ ok: false, message: "URL host not allowed", host: parsedUrl.hostname });
  }

  const cacheKey = parsedUrl.href;
  const cached = getCache(cacheKey);
  if (cached) {
    console.log("[proxy-image] serving from cache");
    res.set({
      "Content-Type": cached.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
    });
    return res.send(cached.buffer);
  }

  try {
    // Fetch the image with headers Instagram expects
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      Referer: "https://www.instagram.com/",
      Connection: "keep-alive",
    };

    const upstreamResp = await fetch(parsedUrl.href, { headers, redirect: "follow" });

    if (!upstreamResp.ok) {
      console.warn("[proxy-image] upstream fetch failed:", upstreamResp.status, parsedUrl.href);
      return res.status(502).json({ ok: false, message: "Failed to fetch upstream media", status: upstreamResp.status });
    }

    const contentType = upstreamResp.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await upstreamResp.arrayBuffer();
const buffer = Buffer.from(arrayBuffer);

// cache it
setCache(cacheKey, buffer, contentType);

// send buffer directly
res.set({
  "Content-Type": contentType,
  "Cache-Control": "public, max-age=86400, immutable",
   "Access-Control-Allow-Origin": "*",
});
res.send(buffer);

  } catch (err) {
    console.error("[proxy-image] unexpected error:", err && err.stack ? err.stack : err);
    res.status(500).json({ ok: false, message: "Proxy internal error", error: err && err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "OK", timestamp: new Date().toISOString() }));

// 404 handler
app.use("*", (req, res) => res.status(404).json({ success: false, error: "Endpoint not found" }));


app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
