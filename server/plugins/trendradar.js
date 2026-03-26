/**
 * TrendRadar 热点插件
 *
 * 优先通过 MCP 协议对接外部 TrendRadar 服务（支持 40+ 平台），
 * 若 MCP 服务不可用则回退到内置抓取（Google News / Bing News）。
 *
 * 环境变量：
 *   TRENDRADAR_MCP_URL  - TrendRadar MCP 服务地址（如 http://localhost:3001/mcp）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYWORDS_FILE = path.join(__dirname, '..', 'frequency_words.txt');
const TRENDRADAR_DIR = path.join(__dirname, '..', '..', 'TrendRadar');

// 缓存
let cache = {
  news: [],
  topics: [],
  lastFetchTime: 0,
};
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 定时抓取状态
let crawlTimer = null;
let crawlIntervalMs = 0;
let lastCrawlTime = 0;
let crawlRunning = false;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 获取 MCP 服务地址 */
function getMcpUrl() {
  return process.env.TRENDRADAR_MCP_URL || '';
}

/** 自增 JSON-RPC id */
let rpcId = 0;

/** MCP Session 状态 */
let mcpSessionId = null;
let mcpSessionInitialized = false;

/**
 * 初始化 MCP 会话（Streamable HTTP 协议要求）
 */
async function ensureMcpSession() {
  if (mcpSessionInitialized && mcpSessionId) return;

  const mcpUrl = getMcpUrl();
  if (!mcpUrl) return;

  try {
    const initRes = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++rpcId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'xhs-ai-operator-trendradar', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    // 提取 Session ID
    mcpSessionId = initRes.headers.get('mcp-session-id') || null;

    // 解析 SSE 或 JSON 响应
    const contentType = initRes.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      await initRes.text(); // 消费掉响应体
    } else {
      await initRes.json();
    }

    // 发送 initialized 通知
    const notifyHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (mcpSessionId) notifyHeaders['Mcp-Session-Id'] = mcpSessionId;

    await fetch(mcpUrl, {
      method: 'POST',
      headers: notifyHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    mcpSessionInitialized = true;
    console.log(`[TrendRadar MCP] 会话已初始化${mcpSessionId ? `, Session: ${mcpSessionId.slice(0, 8)}...` : ''}`);
  } catch (e) {
    console.warn('[TrendRadar MCP] 会话初始化失败:', e.message);
    mcpSessionId = null;
    mcpSessionInitialized = false;
  }
}

/**
 * 调用 TrendRadar MCP 工具
 * @param {string} toolName - MCP 工具名，如 get_latest_news, search_news
 * @param {object} args - 工具参数
 * @returns {object|null} 返回结果，失败返回 null
 */
async function callMcpTool(toolName, args = {}) {
  const mcpUrl = getMcpUrl();
  if (!mcpUrl) return null;

  try {
    await ensureMcpSession();

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (mcpSessionId) headers['Mcp-Session-Id'] = mcpSessionId;

    const body = {
      jsonrpc: '2.0',
      id: ++rpcId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const contentType = res.headers.get('content-type') || '';

    // SSE 流式响应
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.result) return data.result;
          } catch { /* skip non-JSON lines */ }
        }
      }
      return null;
    }

    // 普通 JSON 响应
    const json = await res.json();
    if (json.error) {
      // 会话失效，重置并重试
      if (json.error.message?.includes('session') || json.error.message?.includes('initializ')) {
        mcpSessionId = null;
        mcpSessionInitialized = false;
        await ensureMcpSession();

        const retryHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
        if (mcpSessionId) retryHeaders['Mcp-Session-Id'] = mcpSessionId;

        const retryRes = await fetch(mcpUrl, { method: 'POST', headers: retryHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
        const retryContentType = retryRes.headers.get('content-type') || '';
        if (retryContentType.includes('text/event-stream')) {
          const text = await retryRes.text();
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              try { const d = JSON.parse(line.slice(6)); if (d.result) return d.result; } catch {}
            }
          }
          return null;
        }
        const retryJson = await retryRes.json();
        if (retryJson.error) { console.error(`[TrendRadar MCP] 重试 ${toolName} 错误:`, retryJson.error); return null; }
        return retryJson.result || null;
      }
      console.error(`[TrendRadar MCP] 工具 ${toolName} 错误:`, json.error);
      return null;
    }
    return json.result || null;
  } catch (e) {
    console.warn(`[TrendRadar MCP] 调用 ${toolName} 失败:`, e.message);
    return null;
  }
}

/**
 * 解析 MCP 返回的 content 数组，提取文本内容
 */
function parseMcpContent(result) {
  if (!result) return null;
  const content = result.content || result;
  if (Array.isArray(content)) {
    const textParts = content.filter(c => c.type === 'text').map(c => c.text);
    const joined = textParts.join('\n');
    try {
      return JSON.parse(joined);
    } catch {
      return joined;
    }
  }
  return content;
}

// ============================================================
// 主插件对象
// ============================================================
const trendradar = {
  name: 'trendradar',
  description: 'TrendRadar 热点追踪（MCP 服务 + 内置 fallback）',

  /**
   * 检测 MCP 服务是否可用
   */
  async _isMcpAvailable() {
    const mcpUrl = getMcpUrl();
    if (!mcpUrl) return false;
    try {
      const res = await fetch(mcpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ============================================================
  // 对外接口：优先走 MCP，失败走内置 fallback
  // ============================================================

  /**
   * 获取最新热点
   */
  async getLatestNews(options = {}) {
    const { limit = 20, keyword, forceRefresh = false } = options;

    // 检查缓存
    const now = Date.now();
    if (!forceRefresh && cache.news.length > 0 && (now - cache.lastFetchTime) < CACHE_TTL) {
      let filtered = cache.news;
      if (keyword && keyword !== 'AI') {
        filtered = filtered.filter(item =>
          `${item.title} ${item.description || ''}`.toLowerCase().includes(keyword.toLowerCase())
        );
      }
      return { success: true, data: filtered.slice(0, limit), source: 'cache' };
    }

    // 尝试 MCP（请求包含 URL）
    const mcpResult = await callMcpTool('get_latest_news', {
      limit,
      include_url: true,
      ...(keyword && keyword !== 'AI' ? { keyword } : {}),
    });
    const parsed = parseMcpContent(mcpResult);

    const rawList = parsed && Array.isArray(parsed) ? parsed
      : (parsed && parsed.data && Array.isArray(parsed.data)) ? parsed.data
      : null;

    if (rawList && rawList.length > 0) {
      // 标准化 MCP 返回的字段，使其与前端期望一致
      const normalized = rawList.map(item => ({
        title: item.title || '',
        url: item.url || item.mobileUrl || '',
        source: item.platform_name || item.platform || '',
        publishedAt: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
        keyword: item.keyword || '',
        description: item.description || '',
        rank: item.rank,
      }));
      cache = { news: normalized, topics: [], lastFetchTime: now };
      return { success: true, data: normalized.slice(0, limit), source: 'mcp' };
    }

    // MCP 不可用，回退内置抓取
    console.log('[TrendRadar] MCP 不可用，使用内置抓取');
    return this._fallbackGetLatestNews(options);
  },

  /**
   * 搜索新闻
   */
  async searchNews(query, options = {}) {
    const { limit = 20 } = options;

    // 先尝试缓存
    if (cache.news.length > 0) {
      const q = query.toLowerCase();
      const filtered = cache.news.filter(item =>
        `${item.title} ${item.description || ''} ${item.keyword || ''}`.toLowerCase().includes(q)
      );
      if (filtered.length > 0) {
        return { success: true, data: filtered.slice(0, limit), source: 'cache' };
      }
    }

    // 尝试 MCP
    const mcpResult = await callMcpTool('search_news', { keyword: query, limit });
    const parsed = parseMcpContent(mcpResult);

    if (parsed && Array.isArray(parsed)) {
      return { success: true, data: parsed.slice(0, limit), source: 'mcp' };
    }
    if (parsed && parsed.data && Array.isArray(parsed.data)) {
      return { success: true, data: parsed.data.slice(0, limit), source: 'mcp' };
    }

    // 回退内置
    return this._fallbackSearchNews(query, options);
  },

  /**
   * 获取热门话题
   */
  async getTrendingTopics(options = {}) {
    const { limit = 10 } = options;

    // 缓存
    if (cache.topics.length > 0 && (Date.now() - cache.lastFetchTime) < CACHE_TTL) {
      return { success: true, data: cache.topics.slice(0, limit), source: 'cache' };
    }

    // 尝试 MCP
    const mcpResult = await callMcpTool('get_trending_topics', { limit });
    const parsed = parseMcpContent(mcpResult);

    if (parsed && Array.isArray(parsed)) {
      cache.topics = parsed;
      cache.lastFetchTime = Date.now();
      return { success: true, data: parsed.slice(0, limit), source: 'mcp' };
    }
    if (parsed && parsed.data && Array.isArray(parsed.data)) {
      cache.topics = parsed.data;
      cache.lastFetchTime = Date.now();
      return { success: true, data: parsed.data.slice(0, limit), source: 'mcp' };
    }

    // 回退：先抓取再统计
    await this._fallbackGetLatestNews({ limit: 50, forceRefresh: true });
    return { success: true, data: cache.topics.slice(0, limit), source: 'fallback' };
  },

  /**
   * 话题趋势分析
   */
  async analyzeTrend(topic) {
    // 尝试 MCP
    const mcpResult = await callMcpTool('analyze_topic_trend', { topic });
    const parsed = parseMcpContent(mcpResult);

    if (parsed) {
      return { success: true, data: parsed, source: 'mcp' };
    }

    // 回退
    const result = await this.searchNews(topic, { limit: 20 });
    if (!result.success) return result;

    const news = result.data;
    return {
      success: true,
      data: {
        topic,
        totalArticles: news.length,
        sources: [...new Set(news.map(n => n.source))],
        latestArticles: news.slice(0, 5),
        summary: `近期关于「${topic}」共发现 ${news.length} 篇相关文章，来自 ${[...new Set(news.map(n => n.source))].join('、')} 等媒体。`,
      },
      source: 'fallback',
    };
  },

  /**
   * 获取关键词列表
   */
  getKeywords() {
    return this._loadKeywords();
  },

  /**
   * 获取系统状态（MCP 连接状态 + 平台信息）
   */
  async getStatus() {
    const mcpAvailable = await this._isMcpAvailable();

    // 如果 MCP 可用，尝试获取配置
    if (mcpAvailable) {
      const configResult = await callMcpTool('get_current_config', {});
      const parsed = parseMcpContent(configResult);
      return {
        mode: 'mcp',
        mcpUrl: getMcpUrl(),
        mcpAvailable: true,
        config: parsed || null,
      };
    }

    return {
      mode: 'fallback',
      mcpUrl: getMcpUrl() || '(未配置)',
      mcpAvailable: false,
      fallbackSources: ['Google News RSS', 'Bing News RSS'],
      hint: '请启动 TrendRadar 服务并配置 TRENDRADAR_MCP_URL 以获取 40+ 平台支持',
    };
  },

  // ============================================================
  // 爬虫触发 + 定时抓取
  // ============================================================

  /**
   * 手动触发 TrendRadar 爬虫
   * 通过 `uv run trendradar` 命令抓取最新数据
   */
  async runCrawler() {
    if (crawlRunning) {
      return { success: false, error: '爬虫正在运行中，请稍后再试' };
    }

    // 检查 TrendRadar 目录是否存在
    if (!fs.existsSync(TRENDRADAR_DIR)) {
      return { success: false, error: 'TrendRadar 目录不存在，请先克隆项目' };
    }

    crawlRunning = true;
    console.log('[TrendRadar] 开始运行爬虫...');

    return new Promise((resolve) => {
      const uvPath = process.env.UV_PATH || 'uv';
      execFile(uvPath, ['run', 'trendradar'], {
        cwd: TRENDRADAR_DIR,
        timeout: 120000,
        env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
      }, (error, stdout) => {
        crawlRunning = false;
        lastCrawlTime = Date.now();

        if (error) {
          console.error('[TrendRadar] 爬虫运行失败:', error.message);
          resolve({ success: false, error: error.message });
          return;
        }

        // 解析抓取结果
        const totalMatch = stdout.match(/共获取\s*(\d+)\s*条/);
        const total = totalMatch ? parseInt(totalMatch[1]) : 0;
        console.log(`[TrendRadar] 爬虫完成，抓取 ${total} 条数据`);

        // 清除缓存，下次请求会重新从 MCP 获取最新数据
        cache = { news: [], topics: [], lastFetchTime: 0 };

        resolve({
          success: true,
          data: {
            total,
            time: new Date().toISOString(),
            output: stdout.slice(-500),
          },
        });
      });
    });
  },

  /**
   * 启动/停止定时抓取
   * @param {number} intervalMinutes - 间隔分钟数，0 表示停止
   */
  setAutoRefresh(intervalMinutes) {
    // 清除旧定时器
    if (crawlTimer) {
      clearInterval(crawlTimer);
      crawlTimer = null;
      crawlIntervalMs = 0;
      console.log('[TrendRadar] 已停止定时抓取');
    }

    if (intervalMinutes <= 0) {
      return { success: true, enabled: false, interval: 0 };
    }

    crawlIntervalMs = intervalMinutes * 60 * 1000;
    crawlTimer = setInterval(async () => {
      console.log(`[TrendRadar] 定时抓取触发 (每 ${intervalMinutes} 分钟)`);
      await this.runCrawler();
    }, crawlIntervalMs);

    console.log(`[TrendRadar] 已启动定时抓取，间隔 ${intervalMinutes} 分钟`);
    return { success: true, enabled: true, interval: intervalMinutes };
  },

  /**
   * 获取定时抓取状态
   */
  getAutoRefreshStatus() {
    return {
      enabled: crawlTimer !== null,
      intervalMinutes: crawlIntervalMs / 60000,
      lastCrawlTime: lastCrawlTime ? new Date(lastCrawlTime).toISOString() : null,
      crawlRunning,
    };
  },

  // ============================================================
  // 内置 fallback 方法（MCP 不可用时使用）
  // ============================================================

  _loadKeywords() {
    try {
      const content = fs.readFileSync(KEYWORDS_FILE, 'utf-8');
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } catch (e) {
      console.error('[TrendRadar] 读取关键词文件失败:', e.message);
      return ['AI', 'OpenAI', 'DeepSeek', 'Claude', 'AGI'];
    }
  },

  _dedup(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = (item.title || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  _decodeHtml(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  },

  async _fetchGoogleNews(keyword) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      const xml = await res.text();

      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = block.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') || '';
        const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        const source = block.match(/<source.*?>(.*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') || '';

        if (title) {
          items.push({
            title: this._decodeHtml(title),
            url: link,
            source: this._decodeHtml(source) || 'Google News',
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            keyword,
          });
        }
      }
      return items.slice(0, 5);
    } catch {
      return [];
    }
  },

  async _fetchBingNews(keyword) {
    try {
      const url = `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&format=rss`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000),
      });
      const xml = await res.text();

      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = block.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') || '';
        const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        const desc = block.match(/<description>(.*?)<\/description>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') || '';

        if (title) {
          items.push({
            title: this._decodeHtml(title),
            url: link,
            source: 'Bing News',
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            description: this._decodeHtml(desc).replace(/<[^>]*>/g, '').slice(0, 200),
            keyword,
          });
        }
      }
      return items.slice(0, 5);
    } catch {
      return [];
    }
  },

  _extractTopics(news, keywords) {
    const counts = {};
    for (const kw of keywords) {
      counts[kw] = 0;
    }
    for (const item of news) {
      const text = `${item.title} ${item.description || ''}`.toLowerCase();
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          counts[kw] = (counts[kw] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  },

  async _fallbackGetLatestNews(options = {}) {
    const { limit = 20, keyword, forceRefresh = false } = options;
    const now = Date.now();

    if (!forceRefresh && cache.news.length > 0 && (now - cache.lastFetchTime) < CACHE_TTL) {
      let filtered = cache.news;
      if (keyword && keyword !== 'AI') {
        filtered = filtered.filter(item =>
          `${item.title} ${item.description || ''}`.toLowerCase().includes(keyword.toLowerCase())
        );
      }
      return { success: true, data: filtered.slice(0, limit), source: 'fallback-cache' };
    }

    try {
      const keywords = this._loadKeywords();
      console.log(`[TrendRadar Fallback] 内置抓取，关键词数: ${keywords.length}`);

      const tasks = [];
      for (const kw of keywords) {
        tasks.push(this._fetchGoogleNews(kw));
        tasks.push(this._fetchBingNews(kw));
      }

      const results = await Promise.allSettled(tasks);
      const allItems = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          allItems.push(...r.value);
        }
      }

      const deduped = this._dedup(allItems);
      deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

      const topics = this._extractTopics(deduped, keywords);
      cache = { news: deduped, topics, lastFetchTime: now };

      let filtered = deduped;
      if (keyword && keyword !== 'AI') {
        filtered = filtered.filter(item =>
          `${item.title} ${item.description || ''}`.toLowerCase().includes(keyword.toLowerCase())
        );
      }

      return { success: true, data: filtered.slice(0, limit), source: 'fallback' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async _fallbackSearchNews(query, options = {}) {
    const { limit = 20 } = options;
    try {
      const tasks = [
        this._fetchGoogleNews(query),
        this._fetchBingNews(query),
      ];
      const results = await Promise.allSettled(tasks);
      const allItems = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          allItems.push(...r.value);
        }
      }
      const deduped = this._dedup(allItems);
      deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      return { success: true, data: deduped.slice(0, limit), source: 'fallback' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default trendradar;
