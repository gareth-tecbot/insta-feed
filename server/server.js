const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Enhanced scraping function with multiple strategies
async function scrapePostsWithMultipleStrategies(page, username) {
  console.log(`Starting enhanced scraping for ${username}...`);
  
  try {
    // Wait for page to load completely
    await page.waitForTimeout(5000);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: `debug_${username}.png`, fullPage: true });
    console.log(`Screenshot saved as debug_${username}.png`);
    
    // Strategy 1: Try to find posts using modern Instagram selectors
    console.log('Strategy 1: Modern Instagram selectors...');
    let posts = await tryModernSelectors(page);
    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts with modern selectors`);
      return posts;
    }
    
    // Strategy 2: Look for any clickable elements that might be posts
    console.log('Strategy 2: Generic post detection...');
    posts = await tryGenericPostDetection(page);
    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts with generic detection`);
      return posts;
    }
    
    // Strategy 3: Parse page source for post URLs
    console.log('Strategy 3: Page source parsing...');
    posts = await tryPageSourceParsing(page);
    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts with source parsing`);
      return posts;
    }
    
    // Strategy 4: Try to find any media elements
    console.log('Strategy 4: Media element detection...');
    posts = await tryMediaElementDetection(page);
    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts with media detection`);
      return posts;
    }
    
    throw new Error('All scraping strategies failed');
    
  } catch (error) {
    console.error('Enhanced scraping error:', error);
    throw error;
  }
}

async function tryModernSelectors(page) {
  const selectors = [
    'a[href*="/p/"]',
    'a[href*="/reel/"]',
    '[data-testid="user-post"]',
    'div[role="button"] a[href*="/p/"]',
    'div[role="button"] a[href*="/reel/"]',
    'article a[href*="/p/"]',
    'article a[href*="/reel/"]',
    'div[data-testid="post"]',
    'div[data-testid="reel"]'
  ];
  
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`Selector ${selector} found ${elements.length} elements`);
        return await extractPostsFromElements(elements, page);
      }
    } catch (error) {
      console.log(`Selector ${selector} failed:`, error.message);
    }
  }
  return [];
}

async function tryGenericPostDetection(page) {
  try {
    // Look for any elements that might contain post information
    const possiblePosts = await page.evaluate(() => {
      const posts = [];
      
      // Find all links that might be posts
      const links = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
      links.forEach(link => {
        const postUrl = link.href;
        const postElement = link.closest('div') || link.parentElement;
        
        if (postElement) {
          // Try to find an image
          const img = postElement.querySelector('img');
          const imageUrl = img ? img.src : null;
          
          posts.push({
            url: postUrl,
            imageUrl: imageUrl,
            caption: '',
            timestamp: new Date().toISOString()
          });
        }
      });
      
      return posts;
    });
    
    return possiblePosts.slice(0, 12);
  } catch (error) {
    console.log('Generic post detection failed:', error.message);
    return [];
  }
}

async function tryPageSourceParsing(page) {
  try {
    const pageContent = await page.content();
    
    // Extract post URLs using regex
    const postUrlRegex = /https:\/\/www\.instagram\.com\/p\/[A-Za-z0-9_-]+\/?/g;
    const reelUrlRegex = /https:\/\/www\.instagram\.com\/reel\/[A-Za-z0-9_-]+\/?/g;
    
    const postUrls = [...new Set([...pageContent.match(postUrlRegex) || [], ...pageContent.match(reelUrlRegex) || []])];
    
    // Extract image URLs
    const imageUrlRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*/g;
    const imageUrls = [...new Set(pageContent.match(imageUrlRegex) || [])];
    
    const posts = postUrls.slice(0, 12).map((url, index) => ({
      url: url,
      imageUrl: imageUrls[index] || null,
      caption: '',
      timestamp: new Date().toISOString()
    }));
    
    return posts;
  } catch (error) {
    console.log('Page source parsing failed:', error.message);
    return [];
  }
}

async function tryMediaElementDetection(page) {
  try {
    const mediaElements = await page.evaluate(() => {
      const posts = [];
      
      // Find all images that might be post images
      const images = document.querySelectorAll('img');
      images.forEach((img, index) => {
        if (img.src && img.src.includes('instagram') && index < 12) {
          // Try to find the closest link or container
          let container = img.closest('a') || img.closest('div') || img.parentElement;
          
          if (container) {
            let postUrl = '';
            if (container.tagName === 'A') {
              postUrl = container.href;
            } else {
              // Look for a link in the container
              const link = container.querySelector('a');
              if (link) postUrl = link.href;
            }
            
            posts.push({
              url: postUrl || `#post-${index}`,
              imageUrl: img.src,
              caption: img.alt || '',
              timestamp: new Date().toISOString()
            });
          }
        }
      });
      
      return posts;
    });
    
    return mediaElements.slice(0, 12);
  } catch (error) {
    console.log('Media element detection failed:', error.message);
    return [];
  }
}

async function extractPostsFromElements(elements, page) {
  const posts = [];
  
  for (let i = 0; i < Math.min(elements.length, 12); i++) {
    try {
      const post = await page.evaluate((element) => {
        const postUrl = element.href || element.querySelector('a')?.href || '';
        const img = element.querySelector('img') || element.closest('div')?.querySelector('img');
        const imageUrl = img ? img.src : '';
        const caption = img ? img.alt || '' : '';
        
        return {
          url: postUrl,
          imageUrl: imageUrl,
          caption: caption,
          timestamp: new Date().toISOString()
        };
      }, elements[i]);
      
      if (post.url || post.imageUrl) {
        posts.push(post);
      }
    } catch (error) {
      console.log(`Error extracting post ${i}:`, error.message);
    }
  }
  
  return posts;
}

// Scrape Instagram posts for authenticated users
async function scrapeInstagramPosts(username, password) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set mobile user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 375, height: 667, isMobile: true });
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    console.log('Navigating to Instagram login page...');
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    console.log('Filling login form...');
    await page.type('input[name="username"]', username);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');

    console.log('Waiting for login to complete...');
    await page.waitForTimeout(5000);

    // Check if login was successful
    const isLoggedIn = await page.evaluate(() => {
      return !document.querySelector('input[name="username"]');
    });

    if (!isLoggedIn) {
      throw new Error('Login failed. Please check your credentials.');
    }

    console.log('Login successful, navigating to profile...');
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);

    // Use the enhanced scraping function
    const posts = await scrapePostsWithMultipleStrategies(page, username);
    
    if (posts.length === 0) {
      throw new Error('No posts found. The profile might be private.');
    }

    // Store session cookies
    const cookies = await page.cookies();
    return { posts, cookies };

  } finally {
    await browser.close();
  }
}

// Scrape public Instagram profile without login
async function scrapePublicInstagramProfile(username) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set mobile user agent and viewport
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 375, height: 667, isMobile: true });
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    console.log(`Navigating to public profile: ${username}`);
    await page.goto(`https://www.instagram.com/${username}/`, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    await page.waitForTimeout(5000);

    // Check if profile is private
    const isPrivate = await page.evaluate(() => {
      const privateText = document.body.textContent.toLowerCase();
      return privateText.includes('private') || privateText.includes('this account is private');
    });

    if (isPrivate) {
      throw new Error('This Instagram profile is private and cannot be viewed without authentication.');
    }

    // Use the enhanced scraping function
    const posts = await scrapePostsWithMultipleStrategies(page, username);
    
    if (posts.length === 0) {
      throw new Error('No Instagram posts found. The profile might be private or the page structure has changed.');
    }

    return posts;

  } finally {
    await browser.close();
  }
}

// API Routes
app.post('/api/login', [
  body('username').trim().isLength({ min: 1 }).escape(),
  body('password').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username, password } = req.body;
    const sanitizedUsername = sanitizeHtml(username);
    
    console.log(`Login attempt for username: ${sanitizedUsername}`);
    
    const result = await scrapeInstagramPosts(sanitizedUsername, password);
    
    // Store session data
    req.session.instagramUser = sanitizedUsername;
    req.session.instagramCookies = result.cookies;
    
    res.json({ 
      success: true, 
      posts: result.posts,
      message: 'Successfully scraped Instagram posts'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/public-profile', [
  body('username').trim().isLength({ min: 1 }).escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { username } = req.body;
    const sanitizedUsername = sanitizeHtml(username);
    
    console.log(`Public profile request for username: ${sanitizedUsername}`);
    
    const posts = await scrapePublicInstagramProfile(sanitizedUsername);
    
    res.json({ 
      success: true, 
      posts: posts,
      message: 'Successfully scraped public Instagram profile'
    });
    
  } catch (error) {
    console.error('Public profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    if (!req.session.instagramUser || !req.session.instagramCookies) {
      return res.status(401).json({ 
        success: false, 
        error: 'No active session found. Please login again.' 
      });
    }

    const username = req.session.instagramUser;
    const cookies = req.session.instagramCookies;
    
    console.log(`Refreshing posts for user: ${username}`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    try {
      const page = await browser.newPage();
      
      // Set mobile user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1');
      await page.setViewport({ width: 375, height: 667, isMobile: true });
      
      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });

      // Set cookies from previous session
      await page.setCookie(...cookies);
      
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(3000);

      // Use the enhanced scraping function
      const posts = await scrapePostsWithMultipleStrategies(page, username);
      
      if (posts.length === 0) {
        throw new Error('No posts found during refresh.');
      }

      // Update session cookies
      const newCookies = await page.cookies();
      req.session.instagramCookies = newCookies;

      res.json({ 
        success: true, 
        posts: posts,
        message: 'Successfully refreshed Instagram posts'
      });
      
    } finally {
      await browser.close();
    }
    
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Instagram Feed Widget API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found' 
  });
});

app.listen(PORT, () => {
  console.log(`Instagram Feed Widget API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
