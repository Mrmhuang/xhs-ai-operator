/**
 * URL 抓取插件 - 从链接中提取文章正文和图片
 *
 * 双层策略：
 * 1. 优先用 Jina Reader API（质量最高，支持 JS 渲染页面）
 * 2. 失败时降级到 Defuddle 本地提取（零依赖兜底）
 */
import { Defuddle } from 'defuddle/node';
import * as cheerio from 'cheerio';

// ─── 工具函数 ───

function normalizeText(text = '') {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isWeChatUrl(url) {
  try {
    return new URL(url).hostname.includes('mp.weixin.qq.com');
  } catch {
    return false;
  }
}

// ─── 微信文章专用提取（保留，cheerio 对微信公众号效果好）───

function filterWechatParagraphs(paragraphs = []) {
  const blockedPatterns = [
    /阅读原文/,
    /点击阅读原文/,
    /继续滑动看下一个/,
    /向上滑动看下一个/,
    /扫码/,
    /咨询群/,
    /立即体验/,
    /关注.*提前解锁/,
    /-End-/i,
  ];

  return paragraphs
    .map(paragraph => normalizeText(paragraph))
    .filter(Boolean)
    .filter(paragraph => !blockedPatterns.some(pattern => pattern.test(paragraph)));
}

function extractWechatArticle($, url) {
  const contentRoot = $('#js_content').first().clone();
  if (!contentRoot.length) return null;

  contentRoot.find('script, style, iframe, svg').remove();
  const title = normalizeText(
    $('#activity-name').text() || $('meta[property="og:title"]').attr('content') || $('title').text() || ''
  );

  let paragraphs = contentRoot.find('p').map((_, el) => $(el).text()).get();
  paragraphs = filterWechatParagraphs(paragraphs);

  const fallbackText = normalizeText(contentRoot.text());
  const content = normalizeText(paragraphs.length > 0 ? paragraphs.join('\n\n') : fallbackText);

  // 提取图片
  const images = [];
  $('#js_content img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar')) {
      const fullSrc = src.startsWith('http') ? src : new URL(src, url).href;
      images.push(fullSrc);
    }
  });

  return {
    title,
    content,
    images: [...new Set(images)].slice(0, 10),
    excerpt: content.slice(0, 180),
    siteName: 'mp.weixin.qq.com',
  };
}

// ─── Jina Reader API ───

async function scrapeWithJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const headers = {
    'Accept': 'application/json',
    'X-Return-Format': 'markdown',
  };

  // 如果配置了 Jina API Key，使用它（500 RPM），否则走免费额度（20 RPM）
  const apiKey = process.env.JINA_API_KEY;
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(jinaUrl, {
    headers,
    signal: AbortSignal.timeout(20000), // Jina 给 20s，因为它有无头浏览器渲染
  });

  if (!response.ok) {
    throw new Error(`Jina Reader returned ${response.status}`);
  }

  const data = await response.json();

  // Jina 返回 JSON 格式：{ code, status, data: { title, content, url, ... } }
  const result = data.data || data;

  if (!result.content || result.content.trim().length < 50) {
    throw new Error('Jina Reader returned insufficient content');
  }

  return {
    title: result.title || '',
    content: normalizeText(result.content),
    siteName: new URL(url).hostname,
    source: 'jina',
  };
}

// ─── Defuddle 本地提取（替代 Readability）───

async function scrapeWithDefuddle(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  const html = await response.text();

  // 用 Defuddle 提取正文（支持 Markdown 输出，比 Readability 质量高）
  const result = await Defuddle(html, url, {
    markdown: true,
  });

  const content = normalizeText(result.content || '');

  if (content.length < 30) {
    throw new Error('Defuddle extracted insufficient content');
  }

  return {
    title: result.title || '',
    content,
    html,
    siteName: result.site || result.domain || new URL(url).hostname,
    source: 'defuddle',
  };
}

// ─── 图片提取（从 HTML 中提取，Jina 不返回图片列表）───

function extractImages(html, url) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const images = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar')) {
      try {
        const fullSrc = src.startsWith('http') ? src : new URL(src, url).href;
        images.push(fullSrc);
      } catch {
        // 忽略无效 URL
      }
    }
  });
  return [...new Set(images)].slice(0, 10);
}

// ─── 主插件 ───

const urlScraper = {
  name: 'url-scraper',
  description: '从 URL 抓取文章正文、标题、图片（Jina Reader 优先，Defuddle 兜底）',

  /**
   * 抓取单个 URL 的内容
   * 返回完整内容，不做截断
   */
  async scrape(url) {
    try {
      // 微信文章走专用逻辑（cheerio 对微信公众号结构最适配）
      if (isWeChatUrl(url)) {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(15000),
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const wechatResult = extractWechatArticle($, url);

        if (wechatResult && wechatResult.content.length > 30) {
          return {
            success: true,
            url,
            title: wechatResult.title,
            content: wechatResult.content,
            images: wechatResult.images,
            excerpt: wechatResult.excerpt,
            siteName: wechatResult.siteName,
            source: 'wechat-cheerio',
          };
        }
        // 微信专用提取失败，继续走通用流程
      }

      // 策略 1：Jina Reader API（质量最高，支持 JS 渲染）
      let jinaResult = null;
      let rawHtml = null;

      try {
        jinaResult = await scrapeWithJina(url);
      } catch (jinaError) {
        // Jina 失败，记录但不抛出，继续降级
        console.warn(`[url-scraper] Jina Reader failed for ${url}: ${jinaError.message}`);
      }

      // 策略 2：Defuddle 本地提取（兜底）
      let defuddleResult = null;
      if (!jinaResult) {
        try {
          defuddleResult = await scrapeWithDefuddle(url);
          rawHtml = defuddleResult.html;
        } catch (defuddleError) {
          console.warn(`[url-scraper] Defuddle failed for ${url}: ${defuddleError.message}`);
          return {
            success: false,
            url,
            error: `Both Jina and Defuddle failed: ${defuddleError.message}`,
          };
        }
      }

      const result = jinaResult || defuddleResult;

      // 如果 Jina 成功了但没有图片，额外用 fetch + cheerio 抓图片
      let images = [];
      if (jinaResult) {
        try {
          const htmlResponse = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(10000),
          });
          rawHtml = await htmlResponse.text();
          images = extractImages(rawHtml, url);
        } catch {
          // 抓图片失败不影响主流程
        }
      } else if (rawHtml) {
        images = extractImages(rawHtml, url);
      }

      return {
        success: true,
        url,
        title: result.title,
        content: result.content, // 完整内容，不截断
        images,
        excerpt: result.content.slice(0, 180),
        siteName: result.siteName,
        source: result.source,
      };
    } catch (error) {
      return {
        success: false,
        url,
        error: error.message,
      };
    }
  },

  /**
   * 批量抓取多个 URL
   */
  async scrapeBatch(urls) {
    const results = await Promise.allSettled(
      urls.map(url => this.scrape(url))
    );
    return results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message });
  },
};

export default urlScraper;
