// src/routes/profiles.js
const express = require('express');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { getPublicProfiles, uploadMedia } = require('../controllers/profileController');
const router = express.Router();

router.get('/', getPublicProfiles);
router.post('/upload', protect, upload.array('media', 11), uploadMedia);

module.exports = router;