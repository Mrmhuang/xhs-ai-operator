/**
 * XHS AI Operator - 主应用
 * 两栏布局：热点面板 | 对话区 / 报告全屏
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { X, ExternalLink, ArrowLeft } from 'lucide-react';
import TrendingPanel from './components/TrendingPanel';
import ChatPanel from './components/ChatPanel';
import useChat from './hooks/useChat';

export default function App() {
  const {
    messages, isLoading, sendMessage, sendAsNote, clearMessages,
    currentNote, setCurrentNote, scrapedImages, convertToNote,
    noteVersions, versionIndex, setVersionIndex,
  } = useChat();

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [previewTopic, setPreviewTopic] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [reportUrl, setReportUrl] = useState(null);

  const handleSelectTopic = useCallback((topic) => {
    setPreviewTopic(topic);
  }, []);

  const writeFromTopicRef = useRef(false);
  const handleWriteFromTopic = useCallback((topic) => {
    // 防重复：避免 StrictMode 或快速点击导致多次发送
    if (writeFromTopicRef.current || isLoading) return;
    writeFromTopicRef.current = true;
    const text = topic.url
      ? `帮我根据这个热点写一篇小红书笔记：\n${topic.title}\n${topic.url}`
      : `帮我围绕「${topic.title || topic}」这个话题写一篇小红书笔记`;
    sendMessage(text);
    setPreviewTopic(null);
    // 延迟重置，确保不会在同一事件循环中重复触发
    setTimeout(() => { writeFromTopicRef.current = false; }, 1000);
  }, [sendMessage, isLoading]);

  const handleDismissTopic = useCallback(() => {
    setPreviewTopic(null);
  }, []);

  const handleUpdateNote = useCallback((updatedNote) => {
    setCurrentNote(updatedNote);
  }, [setCurrentNote]);

  const handleShowReport = useCallback((url) => {
    setReportUrl(url);
    setShowReport(true);
  }, []);

  // 监听报告 iframe 中的点击事件，联动到聊天预览
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'TREND_REPORT_CLICK' && e.data.title) {
        setPreviewTopic({
          title: e.data.title,
          url: e.data.url || '',
          source: '报告热点',
        });
        // 自动切回对话视图以显示预览卡片
        setShowReport(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <TrendingPanel
        onSelectTopic={handleSelectTopic}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(prev => !prev)}
        onShowReport={handleShowReport}
      />

      {showReport && reportUrl ? (
        <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
            <button
              onClick={() => setShowReport(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <ArrowLeft size={12} /> 返回对话
            </button>
            <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
              📊 热点新闻分析报告
            </span>
            <div className="flex items-center gap-2">
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <ExternalLink size={12} /> 新窗口打开
              </a>
              <button
                onClick={() => setShowReport(false)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--xhs-red)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <iframe
            src={reportUrl}
            title="热点新闻分析报告"
            className="flex-1 w-full"
            style={{ border: 'none', background: '#fff' }}
          />
        </div>
      ) : (
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onSendAsNote={sendAsNote}
          onClear={clearMessages}
          scrapedImages={scrapedImages}
          previewTopic={previewTopic}
          onWriteFromTopic={handleWriteFromTopic}
          onDismissTopic={handleDismissTopic}
          currentNote={currentNote}
          onUpdateNote={handleUpdateNote}
          onConvertToNote={convertToNote}
          noteVersions={noteVersions}
          versionIndex={versionIndex}
          onVersionChange={setVersionIndex}
        />
      )}

      {/* <NotePreview
        note={currentNote}
        onUpdateNote={handleUpdateNote}
        scrapedImages={scrapedImages}
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed(prev => !prev)}
        width={rightWidth}
        onWidthChange={setRightWidth}
      /> */}
    </div>
  );
}
