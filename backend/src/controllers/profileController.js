const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/db');
const OSS = require('ali-oss');
require('dotenv').config();

const oss = new OSS({
  region: process.env.ALIYUN_OSS_REGION,
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  bucket: process.env.ALIYUN_OSS_BUCKET
});

const cleanupTempFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.warn('Failed to delete temp file:', filePath);
  }
};

exports.uploadMedia = async (req, res) => {
  try {
    const userId = req.user.id;
    const files = req.files || [];

    const images = files.filter(f => f.mimetype.startsWith('image/'));
    const videos = files.filter(f => f.mimetype === 'video/mp4');

    if (images.length > 10 || videos.length > 1) {
      return res.status(400).json({ error: 'Max 10 images + 1 video' });
    }

    const imageKeys = [];
    let videoKey = null;

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const key = `ambassadors/${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
      await oss.put(key, file.path);
      await cleanupTempFile(file.path);

      if (file.mimetype.startsWith('image/')) {
        imageKeys.push(key);
      } else if (file.mimetype === 'video/mp4') {
        videoKey = key;
      }
    }

    await pool.query(
      `UPDATE profiles SET images = $1, video_filename = $2 WHERE user_id = $3`,
      [imageKeys, videoKey, userId]
    );

    res.json({ message: 'Media uploaded successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
};

exports.getPublicProfiles = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nickname, p.images, p.video_filename
      FROM users u
      JOIN profiles p ON u.id = p.user_id
      WHERE u.is_ambassador = true
    `);

    const profiles = await Promise.all(
      result.rows.map(async (row) => ({
        id: row.id,
        nickname: row.nickname,
        images: row.images?.map(key => oss.signatureUrl(key, { expires: 3600 })) || [],
        video: row.video_filename ? oss.signatureUrl(row.video_filename, { expires: 3600 }) : null
      }))
    );

    res.json(profiles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load ambassadors' });
  }
};
