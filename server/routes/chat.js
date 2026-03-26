/**
 * 对话路由 - 核心交互接口
 * 支持：贴链接生成笔记、自由对话、润色改写
 */
import { Router } from 'express';
import pluginManager from '../plugin-manager.js';

const router = Router();

/**
 * POST /api/chat
 * 主对话接口 - 流式返回
 * body: { messages: [...], noteContext?: {...} }
 */
router.post('/', async (req, res) => {
  const { messages, noteContext } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages is required' });
  }

  const lastMessage = messages[messages.length - 1]?.content || '';

  // 检测是否包含 URL，如果有先抓取内容
  const urls = extractUrls(lastMessage);
  let scrapeResults = null; // 缓存抓取结果，避免重复抓取

  if (urls.length > 0) {
    const scraper = pluginManager.get('url-scraper');
    if (scraper) {
      scrapeResults = await scraper.scrapeBatch(urls);
      const scrapedContent = scrapeResults
        .filter(r => r.success)
        .map((r, i) => `--- 文章${i + 1}: ${r.title} ---\n来源: ${r.siteName}\n${r.content}`)
        .join('\n\n');

      if (scrapedContent) {
        // 替换最后一条消息，注入抓取的完整内容（不截断）
        const enrichedMessage = `${lastMessage}\n\n---以下是从链接中抓取到的内容---\n${scrapedContent}`;
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content: enrichedMessage,
        };
      }
    }
  }

  // 如果有笔记上下文（润色场景），注入到系统消息
  if (noteContext) {
    messages.unshift({
      role: 'system',
      content: `当前正在编辑的笔记：\n标题：${noteContext.title}\n正文：${noteContext.content}\n标签：${noteContext.tags?.join(', ')}`,
    });
  }

  // 流式输出
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const writer = pluginManager.get('deepseek-writer');
    if (!writer) throw new Error('deepseek-writer plugin not available');

    for await (const chunk of writer.chatStream(messages)) {
      res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
    }

    // 如果抓取到了图片，在流结束后发送（使用缓存的结果，不重复抓取）
    if (scrapeResults) {
      const scrapedImages = scrapeResults.filter(r => r.success).flatMap(r => r.images || []);
      if (scrapedImages.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'scraped_images', images: scrapedImages.slice(0, 6) })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
  }

  res.end();
});

/**
 * POST /api/chat/generate-note
 * 直接生成笔记（结构化输出）
 */
router.post('/generate-note', async (req, res) => {
  try {
    const { materials, instruction, urls } = req.body;

    let allMaterials = materials || '';
    let scrapedImages = [];

    // 如果有 URL，先抓取（完整内容，不截断）
    if (urls?.length > 0) {
      const scraper = pluginManager.get('url-scraper');
      if (scraper) {
        const results = await scraper.scrapeBatch(urls);
        const successResults = results.filter(r => r.success);
        const scraped = successResults
          .map(r => `## ${r.title}\n${r.content}`)
          .join('\n\n');
        scrapedImages = successResults.flatMap(r => r.images || []).slice(0, 6);
        allMaterials = allMaterials ? `${allMaterials}\n\n${scraped}` : scraped;
      }
    }

    const writer = pluginManager.get('deepseek-writer');
    if (!writer) throw new Error('deepseek-writer plugin not available');

    const result = await writer.generateNote(allMaterials, instruction);
    res.json({ ...result, scrapedImages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/polish-note
 * 润色笔记
 */
router.post('/polish-note', async (req, res) => {
  try {
    const { note, instruction, history } = req.body;
    const writer = pluginManager.get('deepseek-writer');
    if (!writer) throw new Error('deepseek-writer plugin not available');

    const result = await writer.polishNote(note, instruction, history);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  return [...new Set(text.match(urlRegex) || [])];
}

export default router;
