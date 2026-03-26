/**
 * 热点路由 - TrendRadar 热点数据（MCP 服务 + 内置 fallback）
 */
import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import pluginManager from '../plugin-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

/**
 * GET /api/trending/status
 * 获取 TrendRadar 服务状态（MCP 连接、平台信息等）
 */
router.get('/status', async (req, res) => {
  try {
    const tr = pluginManager.get('trendradar');
    if (!tr) throw new Error('trendradar plugin not available');

    const status = await tr.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trending/crawl
 * 手动触发 TrendRadar 爬虫抓取
 */
router.post('/crawl', async (req, res) => {
  try {
    const tr = pluginManager.get('trendradar');
    if (!tr) throw new Error('trendradar plugin not available');

    const result = await tr.runCrawler();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/trending/auto-refresh
 * 设置定时抓取（interval 单位：分钟，0 表示关闭）
 */
router.post('/auto-refresh', async (req, res) => {
  try {
    const { interval = 0 } = req.body || {};
    const tr = pluginManager.get('trendradar');
    if (!tr) throw new Error('trendradar plugin not available');

    const result = tr.setAutoRefresh(Number(interval));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trending/auto-refresh
 * 获取定时抓取状态
 */
router.get('/auto-refresh', async (req, res) => {
  try {
    const tr = pluginManager.get('trendradar');
    if (!tr) throw new Error('trendradar plugin not available');

    const status = tr.getAutoRefreshStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/trending/report
 * 获取最新报告 HTML 的 URL + 解析其中的热点新闻列表
 */
router.get('/report', async (req, res) => {
  try {
    const latestPath = path.join(__dirname, '..', '..', 'TrendRadar', 'output', 'html', 'latest', 'current.html');
    await fs.access(latestPath);

    // 解析 HTML 提取新闻条目（含平台来源）
    const html = await fs.readFile(latestPath, 'utf-8');
    const items = [];

    // 解析热榜区 news-item：提取 source-name + news-link
    const hotlistItemRegex = /<div class="news-item[^"]*">[\s\S]*?<div class="news-content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    const sourceNameRegex = /<span class="source-name">(.*?)<\/span>/;
    const newsLinkRegex = /<a\s+href="([^"]*)"[^>]*class="news-link"[^>]*>([\s\S]*?)<\/a>/;

    // 同时跟踪当前所在的 standalone-group 的平台名
    // 先用更简单的方式：逐行扫描确定上下文
    const lines = html.split('\n');
    let currentStandalonePlatform = '';
    let currentWordGroup = '';
    let inStandaloneSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测进入独立展示区（只匹配 HTML 元素，排除 CSS 样式定义）
      if (line.includes('class="standalone-section-title"') || line.includes("class='standalone-section-title'")) {
        inStandaloneSection = true;
        continue;
      }
      // 检测离开独立展示区（遇到下一个大区块时重置）
      if (inStandaloneSection && (line.includes('class="section-divider"') || line.includes('class="footer"'))) {
        inStandaloneSection = false;
      }

      // 检测 standalone 平台名
      if (inStandaloneSection && line.includes('standalone-name')) {
        const m = line.match(/<div class="standalone-name">(.*?)<\/div>/);
        if (m) currentStandalonePlatform = m[1].trim();
        continue;
      }

      // 检测热榜区关键词组名
      if (!inStandaloneSection && line.includes('word-name')) {
        const m = line.match(/<div class="word-name">(.*?)<\/div>/);
        if (m) currentWordGroup = m[1].trim();
        continue;
      }

      // 检测 RSS 区域的关键词分组名（feed-name）
      if (!inStandaloneSection && line.includes('feed-name')) {
        const m = line.match(/<div class="feed-name">(.*?)<\/div>/);
        if (m) currentWordGroup = m[1].trim();
        continue;
      }

      // 提取 news-link（跳过独立展示区）
      if (line.includes('class="news-link"')) {
        if (inStandaloneSection) continue; // 独立展示区的条目不纳入列表
        const linkMatch = line.match(/<a\s+href="([^"]*)"[^>]*class="news-link"[^>]*>([\s\S]*?)<\/a>/);
        if (linkMatch) {
          const url = linkMatch[1];
          const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
          // 向前找 source-name（热榜区有 source-name）
          let platform = '';
          for (let j = Math.max(0, i - 5); j < i; j++) {
            const sm = lines[j].match(/<span class="source-name">(.*?)<\/span>/);
            if (sm) { platform = sm[1].trim(); break; }
          }
          // 向前找 rank（排名数字）
          let rank = '';
          for (let j = Math.max(0, i - 5); j < i; j++) {
            const rm = lines[j].match(/<span class="rank[^"]*">\s*(\d+)\s*<\/span>/);
            if (rm) { rank = rm[1]; break; }
          }
          if (title) {
            items.push({ title, url, platform, keyword: currentWordGroup, rank });
          }
        }
      }

      // 提取 rss-link（跳过独立展示区）
      if (line.includes('class="rss-link"')) {
        if (inStandaloneSection) continue; // 独立展示区的条目不纳入列表
        const linkMatch = line.match(/<a\s+href="([^"]*)"[^>]*class="rss-link"[^>]*>([\s\S]*?)<\/a>/);
        if (linkMatch) {
          const url = linkMatch[1];
          const title = linkMatch[2].replace(/<[^>]*>/g, '').trim();
          // 往前找 rss-author
          let platform = '';
          for (let j = Math.max(0, i - 5); j < i; j++) {
            const am = lines[j].match(/<span class="rss-author">(.*?)<\/span>/);
            if (am) { platform = am[1].trim(); break; }
          }
          if (title) {
            items.push({ title, url, platform, keyword: currentWordGroup, rank: '' });
          }
        }
      }
    }

    res.json({ success: true, url: '/trend-report/html/latest/current.html', items });
  } catch {
    res.json({ success: false, error: '暂无报告，请先运行爬虫抓取热点' });
  }
});

export default router;
