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

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Store browser instances and sessions
const browserInstances = new Map();
const userSessions = new Map();

// Validation middleware
const validateLogin = [
  body('username').trim().isLength({ min: 1 }).escape(),
  body('password').isLength({ min: 1 })
];

// Sanitize HTML content
const sanitizeContent = (content) => {
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {}
  });
};

// Instagram scraping function for authenticated users
async function scrapeInstagramPosts(username, password, sessionId = null) {
  let browser;
  let page;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    if (sessionId && userSessions.has(sessionId)) {
      // Use existing session cookies
      const cookies = userSessions.get(sessionId);
      await page.setCookie(...cookies);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
    } else {
      // Login flow
      await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
      
      // Wait for login form and fill credentials
      await page.waitForSelector('input[name="username"]');
      await page.type('input[name="username"]', username);
      await page.type('input[name="password"]', password);
      
      // Click login button
      await page.click('button[type="submit"]');
      
      // Wait for navigation and check for errors
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      } catch (error) {
        // Check if login failed
        const errorElement = await page.$('.eiCW-');
        if (errorElement) {
          throw new Error('Login failed. Please check your credentials.');
        }
      }
      
      // Save session cookies for future use
      const cookies = await page.cookies();
      const sessionId = Date.now().toString();
      userSessions.set(sessionId, cookies);
      
      // Navigate to profile
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
    }

    // Use improved scraping logic
    const posts = await scrapePostsWithMultipleSelectors(page);

    // Store browser instance for potential reuse
    const instanceId = Date.now().toString();
    browserInstances.set(instanceId, { browser, page, username });
    
    // Clean up old instances
    setTimeout(() => {
      if (browserInstances.has(instanceId)) {
        const instance = browserInstances.get(instanceId);
        instance.browser.close();
        browserInstances.delete(instanceId);
      }
    }, 300000); // 5 minutes

    return {
      success: true,
      posts: posts.map(post => ({
        ...post,
        caption: sanitizeContent(post.caption)
      })),
      sessionId: sessionId || instanceId
    };

  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  }
}

// Public Instagram profile scraping function (no login required)
async function scrapePublicInstagramProfile(username) {
  let browser;
  let page;
  
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate directly to public profile
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle2' });
    
    // Check if profile is public or private
    const isPrivate = await page.evaluate(() => {
      const privateText = document.body.innerText;
      return privateText.includes('This Account is Private') || 
             privateText.includes('This profile is private') ||
             privateText.includes('This Account is Private');
    });

    if (isPrivate) {
      throw new Error('This Instagram profile is private. Only public profiles can be viewed without login.');
    }

    // Use improved scraping logic
    const posts = await scrapePostsWithMultipleSelectors(page);

    // Store browser instance for potential reuse
    const instanceId = Date.now().toString();
    browserInstances.set(instanceId, { browser, page, username });
    
    // Clean up old instances
    setTimeout(() => {
      if (browserInstances.has(instanceId)) {
        const instance = browserInstances.get(instanceId);
        instance.browser.close();
        browserInstances.delete(instanceId);
      }
    }, 300000); // 5 minutes

    return {
      success: true,
      posts: posts.map(post => ({
        ...post,
        caption: sanitizeContent(post.caption)
      })),
      profileType: 'public'
    };

  } catch (error) {
    console.error('Public profile scraping error:', error);
    throw error;
  }
}

// Improved scraping function that tries multiple selectors and methods
async function scrapePostsWithMultipleSelectors(page) {
  let posts = [];
  let attempts = 0;
  const maxAttempts = 5;
  
  // Wait longer for Instagram to fully load
  await page.waitForTimeout(3000);
  
  while (attempts < maxAttempts && posts.length === 0) {
    try {
      // Method 1: Try to find posts by scrolling and waiting
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
      
      // Method 2: Try multiple modern selectors
      const selectors = [
        // Modern Instagram selectors
        'a[href*="/p/"]',
        'a[href*="/reel/"]',
        '[data-testid="user-post"] a',
        '[data-testid="user-post"]',
        'div[role="button"] a[href*="/p/"]',
        'div[role="button"] a[href*="/reel/"]',
        // Generic selectors
        'a[href*="/p/"]',
        'a[href*="/reel/"]',
        // Look for any link that contains post/reel URLs
        'a[href*="/p/"]',
        'a[href*="/reel/"]'
      ];
      
      for (const selector of selectors) {
        try {
          // Wait for any element matching this selector
          await page.waitForSelector(selector, { timeout: 3000 });
          
          posts = await page.evaluate((sel) => {
            const postElements = document.querySelectorAll(sel);
            const postsData = [];
            const seenUrls = new Set();
            
            // Get first 12 unique posts
            for (let i = 0; i < postElements.length && postsData.length < 12; i++) {
              const postElement = postElements[i];
              let postUrl = postElement.href;
              
              // Handle both direct links and parent containers
              if (!postUrl && postElement.tagName === 'A') {
                postUrl = postElement.href;
              } else if (!postUrl && postElement.querySelector('a')) {
                postUrl = postElement.querySelector('a').href;
              }
              
              if (postUrl && !seenUrls.has(postUrl)) {
                seenUrls.add(postUrl);
                
                // Find the image - try multiple approaches
                let imgElement = postElement.querySelector('img');
                if (!imgElement) {
                  // Look in parent elements
                  const parent = postElement.closest('div') || postElement.parentElement;
                  if (parent) {
                    imgElement = parent.querySelector('img');
                  }
                }
                if (!imgElement) {
                  // Look for any img in the same container
                  const container = postElement.closest('div') || postElement;
                  imgElement = container.querySelector('img');
                }
                
                if (imgElement && imgElement.src && imgElement.src !== 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZjAiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2Ugbm90IGZvdW5kPC90ZXh0Pjwvc3ZnPg==') {
                  postsData.push({
                    imageUrl: imgElement.src,
                    postUrl: postUrl,
                    timestamp: new Date().toISOString(),
                    caption: ''
                  });
                }
              }
            }
            
            return postsData;
          }, selector);
          
          if (posts.length > 0) {
            console.log(`Found ${posts.length} posts using selector: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`Selector ${selector} failed, trying next...`);
          continue;
        }
      }
      
      // Method 3: If no posts found, try to extract from page source
      if (posts.length === 0) {
        posts = await page.evaluate(() => {
          const pageText = document.body.innerText;
          const postUrls = [];
          const imgUrls = [];
          
          // Extract URLs from page source
          const urlRegex = /https:\/\/www\.instagram\.com\/p\/[a-zA-Z0-9_-]+\/?/g;
          const imgRegex = /https:\/\/[^"]*\.(?:jpg|jpeg|png|webp)[^"]*/g;
          
          let match;
          while ((match = urlRegex.exec(pageText)) !== null) {
            postUrls.push(match[0]);
          }
          
          while ((match = imgRegex.exec(pageText)) !== null) {
            imgUrls.push(match[0]);
          }
          
          const postsData = [];
          const maxPosts = Math.min(12, postUrls.length, imgUrls.length);
          
          for (let i = 0; i < maxPosts; i++) {
            postsData.push({
              imageUrl: imgUrls[i] || '',
              postUrl: postUrls[i] || '',
              timestamp: new Date().toISOString(),
              caption: ''
            });
          }
          
          return postsData;
        });
      }
      
      if (posts.length === 0) {
        // If still no posts, wait and try again
        await page.waitForTimeout(3000);
        attempts++;
        
        // Try scrolling again
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      attempts++;
      console.log(`Attempt ${attempts} failed:`, e.message);
      if (attempts >= maxAttempts) {
        throw new Error('Could not find Instagram posts. The page structure may have changed.');
      }
      await page.waitForTimeout(3000);
    }
  }
  
  if (posts.length === 0) {
    throw new Error('No Instagram posts found. The profile might be private or the page structure has changed.');
  }
  
  return posts;
}

// API Routes

// Login and scrape posts
app.post('/api/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { username, password } = req.body;
    
    const result = await scrapeInstagramPosts(username, password);
    
    res.json(result);
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to login and scrape posts' 
    });
  }
});

// Public profile scraping (no login required)
app.post('/api/public-profile', [
  body('username').trim().isLength({ min: 1 }).escape()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const { username } = req.body;
    
    const result = await scrapePublicInstagramProfile(username);
    
    res.json(result);
    
  } catch (error) {
    console.error('Public profile error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to scrape public profile' 
    });
  }
});

// Refresh posts using existing session
app.post('/api/refresh', async (req, res) => {
  try {
    const { username, sessionId } = req.body;
    
    if (!username || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and sessionId are required' 
      });
    }

    if (!userSessions.has(sessionId)) {
      return res.status(401).json({ 
        success: false, 
        error: 'Session expired. Please login again.' 
      });
    }

    const result = await scrapeInstagramPosts(username, null, sessionId);
    res.json(result);
    
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to refresh posts' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Close all browser instances
  for (const [id, instance] of browserInstances) {
    instance.browser.close();
    browserInstances.delete(id);
  }
  
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Close all browser instances
  for (const [id, instance] of browserInstances) {
    instance.browser.close();
    browserInstances.delete(id);
  }
  
  process.exit(0);
});
