const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../users.json');

// Default accounts — created automatically if users.json doesn't exist
const DEFAULT_USERS = {
  "demo@alister.ai": {
    "email": "demo@alister.ai",
    "password": "alister2024",
    "name": "Demo User",
    "company": "Alister",
    "credits": 100
  },
  "admin@alaiy.com": {
    "email": "admin@alaiy.com",
    "password": "123",
    "name": "Admin",
    "company": "Alaiy",
    "credits": 100
  },
  "lucaszunz@thesolist.com": {
    "email": "lucaszunz@thesolist.com",
    "password": "alister2026",
    "name": "Lucas",
    "company": "The Solist",
    "credits": 100
  }
};

// Ensure users.json exists on startup
if (!fs.existsSync(USERS_FILE)) {
  console.log('[Auth] users.json not found, creating with default accounts...');
  fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2), 'utf8');
}

// Load users from JSON file
function loadUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Auth] Failed to load users.json:', err.message);
    return DEFAULT_USERS;
  }
}

// Save users to JSON file
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth] Failed to save users.json:', err.message);
  }
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const users = loadUsers();
  const user = users[email.toLowerCase()];

  if (user && user.password === password) {
    req.session.user = {
      email: user.email,
      name: user.name,
      company: user.company
    };
    
    return res.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        company: user.company
      },
      credits: user.credits
    });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    const users = loadUsers();
    const user = users[req.session.user.email.toLowerCase()];
    
    return res.json({
      user: req.session.user,
      credits: user ? user.credits : 0
    });
  }
  return res.status(401).json({ error: 'Not authenticated' });
});

/**
 * POST /api/auth/deduct
 * Deducts 1 credit from the user's account. Called after each successful operation.
 */
router.post('/deduct', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const users = loadUsers();
  const userEmail = req.session.user.email.toLowerCase();
  const user = users[userEmail];
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (user.credits > 0) {
    user.credits -= 1;
    users[userEmail] = user;
    saveUsers(users);
  }
  
  return res.json({ credits: user.credits });
});

module.exports = router;
