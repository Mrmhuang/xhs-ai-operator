/**
 * 图片路由 - 生成 / 上传 / 管理
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import pluginManager from '../plugin-manager.js';

const router = Router();

// 配置 multer 上传
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * POST /api/image/generate
 * AI 生成图片
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio = '3:4', style } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const generator = pluginManager.get('nano-banana');
    if (!generator) throw new Error('nano-banana plugin not available');

    const result = await generator.generate(prompt, { aspectRatio, style });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/image/generate-for-note
 * 根据笔记内容自动生成配图
 */
router.post('/generate-for-note', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'note is required' });

    const generator = pluginManager.get('nano-banana');
    if (!generator) throw new Error('nano-banana plugin not available');

    const result = await generator.generateForNote(note);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/image/upload
 * 上传图片（支持多张）
 */
router.post('/upload', upload.array('images', 9), (req, res) => {
  const files = req.files.map(f => ({
    filename: f.filename,
    url: `/uploads/${f.filename}`,
    path: f.path,
    size: f.size,
  }));
  res.json({ success: true, images: files });
});

/**
 * DELETE /api/image/:filename
 */
router.delete('/:filename', async (req, res) => {
  try {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filePath = path.join(uploadDir, req.params.filename);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ success: false, error: 'File not found' });
  }
});

export default router;
