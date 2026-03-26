/**
 * 发布路由 - 小红书笔记发布
 */
import { Router } from 'express';
import pluginManager from '../plugin-manager.js';

const router = Router();

/**
 * POST /api/publish
 * 发布笔记到小红书
 */
router.post('/', async (req, res) => {
  try {
    const { note, imagePaths } = req.body;
    if (!note?.title || !note?.content) {
      return res.status(400).json({ error: 'note title and content are required' });
    }

    const publisher = pluginManager.get('xhs-publisher');
    if (!publisher) throw new Error('xhs-publisher plugin not available');

    const result = await publisher.publishNote(note, imagePaths || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/publish/status
 * 检查小红书登录状态
 */
router.get('/status', async (req, res) => {
  try {
    const publisher = pluginManager.get('xhs-publisher');
    if (!publisher) throw new Error('xhs-publisher plugin not available');

    const result = await publisher.getLoginStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/publish/search
 * 搜索小红书笔记
 */
router.get('/search', async (req, res) => {
  try {
    const { keyword, limit = 20 } = req.query;
    if (!keyword) return res.status(400).json({ error: 'keyword is required' });

    const publisher = pluginManager.get('xhs-publisher');
    if (!publisher) throw new Error('xhs-publisher plugin not available');

    const result = await publisher.searchNotes(keyword, { limit: Number(limit) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
