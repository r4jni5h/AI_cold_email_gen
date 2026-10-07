const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { generateEmail, getHistory, deleteHistoryItem } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware');

// Each generation costs an AI call - limit per user
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.user?._id || req.ip),
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'Too many requests. Please wait a minute before generating again.' },
});

router.post('/generate-email', protect, generateLimiter, generateEmail);
router.get('/history', protect, getHistory);
router.delete('/history/:id', protect, deleteHistoryItem);

module.exports = router;
