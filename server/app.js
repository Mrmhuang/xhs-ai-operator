/**
 * XHS AI Operator - 主入口
 * AI 小红书运营工作台后端
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// 插件系统
import pluginManager from './plugin-manager.js';
import urlScraper from './plugins/url-scraper.js';
import deepseekWriter from './plugins/deepseek-writer.js';
import nanoBanana from './plugins/nano-banana.js';
import trendradar from './plugins/trendradar.js';
import xhsPublisher from './plugins/xhs-publisher.js';

// 路由
import chatRouter from './routes/chat.js';
import imageRouter from './routes/image.js';
import trendingRouter from './routes/trending.js';
import publishRouter from './routes/publish.js';
import pluginsRouter from './routes/plugins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 静态文件 - 上传的图片
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
await fs.mkdir(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// 静态文件 - TrendRadar 报告 HTML（注入 postMessage 脚本使 iframe 内可联动）
const trendReportDir = path.join(__dirname, '..', 'TrendRadar', 'output');
try {
  await fs.access(trendReportDir);
  // 对 HTML 文件注入交互脚本，其余文件直接静态返回
  app.use('/trend-report', async (req, res, next) => {
    if (!req.path.endsWith('.html')) return next();
    try {
      const filePath = path.join(trendReportDir, req.path);
      let html = await fs.readFile(filePath, 'utf-8');
      // 注入脚本：为每条新闻添加"新窗口打开"按钮 + 点击标题联动到主应用
      const injectScript = `
<style>
.injected-open-btn {
  display: inline-flex; align-items: center; gap: 3px;
  margin-left: 8px; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; color: #666; background: #f5f5f5; border: 1px solid #e0e0e0;
  cursor: pointer; text-decoration: none; white-space: nowrap; vertical-align: middle;
  transition: all 0.15s;
}
.injected-open-btn:hover { color: #4f46e5; border-color: #4f46e5; background: #f0f0ff; }
.injected-open-btn svg { width: 10px; height: 10px; }
/* 隐藏独立展示区 */
.standalone-section { display: none !important; }
</style>
<script>
(function() {
  // 为每个 news-link / rss-link 添加"新窗口"按钮
  var links = document.querySelectorAll('a.news-link, a.rss-link');
  links.forEach(function(link) {
    var btn = document.createElement('a');
    btn.href = link.href;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.className = 'injected-open-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>新窗口';
    btn.addEventListener('click', function(e) { e.stopPropagation(); });
    link.parentNode.insertBefore(btn, link.nextSibling);

    // 标题点击 -> postMessage 联动主应用
    link.addEventListener('click', function(e) {
      if (window.parent !== window) {
        e.preventDefault();
        e.stopPropagation();
        window.parent.postMessage({
          type: 'TREND_REPORT_CLICK',
          title: link.textContent.trim(),
          url: link.href
        }, '*');
      }
    });
  });
})();
</script>`;
      html = html.replace('</body>', injectScript + '\n</body>');
      res.type('html').send(html);
    } catch {
      next();
    }
  });
  app.use('/trend-report', express.static(trendReportDir));
} catch {
  // TrendRadar/output 不存在，跳过
}

// 生产环境下提供前端静态文件
const distPath = path.join(__dirname, '..', 'web', 'dist');
try {
  await fs.access(distPath);
  app.use(express.static(distPath));
} catch {
  // web/dist 不存在，跳过
}

// 注册插件
pluginManager.register(urlScraper);
pluginManager.register(deepseekWriter);
pluginManager.register(nanoBanana);
pluginManager.register(trendradar);
pluginManager.register(xhsPublisher);

// API 路由
app.use('/api/chat', chatRouter);
app.use('/api/image', imageRouter);
app.use('/api/trending', trendingRouter);
app.use('/api/publish', publishRouter);
app.use('/api/plugins', pluginsRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    plugins: pluginManager.list(),
    timestamp: new Date().toISOString(),
  });
});

// SPA 回退路由
app.get('*', async (req, res) => {
  try {
    const indexPath = path.join(distPath, 'index.html');
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch {
    res.status(404).json({ error: 'Not found. Run "npm run build" to build the frontend.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 XHS AI Operator running at http://localhost:${PORT}`);
  console.log(`📦 Plugins: ${pluginManager.list().map(p => p.name).join(', ')}`);
  console.log(`📁 Upload dir: ${uploadDir}\n`);
});
