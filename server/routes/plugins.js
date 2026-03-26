/**
 * 插件管理路由
 */
import { Router } from 'express';
import pluginManager from '../plugin-manager.js';

const router = Router();

/**
 * GET /api/plugins
 * 列出所有插件状态
 */
router.get('/', (req, res) => {
  res.json({ success: true, plugins: pluginManager.list() });
});

/**
 * POST /api/plugins/:name/enable
 */
router.post('/:name/enable', (req, res) => {
  pluginManager.enable(req.params.name);
  res.json({ success: true });
});

/**
 * POST /api/plugins/:name/disable
 */
router.post('/:name/disable', (req, res) => {
  pluginManager.disable(req.params.name);
  res.json({ success: true });
});

export default router;
