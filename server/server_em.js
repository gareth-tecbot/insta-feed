import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const SCRAPFLY_KEY = process.env.SCRAPFLY_KEY;

// Simple in-memory cache
const cache = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Function to fetch posts from Instagram via ScrapFly
const fetchInstagramPosts = async (username) => {
  const url = `https://www.instagram.com/${username}/?__a=1`;

  // Retry logic
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.get('https://api.scrapfly.io/scrape', {
        params: {
          key: SCRAPFLY_KEY,
          url,
          render_js: true,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        timeout: 20000,
      });

      const data = response.data;
      const posts = data.graphql?.user?.edge_owner_to_timeline_media?.edges || [];

      // Map first 12 posts
      return posts.slice(0, 12).map(edge => {
        const node = edge.node;
        return {
          id: node.id,
          image: node.display_url,
          caption: node.edge_media_to_caption.edges[0]?.node?.text || '',
          shortcode: node.shortcode,
        };
      });
    } catch (err) {
      attempts++;
      if (err.response?.status === 429) {
        console.warn(`Attempt ${attempts}: Instagram rate-limited (429). Retrying...`);
        await new Promise(r => setTimeout(r, 3000)); // wait 3s before retry
      } else {
        console.error('Fetch error:', err.message);
        throw err;
      }
    }
  }

  throw new Error('Failed to fetch Instagram posts after retries.');
};

app.post('/api/embed-feed', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const now = Date.now();
  const cached = cache[username];
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return res.json({ success: true, posts: cached.data });
  }

  try {
    const posts = await fetchInstagramPosts(username);
    cache[username] = { data: posts, timestamp: now };
    res.json({ success: true, posts });
  } catch (err) {
    console.error('Server fetch error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch Instagram posts' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
