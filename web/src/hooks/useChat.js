/**
 * 对话 Hook - 管理聊天状态和消息流
 */
import { useState, useCallback, useRef } from 'react';
import { fetchStream, generateNote, polishNote } from '../api';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

function tryExtractNote(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/);
    if (jsonMatch) {
      const note = JSON.parse(jsonMatch[0]);
      if (note.title && note.content) return note;
    }
  } catch {}
  return null;
}

function extractUrls(text = '') {
  return [...new Set(text.match(URL_REGEX) || [])];
}

function stripUrls(text = '') {
  return text.replace(URL_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeNote(note = {}) {
  return {
    title: typeof note.title === 'string' ? note.title.trim() : '',
    content: typeof note.content === 'string' ? note.content.trim() : '',
    tags: Array.isArray(note.tags) ? note.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 6) : [],
    imagePrompt: typeof note.imagePrompt === 'string' ? note.imagePrompt.trim() : '',
  };
}

function formatNoteMessage(note, intro) {
  const tags = note.tags?.length ? `\n\n${note.tags.map(tag => `#${tag}`).join(' ')}` : '';
  return `${intro}\n\n## ${note.title}\n\n${note.content}${tags}`;
}

function resolveMode(content, currentNote) {
  const hasUrls = extractUrls(content.trim()).length > 0;
  if (hasUrls) return 'generate';       // 有链接 → 基于内容生成笔记
  if (currentNote) return 'polish';      // 有已生成的笔记 → 让 AI 自己理解该怎么改
  return 'chat';                         // 其余 → 自由对话
}

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scrapedImages, setScrapedImages] = useState([]);
  const isSendingRef = useRef(false);

  // 笔记版本管理
  const [noteVersions, setNoteVersions] = useState([]);   // [{note, label, timestamp}, ...]
  const [versionIndex, setVersionIndex] = useState(-1);    // 当前查看的版本索引
  const currentNote = versionIndex >= 0 ? noteVersions[versionIndex]?.note : null;

  // 添加新版本并指向最新
  const pushNoteVersion = useCallback((note, label = '') => {
    setNoteVersions(prev => {
      const next = [...prev, { note, label, timestamp: new Date().toISOString() }];
      setVersionIndex(next.length - 1);
      return next;
    });
  }, []);

  // 手动编辑 currentNote 时，替换当前版本（不新增）
  const setCurrentNote = useCallback((note) => {
    setNoteVersions(prev => {
      if (prev.length === 0) {
        setVersionIndex(0);
        return [{ note, label: '手动编辑', timestamp: new Date().toISOString() }];
      }
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], note };
      setVersionIndex(next.length - 1);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (content, images = []) => {
    if (!content.trim() && images.length === 0) return;
    // 防重复：如果上一次 sendMessage 还在执行，直接忽略
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content,
      images,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const aiMsgId = Date.now() + 1;
    const aiMsg = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, aiMsg]);

    try {
      const mode = resolveMode(content, currentNote);

      if (mode === 'generate') {
        const urls = extractUrls(content);
        const cleanText = stripUrls(content);
        const result = await generateNote({
          materials: cleanText,
          instruction: cleanText || '请根据抓取到的内容整理成一篇可直接发布的小红书笔记。',
          urls,
        });

        if (!result?.success) {
          throw new Error(result?.error || '笔记生成失败');
        }

        const note = normalizeNote(result.note);
        pushNoteVersion(note, '初始生成');
        setScrapedImages(result.scrapedImages || []);
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMsgId
              ? { ...m, content: formatNoteMessage(note, '我先按你的要求整理出一版可直接发的小红书笔记：'), noteGenerated: true }
              : m
          )
        );
        return;
      }

      if (mode === 'polish' && currentNote) {
        // 取最近的对话历史（最多 10 轮），让 AI 知道之前聊了什么
        const recentHistory = [...messages, userMsg]
          .slice(-10)
          .map(m => ({ role: m.role, content: m.content }));
        const result = await polishNote(currentNote, content.trim(), recentHistory);
        if (!result?.success) {
          throw new Error(result?.error || '笔记修改失败');
        }

        const note = normalizeNote(result.note);
        pushNoteVersion(note, `润色：${content.trim().slice(0, 20)}`);
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMsgId
              ? { ...m, content: formatNoteMessage(note, '我按你的要求改了一版：'), noteGenerated: true }
              : m
          )
        );
        return;
      }

      const chatMessages = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      let fullContent = '';
      await fetchStream('/api/chat', {
        messages: chatMessages,
      }, (chunk) => {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId
                ? { ...m, content: m.content + chunk.content }
                : m
            )
          );
        } else if (chunk.type === 'scraped_images') {
          setScrapedImages(prev => [...prev, ...chunk.images]);
        } else if (chunk.type === 'error') {
          setMessages(prev =>
            prev.map(m =>
              m.id === aiMsgId
                ? { ...m, content: `❌ 错误: ${chunk.error}`, isError: true }
                : m
            )
          );
        }
      });

      const extractedNote = tryExtractNote(fullContent);
      if (extractedNote) {
        pushNoteVersion(normalizeNote(extractedNote), '从对话提取');
      }
    } catch (error) {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: `❌ 网络错误: ${error.message}`, isError: true }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  }, [messages, currentNote]);

  // 把某条 AI 回复的内容转为笔记（走三步流水线）
  const convertToNote = useCallback(async (content) => {
    if (!content?.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const result = await generateNote({
        materials: content,
        instruction: '请基于以上内容整理成一篇可直接发布的小红书笔记。',
      });
      if (!result?.success) {
        throw new Error(result?.error || '笔记生成失败');
      }
      const note = normalizeNote(result.note);
      pushNoteVersion(note, '从对话转换');
      setScrapedImages(result.scrapedImages || []);
    } catch (error) {
      console.error('[convertToNote] failed:', error.message);
      // 追加错误消息到对话中，让用户看到
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: `❌ 转为笔记失败: ${error.message}`,
        isError: true,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setNoteVersions([]);
    setVersionIndex(-1);
    setScrapedImages([]);
  }, []);

  // 把用户输入的文字直接走笔记生成流水线（不经过对话）
  const sendAsNote = useCallback(async (content) => {
    if (!content.trim() || isLoading) return;
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    const aiMsgId = Date.now() + 1;
    setMessages(prev => [...prev, {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }]);

    try {
      const urls = extractUrls(content);
      const cleanText = stripUrls(content);
      const result = await generateNote({
        materials: cleanText,
        instruction: cleanText || '请根据以下内容整理成一篇可直接发布的小红书笔记。',
        urls: urls.length > 0 ? urls : undefined,
      });

      if (!result?.success) {
        throw new Error(result?.error || '笔记生成失败');
      }

      const note = normalizeNote(result.note);
      pushNoteVersion(note, '直接生成');
      setScrapedImages(result.scrapedImages || []);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: formatNoteMessage(note, '已根据你的内容生成笔记：'), noteGenerated: true }
            : m
        )
      );
    } catch (error) {
      setMessages(prev =>
        prev.map(m =>
          m.id === aiMsgId
            ? { ...m, content: `❌ 笔记生成失败: ${error.message}`, isError: true }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  }, [isLoading]);

  return {
    messages,
    isLoading,
    sendMessage,
    sendAsNote,
    clearMessages,
    currentNote,
    setCurrentNote,
    scrapedImages,
    setScrapedImages,
    convertToNote,
    // 版本管理
    noteVersions,
    versionIndex,
    setVersionIndex,
  };
}
