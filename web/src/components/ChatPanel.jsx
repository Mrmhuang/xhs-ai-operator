/**
 * 中间对话区 - 核心交互面板（小红书暖色风）
 */
import { useState, useRef, useEffect } from 'react';
import {
  Send, Paperclip, Image as ImageIcon, Trash2, Loader2, Link, Sparkles, RotateCcw,
  ExternalLink, FileText, X, Edit3, Eye, ChevronDown, ChevronUp, ChevronLeft, ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { uploadImages, publishNote, generateImageForNote } from '../api';

export default function ChatPanel({
  messages, isLoading, onSend, onSendAsNote, onClear, scrapedImages,
  previewTopic, onWriteFromTopic, onDismissTopic,
  currentNote, onUpdateNote, onConvertToNote,
  noteVersions = [], versionIndex = -1, onVersionChange,
}) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // 笔记内嵌编辑状态
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState(null);
  const [noteExpanded, setNoteExpanded] = useState(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 当笔记更新时重置编辑状态
  useEffect(() => {
    if (currentNote) {
      setIsEditingNote(false);
      setEditNote(null);
      setPublishResult(null);
      setImageGenError(null);
      setSelectedImages([]);
      setNoteExpanded(true);
    }
  }, [currentNote?.title, currentNote?.content]);

  const handleSend = () => {
    if ((!input.trim() && attachedImages.length === 0) || isLoading) return;
    onSend(input, attachedImages);
    setInput('');
    setAttachedImages([]);
  };

  const handleSendAsNote = () => {
    if (!input.trim() || isLoading) return;
    onSendAsNote(input);
    setInput('');
    setAttachedImages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const result = await uploadImages(files);
      if (result.success) {
        setAttachedImages(prev => [...prev, ...result.images]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedImage = (idx) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
  };

  // 笔记操作
  const startEditNote = () => {
    setEditNote({ ...currentNote });
    setIsEditingNote(true);
  };

  const saveEditNote = () => {
    onUpdateNote(editNote);
    setIsEditingNote(false);
  };

  const cancelEditNote = () => {
    setEditNote(null);
    setIsEditingNote(false);
  };

  const handlePublish = async () => {
    if (!currentNote) return;
    if (selectedImages.length === 0) {
      setPublishResult({ success: false, error: '小红书要求至少上传 1 张配图才能发布，请先添加图片' });
      return;
    }
    setPublishing(true);
    setPublishResult(null);
    try {
      const imagePaths = selectedImages.map(img => img.path || img.url);
      const result = await publishNote(currentNote, imagePaths);
      setPublishResult(result);
    } catch (error) {
      setPublishResult({ success: false, error: error.message });
    }
    setPublishing(false);
  };

  const handleGenerateNoteImage = async () => {
    if (!currentNote) return;
    setGeneratingImage(true);
    setImageGenError(null);
    try {
      const result = await generateImageForNote(currentNote);
      if (result.success && result.images?.length > 0) {
        setSelectedImages(prev => [...prev, ...result.images]);
      } else {
        setImageGenError(result.error || '图片生成失败，请稍后重试');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      setImageGenError(error.message || '网络错误，请检查连接后重试');
    }
    setGeneratingImage(false);
  };

  const toggleImageSelection = (img) => {
    setSelectedImages(prev => {
      const exists = prev.find(i => i.url === img.url);
      if (exists) return prev.filter(i => i.url !== img.url);
      if (prev.length >= 9) return prev;
      return [...prev, img];
    });
  };

  // 从 AI 回复中提取笔记结构
  const tryExtractNote = (content) => {
    try {
      const jsonMatch = content.match(/\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/);
      if (jsonMatch) {
        const note = JSON.parse(jsonMatch[0]);
        if (note.title && note.content) return note;
      }
    } catch {}
    return null;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶栏 */}
      <div className="h-14 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-between px-5"
        style={{ boxShadow: '0 1px 4px rgba(255,76,58,0.04)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🌟</span>
          <span className="text-base font-extrabold" style={{ color: 'var(--xhs-red)' }}>AI 创作助手</span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
          style={{
            border: '2px solid var(--xhs-red)',
            color: 'var(--xhs-red)',
            background: 'var(--bg-secondary)',
          }}
          onMouseEnter={e => { e.target.style.background = 'var(--xhs-red)'; e.target.style.color = '#fff'; }}
          onMouseLeave={e => { e.target.style.background = 'var(--bg-secondary)'; e.target.style.color = 'var(--xhs-red)'; }}
        >
          <RotateCcw size={12} />
          新对话
        </button>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ background: 'var(--bg-primary)' }}>
        {messages.length === 0 && !previewTopic && (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, #fff5f0, #ffe0d5)' }}>
              <Sparkles size={28} style={{ color: 'var(--xhs-red)' }} />
            </div>
            <h3 className="text-lg font-extrabold mb-2" style={{ color: 'var(--text-primary)' }}>
              小红书 AI 运营助手
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              开始创作你的小红书爆款内容吧
            </p>
            <div className="grid grid-cols-1 gap-3 text-xs max-w-sm w-full">
              {[
                { icon: <Link size={14} />, text: '贴入文章链接，一键生成小红书笔记' },
                { icon: <Sparkles size={14} />, text: '直接对话，AI 帮你写文案 + 生成配图' },
                { icon: <ImageIcon size={14} />, text: '发送图片，AI 帮你配上文案' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-200 cursor-default"
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--card-shadow)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'var(--card-shadow)'; e.currentTarget.style.transform = 'none'; }}
                >
                  <span style={{ color: 'var(--xhs-red)' }}>{item.icon}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 热点预览卡片 — 点击左侧热点后显示 */}
        {previewTopic && (
          <div className="max-w-[640px] rounded-2xl p-5 relative"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--card-shadow-hover)',
            }}>
            <button onClick={onDismissTopic}
              className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
              <X size={14} />
            </button>
            <h4 className="text-base font-extrabold leading-relaxed pr-8 mb-3" style={{ color: 'var(--text-primary)' }}>
              {previewTopic.title}
            </h4>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {previewTopic.keyword && (
                <span className="text-[11px] px-2.5 py-1 rounded-full font-bold text-white"
                  style={{ background: 'var(--xhs-gradient)' }}>
                  {previewTopic.keyword}
                </span>
              )}
              {previewTopic.source && (
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {previewTopic.source}
                </span>
              )}
              {previewTopic.url && (
                <a href={previewTopic.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-semibold flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--xhs-red)' }}>
                  查看原文 <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => onWriteFromTopic(previewTopic)}
                className="px-5 py-2.5 rounded-full text-[13px] font-bold text-white transition-all duration-200"
                style={{ background: 'var(--xhs-gradient)', boxShadow: '0 4px 12px rgba(255,76,58,.2)' }}
                onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 16px rgba(255,76,58,.3)'; }}
                onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 4px 12px rgba(255,76,58,.2)'; }}>
                ✍ 基于此写笔记
              </button>
              {previewTopic.url && (
                <button className="px-4 py-2.5 rounded-full text-[13px] font-bold transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--xhs-red)', border: '1px solid var(--border-color)' }}
                  onMouseEnter={e => { e.target.style.background = 'var(--border-color)'; }}
                  onMouseLeave={e => { e.target.style.background = 'var(--bg-tertiary)'; }}>
                  <FileText size={13} className="inline mr-1" style={{ verticalAlign: '-2px' }} />
                  抓取全文
                </button>
              )}
              <button onClick={onDismissTopic}
                className="px-4 py-2.5 rounded-full text-[13px] font-bold transition-colors"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                onMouseEnter={e => { e.target.style.background = 'var(--border-color)'; }}
                onMouseLeave={e => { e.target.style.background = 'var(--bg-tertiary)'; }}>
                忽略
              </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[75%] px-4 py-3"
              style={msg.role === 'user' ? {
                background: 'var(--xhs-gradient)',
                color: '#fff',
                borderRadius: '20px 20px 6px 20px',
                boxShadow: '0 2px 8px rgba(255,76,58,.15)',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              } : {
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                borderRadius: '20px 20px 20px 6px',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-color)',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {/* 用户发送的图片 */}
              {msg.images?.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.url}
                      alt=""
                      className="w-20 h-20 object-cover rounded-xl"
                    />
                  ))}
                </div>
              )}

              {/* 消息内容 */}
              {msg.role === 'assistant' ? (
                <div className="markdown-content text-sm">
                  <ReactMarkdown>{msg.content || (isLoading ? '思考中...' : '')}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}

              {/* AI 回复中提取笔记提示 */}
              {msg.role === 'assistant' && msg.content && (msg.noteGenerated || tryExtractNote(msg.content)) && (
                <div
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--xhs-red)',
                  }}
                >
                  <Sparkles size={12} />
                  ✅ 笔记已生成，查看下方预览
                </div>
              )}

              {/* 聊天回复转笔记按钮 */}
              {msg.role === 'assistant' && msg.content && !msg.noteGenerated && !msg.isError && msg.content.length > 50 && !tryExtractNote(msg.content) && (
                <button
                  onClick={() => onConvertToNote(msg.content)}
                  disabled={isLoading}
                  className="mt-2.5 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all duration-200 disabled:opacity-40"
                  style={{
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                  }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.borderColor = 'var(--xhs-red)'; e.currentTarget.style.color = 'var(--xhs-red)'; }}}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <FileText size={11} />
                  转为笔记
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
          <div className="flex items-center gap-2 text-sm pl-2" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--xhs-red)' }} />
            AI 正在创作中...
          </div>
        )}

        {/* ====== 内嵌笔记预览卡片 ====== */}
        {currentNote && (
          <div className="max-w-[640px] mx-auto" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="rounded-2xl overflow-hidden" style={{
              background: 'var(--bg-secondary)',
              border: '2px solid var(--xhs-red)',
              boxShadow: '0 4px 20px rgba(255,76,58,.12)',
            }}>
              {/* 卡片头部 */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: 'linear-gradient(135deg, #fff5f0, #ffe8e0)', borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2">
                  <Eye size={14} style={{ color: 'var(--xhs-red)' }} />
                  <span className="text-xs font-extrabold" style={{ color: 'var(--xhs-red)' }}>笔记预览</span>
                  {/* 版本切换器 */}
                  {noteVersions.length > 1 && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => onVersionChange?.(Math.max(0, versionIndex - 1))}
                        disabled={versionIndex <= 0}
                        className="w-5 h-5 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                        onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.borderColor = 'var(--xhs-red)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                        title="上一版本"
                      >
                        <ChevronLeft size={12} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <span className="text-[10px] font-bold px-1 select-none" style={{ color: 'var(--text-secondary)' }}
                        title={noteVersions[versionIndex]?.label || ''}>
                        v{versionIndex + 1}/{noteVersions.length}
                      </span>
                      <button
                        onClick={() => onVersionChange?.(Math.min(noteVersions.length - 1, versionIndex + 1))}
                        disabled={versionIndex >= noteVersions.length - 1}
                        className="w-5 h-5 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                        onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.borderColor = 'var(--xhs-red)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                        title="下一版本"
                      >
                        <ChevronRight size={12} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {!isEditingNote && (
                    <button onClick={startEditNote}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors"
                      style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--xhs-red)'; e.currentTarget.style.color = 'var(--xhs-red)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                      <Edit3 size={10} /> 编辑
                    </button>
                  )}
                  <button onClick={() => setNoteExpanded(!noteExpanded)}
                    className="p-1 rounded-full transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                    {noteExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {noteExpanded && (
                <div>
                  {/* 配图展示 */}
                  {selectedImages.length > 0 && (
                    <div className="relative" style={{ maxHeight: 240, overflow: 'hidden' }}>
                      <img src={selectedImages[0].url} alt="" className="w-full object-cover" style={{ maxHeight: 240 }} />
                      {selectedImages.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                          1/{selectedImages.length}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 笔记内容 */}
                  <div className="p-4">
                    {isEditingNote ? (
                      <>
                        <input
                          value={editNote.title}
                          onChange={e => setEditNote(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full rounded-xl px-3 py-2 text-sm font-bold mb-2 outline-none"
                          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <textarea
                          value={editNote.content}
                          onChange={e => setEditNote(prev => ({ ...prev, content: e.target.value }))}
                          rows={10}
                          className="w-full rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none"
                          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <input
                          value={editNote.tags?.join(', ') || ''}
                          onChange={e => setEditNote(prev => ({
                            ...prev,
                            tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                          }))}
                          placeholder="标签，用逗号分隔"
                          className="w-full rounded-xl px-3 py-2 text-xs mt-2 outline-none"
                          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                        />
                        <div className="flex gap-2 mt-3">
                          <button onClick={saveEditNote}
                            className="flex-1 py-2 rounded-full text-xs font-bold text-white"
                            style={{ background: 'var(--xhs-gradient)' }}>
                            保存
                          </button>
                          <button onClick={cancelEditNote}
                            className="flex-1 py-2 rounded-full text-xs font-bold"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="text-[15px] font-extrabold leading-snug mb-2" style={{ color: 'var(--text-primary)' }}>
                          {currentNote.title}
                        </h3>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                          {currentNote.content}
                        </p>
                        {currentNote.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {currentNote.tags.map((tag, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--xhs-red)' }}>
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 配图管理 */}
                  <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                        配图 ({selectedImages.length}/9)
                      </span>
                      <button onClick={handleGenerateNoteImage} disabled={generatingImage}
                        className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                        style={{ color: 'var(--xhs-red)', background: 'var(--bg-tertiary)' }}>
                        {generatingImage ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {generatingImage ? 'AI 生成中...' : 'AI 生成'}
                      </button>
                    </div>
                    {imageGenError && (
                      <div className="mb-2 p-2 rounded-xl text-[11px] font-bold flex items-center justify-between"
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                        <span>❌ {imageGenError}</span>
                        <button onClick={() => setImageGenError(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                      </div>
                    )}
                    {selectedImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {selectedImages.map((img, i) => (
                          <div key={i} className="aspect-square relative rounded-xl overflow-hidden group">
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                            <button onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {scrapedImages?.length > 0 && (
                      <div>
                        <span className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                          从文章中提取的图片（点击选择）：
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {scrapedImages.map((url, i) => {
                            const isSelected = selectedImages.some(img => img.url === url);
                            return (
                              <div key={i} className="aspect-square relative rounded-xl overflow-hidden cursor-pointer"
                                style={{ border: isSelected ? '2px solid var(--xhs-red)' : '2px solid transparent' }}
                                onClick={() => toggleImageSelection({ url, path: url })}>
                                <img src={url} alt="" className="w-full h-full object-cover" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 发布按钮 */}
                  <div className="px-4 pb-4 pt-2 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <button onClick={handlePublish} disabled={publishing || !currentNote}
                      className="w-full flex items-center justify-center gap-1.5 py-3 rounded-full text-sm font-bold text-white transition-all duration-200 disabled:opacity-50"
                      style={{ background: 'var(--xhs-gradient)', boxShadow: '0 4px 12px rgba(255,76,58,.25)' }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,76,58,.35)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,76,58,.25)'; }}>
                      {publishing ? (
                        <><Loader2 size={14} className="animate-spin" /> 发布中...</>
                      ) : (
                        <><Send size={14} /> 发布到小红书</>
                      )}
                    </button>
                    {publishResult && (
                      <div className="p-3 rounded-xl text-xs font-bold text-center"
                        style={publishResult.success ? {
                          background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                        } : {
                          background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                        }}>
                        {publishResult.success ? '✅ 发布成功！' : `❌ ${publishResult.error}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 附件预览 */}
      {attachedImages.length > 0 && (
        <div className="px-5 py-2 border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="flex gap-2 flex-wrap">
            {attachedImages.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt=""
                  className="w-16 h-16 object-cover rounded-xl"
                  style={{ border: '1px solid var(--border-color)' }}
                />
                <button
                  onClick={() => removeAttachedImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-end gap-2 rounded-3xl p-1.5 pl-5 transition-all duration-200"
          style={{
            background: 'var(--bg-tertiary)',
            border: '2px solid var(--border-color)',
          }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，或粘贴文章链接..."
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm min-h-[36px] max-h-[120px] py-2 px-1"
            style={{ color: 'var(--text-primary)' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onFocus={() => {
              const wrap = document.querySelector('.input-focus-target');
              if (wrap) { wrap.style.borderColor = 'var(--xhs-red)'; wrap.style.boxShadow = '0 0 0 4px rgba(255,76,58,.1)'; }
            }}
            onBlur={() => {
              const wrap = document.querySelector('.input-focus-target');
              if (wrap) { wrap.style.borderColor = 'var(--border-color)'; wrap.style.boxShadow = 'none'; }
            }}
          />
          <div className="flex items-center gap-1 pb-0.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 rounded-full transition-colors disabled:opacity-50"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; e.currentTarget.style.background = 'var(--border-color)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
              title="上传图片"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>
            <button
              onClick={handleSendAsNote}
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.color = 'var(--xhs-red)'; e.currentTarget.style.background = 'var(--border-color)'; }}}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
              title="直接生成笔记（不经过对话）"
            >
              <FileText size={18} />
            </button>
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--xhs-gradient)',
                boxShadow: '0 4px 12px rgba(255,76,58,.25)',
              }}
              onMouseEnter={e => { if (!e.target.disabled) { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,76,58,.35)'; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,76,58,.25)'; }}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
