/**
 * 右侧笔记预览 - 小红书暖色风
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Eye, Edit3, Send, Image as ImageIcon, Sparkles, Loader2, ChevronLeft, ChevronRight,
  Trash2, Plus, Download, RefreshCw
} from 'lucide-react';
import { publishNote, generateImage, generateImageForNote } from '../api';

export default function NotePreview({
  note, onUpdateNote, scrapedImages, collapsed, onToggle, width, onWidthChange,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState(null);

  const currentNote = isEditing ? editNote : note;

  // 拖拽调整宽度 —— 用 ref 存所有值避免闭包陷阱
  const dragState = useRef({ active: false, startX: 0, startW: 0 });
  const widthRef = useRef(width || 380);
  const onWidthChangeRef = useRef(onWidthChange);
  const [dragging, setDragging] = useState(false);

  // 保持 ref 与 props 同步
  useEffect(() => { widthRef.current = width || 380; }, [width]);
  useEffect(() => { onWidthChangeRef.current = onWidthChange; }, [onWidthChange]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragState.current.active) return;
      e.preventDefault();
      const delta = dragState.current.startX - e.clientX;
      const maxW = Math.floor(window.innerWidth * 0.6);
      const newWidth = Math.min(Math.max(dragState.current.startW + delta, 280), maxW);
      onWidthChangeRef.current?.(newWidth);
    };

    const handleUp = () => {
      if (!dragState.current.active) return;
      dragState.current.active = false;
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { active: true, startX: e.clientX, startW: widthRef.current };
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startEdit = () => {
    setEditNote({ ...note });
    setIsEditing(true);
  };

  const saveEdit = () => {
    onUpdateNote(editNote);
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditNote(null);
    setIsEditing(false);
  };

  const handlePublish = async () => {
    if (!note) return;
    if (selectedImages.length === 0) {
      setPublishResult({ success: false, error: '小红书要求至少上传 1 张配图才能发布，请先添加图片' });
      return;
    }
    setPublishing(true);
    setPublishResult(null);
    try {
      const imagePaths = selectedImages.map(img => img.path || img.url);
      const result = await publishNote(note, imagePaths);
      setPublishResult(result);
    } catch (error) {
      setPublishResult({ success: false, error: error.message });
    }
    setPublishing(false);
  };

  const handleGenerateImage = async () => {
    if (!note) return;
    setGeneratingImage(true);
    setImageGenError(null);
    try {
      const result = await generateImageForNote(note);
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

  if (collapsed) {
    return (
      <div className="w-12 flex flex-col items-center pt-4"
        style={{ background: 'var(--bg-secondary)', boxShadow: '-2px 0 12px rgba(255,76,58,.06)' }}>
        <button
          onClick={onToggle}
          className="p-2 rounded-xl transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          title="展开笔记预览"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="mt-4">
          <Eye size={16} style={{ color: 'var(--xhs-red)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col shrink-0 relative"
      style={{ width: width || 380, background: 'var(--bg-secondary)', boxShadow: '-2px 0 12px rgba(255,76,58,.06)' }}>
      {/* 拖拽手柄 - 左边缘可拖拽区域，向左偏移一半使其跨越边界更容易点到 */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: 'absolute',
          left: -4,
          top: 0,
          bottom: 0,
          width: 12,
          zIndex: 50,
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="← 拖拽调整宽度 →"
      >
        {/* 拖拽指示条 */}
        <div
          style={{
            width: dragging ? 4 : 2,
            height: 40,
            borderRadius: 4,
            background: dragging ? '#ff4c3a' : '#ccc',
            opacity: dragging ? 1 : 0.6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4c3a'; e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.width = '4px'; }}
          onMouseLeave={(e) => { if (!dragging) { e.currentTarget.style.background = '#ccc'; e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.width = '2px'; }}}
        />
      </div>
      {/* 头部 */}
      <div className="h-14 flex items-center justify-between px-4"
        style={{ borderBottom: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-[15px] font-extrabold" style={{ color: 'var(--xhs-red)' }}>笔记预览</span>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-xl transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {!note ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #fff5f0, #ffe0d5)' }}>
            <span className="text-2xl">📝</span>
          </div>
          <p className="text-sm font-semibold" style={{ color: '#666' }}>暂无笔记</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>在对话中生成笔记后这里会显示预览</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* 笔记预览卡片 */}
          <div className="p-3">
            <div className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--card-shadow)',
              }}>
              {/* 图片区域 */}
              {selectedImages.length > 0 && (
                <div className="aspect-[3/4] relative" style={{ background: 'var(--bg-tertiary)' }}>
                  <img
                    src={selectedImages[0].url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {selectedImages.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                      1/{selectedImages.length}
                    </div>
                  )}
                </div>
              )}

              {/* 笔记内容 */}
              <div className="p-4">
                {isEditing ? (
                  <>
                    <input
                      value={editNote.title}
                      onChange={e => setEditNote(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full rounded-xl px-3 py-2 text-sm font-bold mb-2 outline-none"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <textarea
                      value={editNote.content}
                      onChange={e => setEditNote(prev => ({ ...prev, content: e.target.value }))}
                      rows={8}
                      className="w-full rounded-xl px-3 py-2 text-xs leading-relaxed resize-none outline-none"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <input
                      value={editNote.tags?.join(', ') || ''}
                      onChange={e => setEditNote(prev => ({
                        ...prev,
                        tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                      }))}
                      placeholder="标签，用逗号分隔"
                      className="w-full rounded-xl px-3 py-2 text-xs mt-2 outline-none"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={saveEdit}
                        className="flex-1 py-2 rounded-full text-xs font-bold text-white transition-all"
                        style={{ background: 'var(--xhs-gradient)' }}
                      >
                        保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 py-2 rounded-full text-xs font-bold transition-colors"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                      >
                        取消
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-extrabold leading-snug mb-2" style={{ color: 'var(--text-primary)' }}>
                      {currentNote.title}
                    </h3>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap"
                      style={{
                        color: 'var(--text-secondary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 12,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                      {currentNote.content}
                    </p>
                    {currentNote.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {currentNote.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--xhs-red)' }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 配图管理 */}
          <div className="px-3 pb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                配图 ({selectedImages.length}/9)
              </span>
              <button
                onClick={handleGenerateImage}
                disabled={generatingImage}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                style={{ color: 'var(--xhs-red)', background: 'var(--bg-tertiary)' }}
              >
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

            {/* 已选图片 */}
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {selectedImages.map((img, i) => (
                <div key={i} className="aspect-square relative rounded-xl overflow-hidden group">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>

            {/* 从文章抓取的图片 */}
            {scrapedImages?.length > 0 && (
              <div>
                <span className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                  从文章中提取的图片（点击选择）：
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {scrapedImages.map((url, i) => {
                    const isSelected = selectedImages.some(img => img.url === url);
                    return (
                      <div
                        key={i}
                        className="aspect-square relative rounded-xl overflow-hidden cursor-pointer transition-colors"
                        style={{
                          border: isSelected ? '2px solid var(--xhs-red)' : '2px solid transparent',
                        }}
                        onClick={() => toggleImageSelection({ url, path: url })}
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
            {!isEditing && (
              <button
                onClick={startEdit}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-bold transition-all duration-200"
                style={{
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--xhs-red)'; e.currentTarget.style.color = 'var(--xhs-red)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <Edit3 size={14} />
                编辑笔记
              </button>
            )}
            <button
              onClick={handlePublish}
              disabled={publishing || !note}
              className="w-full flex items-center justify-center gap-1.5 py-3 rounded-full text-sm font-bold text-white transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'var(--xhs-gradient)',
                boxShadow: '0 4px 12px rgba(255,76,58,.25)',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,76,58,.35)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,76,58,.25)'; }}
            >
              {publishing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  发布中...
                </>
              ) : (
                <>
                  <Send size={14} />
                  发布到小红书
                </>
              )}
            </button>

            {publishResult && (
              <div className="p-3 rounded-xl text-xs font-bold text-center"
                style={publishResult.success ? {
                  background: '#f0fdf4',
                  color: '#16a34a',
                  border: '1px solid #bbf7d0',
                } : {
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                }}>
                {publishResult.success ? '✅ 发布成功！' : `❌ ${publishResult.error}`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
