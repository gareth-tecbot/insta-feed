import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const IG_USER_ID = process.env.IG_USER_ID;
const PAGE_TOKEN = process.env.IG_PAGE_ACCESS_TOKEN;

// GET 12 latest media with image + caption (handles albums/reels thumbnails too)
app.post('/api/embed-feed', async (req, res) => {
  try {
    if (!IG_USER_ID || !PAGE_TOKEN) {
      return res.status(500).json({ error: 'Server missing IG credentials' });
    }

    // Ask IG for 12 media items
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'children{media_type,media_url,thumbnail_url}'
    ].join(',');

    const url = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`;
    const { data } = await axios.get(url, {
      params: { fields, limit: 12, access_token: PAGE_TOKEN },
      timeout: 15000,
    });

    // Normalize to { id, image, caption, permalink }
    const posts = (data?.data || []).map(item => {
      // pick best displayable image:
      // - IMAGE/VIDEO: media_url or thumbnail_url
      // - CAROUSEL_ALBUM: first child image/thumbnail
      let image = item.media_url || item.thumbnail_url || null;
      if (!image && item.media_type === 'CAROUSEL_ALBUM' && item.children?.data?.length) {
        const first = item.children.data[0];
        image = first.media_url || first.thumbnail_url || null;
      }
      return {
        id: item.id,
        image,
        caption: item.caption || '',
        permalink: item.permalink,
      };
    }).filter(p => p.image); // only keep posts we can show

    return res.json({ success: true, posts });
  } catch (err) {
    console.error('IG fetch error:', err?.response?.data || err.message);
    // Bubble up some helpful messages
    const status = err?.response?.status || 500;
    if (status === 400 || status === 401 || status === 403) {
      return res.status(status).json({
        error: 'Instagram API auth/permission issue. Check token, scopes, and IG/Page connection.'
      });
    }
    return res.status(500).json({ error: 'Failed to fetch Instagram posts' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
