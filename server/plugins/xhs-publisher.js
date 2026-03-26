/**
 * 小红书发布插件 - 对接 xiaohongshu-mcp (https://github.com/xpzouying/xiaohongshu-mcp)
 *
 * 需要先部署 xiaohongshu-mcp 服务：
 *   docker compose up -d xiaohongshu-mcp
 *   或直接运行二进制：./xiaohongshu-mcp-darwin-arm64
 * 默认地址：http://localhost:18060/mcp
 */

const xhsPublisher = {
  name: 'xhs-publisher',
  description: '小红书笔记发布（通过 xiaohongshu-mcp）',

  // MCP Streamable HTTP 会话状态
  _sessionId: null,

  _getMcpUrl() {
    return process.env.XHS_MCP_URL || 'http://localhost:18060/mcp';
  },

  /**
   * 初始化 MCP 会话，获取 Mcp-Session-Id
   */
  async _ensureSession() {
    if (this._sessionId) return;

    const mcpUrl = this._getMcpUrl();

    // Step 1: initialize
    const initRes = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'xhs-ai-operator', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    // 从响应头获取 session ID
    const sessionId = initRes.headers.get('mcp-session-id');
    if (!sessionId) {
      throw new Error('MCP server did not return Mcp-Session-Id');
    }

    const initData = await initRes.json();
    if (initData.error) {
      throw new Error(`MCP initialize failed: ${initData.error.message}`);
    }

    // Step 2: 发送 initialized 通知（带 session ID）
    await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    this._sessionId = sessionId;
    console.log('[xhs-publisher] MCP session initialized, id:', sessionId);
  },

  /**
   * 从 MCP result 中提取业务级错误信息
   * xiaohongshu-mcp 的 tools/call 即使业务失败也可能不返回 JSON-RPC error，
   * 而是在 result.content 中包含错误描述，需要深度检查。
   */
  _extractBizError(result) {
    if (!result) return '发布服务未返回结果';

    // MCP tools/call result 通常是 { content: [{ type: 'text', text: '...' }] }
    const content = result.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text' && typeof item.text === 'string') {
          const text = item.text;
          // 尝试解析 JSON 格式的业务响应
          try {
            const parsed = JSON.parse(text);
            // 检查常见的失败标志
            if (parsed.success === false) return parsed.error || parsed.message || parsed.msg || '发布失败';
            if (parsed.code && parsed.code !== 0 && parsed.code !== 200) return parsed.message || parsed.msg || `发布失败 (code: ${parsed.code})`;
          } catch {
            // 非 JSON，检查文本中是否包含失败关键词
          }
          // 检查文本中的错误关键词
          const lowerText = text.toLowerCase();
          if (lowerText.includes('error') || lowerText.includes('fail') ||
              text.includes('失败') || text.includes('未登录') ||
              text.includes('登录过期') || text.includes('请先登录') ||
              text.includes('cookie') || text.includes('需要登录')) {
            return text.length > 200 ? text.substring(0, 200) + '...' : text;
          }
        }
      }
    }

    // 检查 result.isError 标志（MCP 标准）
    if (result.isError) {
      const firstText = content?.find(c => c.type === 'text')?.text;
      return firstText || '发布操作失败';
    }

    return null; // 无错误
  },

  async _callMcp(toolName, args = {}) {
    const mcpUrl = this._getMcpUrl();
    try {
      await this._ensureSession();

      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': this._sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
        signal: AbortSignal.timeout(120000),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      // 深度检查 MCP result 中的业务级错误
      const result = data.result;
      const bizError = this._extractBizError(result);
      if (bizError) {
        console.error(`[xhs-publisher] ${toolName} biz error:`, bizError);
        return { success: false, error: bizError };
      }
      return { success: true, data: result };
    } catch (error) {
      // 会话失效时重置并重试一次
      if (error.message?.includes('initialization') || error.message?.includes('session') || error.message?.includes('invalid')) {
        console.warn(`[xhs-publisher] Session may be expired, reinitializing...`);
        this._sessionId = null;
        try {
          await this._ensureSession();
          const retryRes = await fetch(mcpUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Mcp-Session-Id': this._sessionId,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: { name: toolName, arguments: args },
            }),
            signal: AbortSignal.timeout(120000),
          });
          const retryData = await retryRes.json();
          if (retryData.error) throw new Error(retryData.error.message);
          const retryResult = retryData.result;
          const retryBizError = this._extractBizError(retryResult);
          if (retryBizError) {
            console.error(`[xhs-publisher] ${toolName} biz error (retry):`, retryBizError);
            return { success: false, error: retryBizError };
          }
          return { success: true, data: retryResult };
        } catch (retryError) {
          console.error(`[xhs-publisher] MCP retry ${toolName} failed:`, retryError.message);
          return { success: false, error: retryError.message };
        }
      }
      console.error(`[xhs-publisher] MCP call ${toolName} failed:`, error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 发布图文笔记
   * @param {object} note - { title, content, tags }
   * @param {string[]} imagePaths - 图片路径数组（本地路径或 HTTP URL 均可）
   */
  async publishNote(note, imagePaths = []) {
    const args = {
      title: note.title,
      content: note.content,
    };

    // 添加标签到内容末尾（小红书惯例）
    if (note.tags?.length > 0) {
      args.content += '\n\n' + note.tags.map(t => `#${t}`).join(' ');
    }

    // xiaohongshu-mcp 的 publish_content 要求 images 为必填参数
    args.images = imagePaths.length > 0 ? imagePaths : [];

    console.log('[xhs-publisher] Publishing note:', { title: args.title, hasImages: !!args.images?.length });
    const result = await this._callMcp('publish_content', args);
    console.log('[xhs-publisher] Publish result:', JSON.stringify(result).substring(0, 500));
    return result;
  },

  /**
   * 搜索小红书笔记
   */
  async searchNotes(keyword, options = {}) {
    const { limit = 20, sort, noteType } = options;
    const args = { keyword };
    if (limit) args.limit = limit;
    if (sort) args.sort = sort;
    if (noteType) args.note_type = noteType;
    return this._callMcp('search_feeds', args);
  },

  /**
   * 获取笔记详情
   */
  async getNoteDetail(noteId) {
    return this._callMcp('get_feed_detail', { note_id: noteId });
  },

  /**
   * 获取登录状态
   */
  async getLoginStatus() {
    return this._callMcp('check_login_status', {});
  },

  /**
   * 获取登录二维码（用于扫码登录）
   */
  async getLoginQrcode() {
    return this._callMcp('get_login_qrcode', {});
  },

  /**
   * 获取首页推荐列表
   */
  async listFeeds() {
    return this._callMcp('list_feeds', {});
  },

  /**
   * 点赞/取消点赞
   */
  async likeFeed(noteId, like = true) {
    return this._callMcp('like_feed', { note_id: noteId, like });
  },

  /**
   * 收藏/取消收藏
   */
  async favoriteFeed(noteId, favorite = true) {
    return this._callMcp('favorite_feed', { note_id: noteId, favorite });
  },

  /**
   * 发表评论
   */
  async postComment(noteId, content) {
    return this._callMcp('post_comment_to_feed', { note_id: noteId, content });
  },
};

export default xhsPublisher;
