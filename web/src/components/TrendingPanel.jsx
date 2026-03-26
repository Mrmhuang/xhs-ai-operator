/**
 * 左侧热点面板 - 小红书暖色风
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  Timer,
  Zap,
  GripVertical,
} from "lucide-react";
import {
  triggerCrawl,
  setAutoRefresh,
  getAutoRefreshStatus,
  getTrendReport,
} from "../api";

export default function TrendingPanel({
  onSelectTopic,
  collapsed,
  onToggle,
  onShowReport,
  width,
  onWidthChange,
}) {
  // 爬虫 & 定时抓取状态
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60);
  const [showCrawlPanel, setShowCrawlPanel] = useState(false);
  const [lastCrawlTime, setLastCrawlTime] = useState(null);

  // 报告状态
  const [reportUrl, setReportUrl] = useState(null);
  const [reportItems, setReportItems] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  // 拖拽调整宽度
  const resizeDragState = useRef({ active: false, startX: 0, startW: 0 });
  const panelWidthRef = useRef(width || 320);
  const onWidthChangeRef = useRef(onWidthChange);
  const [resizing, setResizing] = useState(false);

  useEffect(() => { panelWidthRef.current = width || 320; }, [width]);
  useEffect(() => { onWidthChangeRef.current = onWidthChange; }, [onWidthChange]);

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!resizeDragState.current.active) return;
      e.preventDefault();
      const delta = e.clientX - resizeDragState.current.startX;
      const maxW = Math.floor(window.innerWidth * 0.45);
      const newWidth = Math.min(Math.max(resizeDragState.current.startW + delta, 220), maxW);
      onWidthChangeRef.current?.(newWidth);
    };
    const handleResizeUp = () => {
      if (!resizeDragState.current.active) return;
      resizeDragState.current.active = false;
      setResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };
  }, []);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDragState.current = { active: true, startX: e.clientX, startW: panelWidthRef.current };
    setResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // 拖拽排序状态
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    // 半透明拖拽效果
    e.currentTarget.style.opacity = "0.4";
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const newItems = [...reportItems];
      const [moved] = newItems.splice(dragIdx, 1);
      newItems.splice(dragOverIdx, 0, moved);
      setReportItems(newItems);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };

  // 组件挂载时加载报告
  useEffect(() => {
    setReportLoading(true);
    getTrendReport()
      .then((res) => {
        if (res?.success && res.url) {
          setReportUrl(res.url + "?t=" + Date.now());
          setReportItems(res.items || []);
        } else {
          setReportUrl(null);
          setReportItems([]);
        }
      })
      .catch(() => {
        setReportUrl(null);
        setReportItems([]);
      })
      .finally(() => setReportLoading(false));
  }, []);

  // 加载定时抓取状态
  useEffect(() => {
    getAutoRefreshStatus()
      .then((res) => {
        if (res?.success && res.data) {
          setAutoRefreshEnabled(res.data.enabled);
          if (res.data.intervalMinutes > 0)
            setAutoRefreshInterval(res.data.intervalMinutes);
          if (res.data.lastCrawlTime) setLastCrawlTime(res.data.lastCrawlTime);
        }
      })
      .catch(() => {});
  }, []);

  // 刷新报告数据
  const refreshReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await getTrendReport();
      if (res?.success && res.url) {
        setReportUrl(res.url + "?t=" + Date.now());
        setReportItems(res.items || []);
      }
    } catch {}
    setReportLoading(false);
  }, []);

  // 手动触发爬虫
  const handleCrawl = async () => {
    setCrawling(true);
    setCrawlResult(null);
    try {
      const res = await triggerCrawl();
      if (res?.success) {
        setCrawlResult({ success: true, total: res.data?.total || 0 });
        setLastCrawlTime(new Date().toISOString());
        // 爬完自动刷新报告
        await refreshReport();
      } else {
        setCrawlResult({ success: false, error: res?.error || "抓取失败" });
      }
    } catch (e) {
      setCrawlResult({ success: false, error: "网络错误" });
    }
    setCrawling(false);
  };

  // 切换定时抓取
  const handleToggleAutoRefresh = async () => {
    const newEnabled = !autoRefreshEnabled;
    const interval = newEnabled ? autoRefreshInterval : 0;
    try {
      const res = await setAutoRefresh(interval);
      if (res?.success) {
        setAutoRefreshEnabled(newEnabled);
      }
    } catch {}
  };

  // 更新定时间隔
  const handleIntervalChange = async (minutes) => {
    setAutoRefreshInterval(minutes);
    if (autoRefreshEnabled) {
      try {
        await setAutoRefresh(minutes);
      } catch {}
    }
  };

  // 关键词标签颜色映射
  const tagColors = {
    OpenAI: { bg: "linear-gradient(135deg, #10b981, #34d399)", color: "#fff" },
    Gemini: { bg: "linear-gradient(135deg, #3b82f6, #60a5fa)", color: "#fff" },
    DeepSeek: {
      bg: "linear-gradient(135deg, #ef4444, #f87171)",
      color: "#fff",
    },
    "Meta AI": {
      bg: "linear-gradient(135deg, #6366f1, #818cf8)",
      color: "#fff",
    },
    Anthropic: {
      bg: "linear-gradient(135deg, #f59e0b, #fbbf24)",
      color: "#fff",
    },
    MiniMax: { bg: "linear-gradient(135deg, #a855f7, #c084fc)", color: "#fff" },
    Claude: { bg: "linear-gradient(135deg, #d97706, #f59e0b)", color: "#fff" },
    "AI 编程": {
      bg: "linear-gradient(135deg, #06b6d4, #22d3ee)",
      color: "#fff",
    },
    Cursor: { bg: "linear-gradient(135deg, #8b5cf6, #a78bfa)", color: "#fff" },
  };
  const getTagStyle = (keyword) => {
    return tagColors[keyword] || { bg: "var(--xhs-gradient)", color: "#fff" };
  };

  if (collapsed) {
    return (
      <div
        className="w-12 flex flex-col items-center pt-4"
        style={{
          background: "var(--bg-secondary)",
          borderRight: "none",
          boxShadow: "2px 0 12px rgba(255,76,58,.06)",
        }}
      >
        <button
          onClick={onToggle}
          className="p-2 rounded-xl transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-tertiary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          title="展开热点面板"
        >
          <ChevronRight size={16} />
        </button>
        <div className="mt-4 text-lg">🔥</div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col relative"
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg-secondary)",
        boxShadow: "2px 0 12px rgba(255,76,58,.06)",
      }}
    >
      {/* 右边缘拖拽手柄 */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          right: -4,
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
        <div
          style={{
            width: resizing ? 4 : 2,
            height: 40,
            borderRadius: 4,
            background: resizing ? '#ff4c3a' : '#ccc',
            opacity: resizing ? 1 : 0.6,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ff4c3a'; e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.width = '4px'; }}
          onMouseLeave={(e) => { if (!resizing) { e.currentTarget.style.background = '#ccc'; e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.width = '2px'; }}}
        />
      </div>
      {/* 头部 */}
      <div
        className="p-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "var(--xhs-red)",
              animation: "pulse 2s infinite",
            }}
          />
          <span
            className="text-lg font-extrabold"
            style={{ color: "var(--xhs-red)" }}
          >
            热点雷达
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-xl transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* 爬虫运行中提示条 */}
      {crawling && (
        <div
          className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-white"
          style={{
            background: "linear-gradient(135deg, #ff6b35, #ff4c3a)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <Zap size={12} className="animate-pulse" />
          爬虫运行中...
        </div>
      )}

      {/* 抓取结果提示 */}
      {crawlResult && !crawling && (
        <div
          className="text-[11px] px-3 py-2 text-center"
          style={{
            background: crawlResult.success
              ? "rgba(34,197,94,.1)"
              : "rgba(239,68,68,.1)",
            color: crawlResult.success ? "#16a34a" : "#ef4444",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {crawlResult.success ? `✅ 抓取完成` : `❌ ${crawlResult.error}`}
        </div>
      )}

      {/* 内容区 - 报告 */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="mt-1">
            {reportLoading && (
              <div
                className="p-6 text-center text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                <RefreshCw
                  size={18}
                  className="animate-spin mx-auto mb-2"
                  style={{ color: "var(--xhs-red)" }}
                />
                <p>加载报告中...</p>
              </div>
            )}
            {!reportLoading && reportUrl && (
              <>
                <div className="p-3">
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => onShowReport(reportUrl)}
                      className="flex-1 py-2 rounded-full text-xs font-bold text-white transition-all duration-200"
                      style={{
                        background: "var(--xhs-gradient)",
                        boxShadow: "0 4px 12px rgba(255,76,58,.25)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                      }}
                    >
                      📊 查看完整报告
                    </button>
                    <a
                      href={reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-full text-xs font-bold transition-colors"
                      style={{
                        color: "var(--text-secondary)",
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--xhs-red)";
                        e.currentTarget.style.borderColor = "var(--xhs-red)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-secondary)";
                        e.currentTarget.style.borderColor =
                          "var(--border-color)";
                      }}
                    >
                      <ExternalLink size={10} />
                    </a>
                  </div>
                  {reportItems.length > 0 && (
                    <p
                      className="text-[10px] mb-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      共 {reportItems.length} 条热点，点击可联动写笔记
                    </p>
                  )}
                </div>
                {/* 报告中的热点新闻列表（支持拖拽排序） */}
                <div className="space-y-1.5 px-3 pb-2">
                  {reportItems.map((item, i) => {
                    const tagStyle = getTagStyle(item.keyword);
                    const isDragOver = dragOverIdx === i && dragIdx !== i;
                    return (
                      <div
                        key={`report-${i}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnter={(e) => e.preventDefault()}
                        className="p-3 rounded-xl cursor-pointer transition-all duration-200 group"
                        style={{
                          background: "var(--bg-secondary)",
                          border: isDragOver
                            ? "1px dashed var(--xhs-red)"
                            : "1px solid var(--border-color)",
                          transform: isDragOver ? "scale(1.02)" : undefined,
                        }}
                        onClick={() =>
                          onSelectTopic({
                            title: item.title,
                            url: item.url,
                            source: "报告热点",
                            keyword: item.keyword,
                          })
                        }
                        onMouseEnter={(e) => {
                          if (!isDragOver) {
                            e.currentTarget.style.borderColor =
                              "var(--border-hover)";
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.boxShadow =
                              "var(--card-shadow-hover)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isDragOver) {
                            e.currentTarget.style.borderColor =
                              "var(--border-color)";
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = "none";
                          }
                        }}
                      >
                        {/* 标题行：拖拽手柄 + 标题 */}
                        <div className="flex items-start gap-1.5">
                          <div
                            className="mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity shrink-0"
                            style={{ color: "var(--text-muted)" }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <GripVertical size={12} />
                          </div>
                          <h4
                            className="text-[12px] font-bold leading-relaxed flex-1"
                            style={{
                              color: "var(--text-primary)",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {item.title}
                          </h4>
                        </div>
                        {/* 底部信息：关键词 + 排名 + 平台 + 外链 */}
                        <div className="flex items-center gap-1.5 mt-1.5 ml-5 flex-wrap">
                          {item.keyword && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                              style={{
                                background: tagStyle.bg,
                                color: tagStyle.color,
                              }}
                            >
                              {item.keyword}
                            </span>
                          )}
                          {item.rank && (
                            <span
                              className="text-[10px] font-mono font-bold"
                              style={{ color: "var(--xhs-red)" }}
                            >
                              #{item.rank}
                            </span>
                          )}
                          {item.platform && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{
                                background: "var(--bg-tertiary)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-color)",
                              }}
                            >
                              {item.platform}
                            </span>
                          )}
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-auto transition-colors"
                              style={{ color: "var(--text-secondary)" }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "var(--xhs-red)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color =
                                  "var(--text-secondary)";
                              }}
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {!reportLoading && !reportUrl && (
              <div
                className="p-6 text-center text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                <p className="mb-3">暂无报告</p>
                <p className="mb-3">请点击底部「立即抓取热点」按钮运行爬虫</p>
                <button
                  onClick={handleCrawl}
                  disabled={crawling}
                  className="px-4 py-2 rounded-full text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--xhs-gradient)" }}
                >
                  {crawling ? "抓取中..." : "立即抓取热点"}
                </button>
              </div>
            )}
          </div>

      </div>

      {/* 底部 */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        {/* 定时抓取设置面板 */}
        {showCrawlPanel && (
          <div className="mb-3 p-2.5 rounded-xl" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
            {/* 定时抓取开关 */}
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                定时自动抓取
              </span>
              <button
                onClick={handleToggleAutoRefresh}
                className="relative w-10 h-5 rounded-full transition-all duration-200"
                style={{
                  background: autoRefreshEnabled ? "var(--xhs-red)" : "#d1d5db",
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: autoRefreshEnabled ? "22px" : "2px" }}
                />
              </button>
            </div>

            {/* 间隔选择 */}
            {autoRefreshEnabled && (
              <div className="flex gap-1.5 flex-wrap">
                {[30, 60, 120, 360].map((min) => (
                  <button
                    key={min}
                    onClick={() => handleIntervalChange(min)}
                    className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-all"
                    style={
                      autoRefreshInterval === min
                        ? {
                            background: "var(--xhs-gradient)",
                            color: "#fff",
                            boxShadow: "0 2px 6px rgba(255,76,58,.2)",
                          }
                        : {
                            background: "var(--bg-secondary)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-color)",
                          }
                    }
                  >
                    {min < 60 ? `${min}分钟` : `${min / 60}小时`}
                  </button>
                ))}
              </div>
            )}

            {/* 上次抓取时间 */}
            {lastCrawlTime && (
              <div
                className="flex items-center gap-1 mt-2 text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                <Clock size={9} />
                <span>
                  上次抓取：
                  {new Date(lastCrawlTime).toLocaleString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 自动抓取状态提示 */}
        {autoRefreshEnabled && !showCrawlPanel && (
          <div
            className="flex items-center justify-center gap-1.5 text-[10px] mb-2"
            style={{ color: "var(--xhs-red)" }}
          >
            <Timer size={10} className="animate-pulse" />
            <span>
              自动抓取已开启（每{" "}
              {autoRefreshInterval < 60
                ? `${autoRefreshInterval}分钟`
                : `${autoRefreshInterval / 60}小时`}
              ）
            </span>
          </div>
        )}

        {/* 主操作行：立即抓取 + 设置按钮 */}
        <div className="flex gap-2">
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full text-sm font-bold text-white transition-all duration-200 disabled:opacity-50"
            style={{
              background: crawling
                ? "#999"
                : "var(--xhs-gradient)",
              boxShadow: crawling ? "none" : "0 4px 12px rgba(255,76,58,.2)",
            }}
            onMouseEnter={(e) => {
              if (!crawling) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(255,76,58,.3)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = crawling ? "none" : "0 4px 12px rgba(255,76,58,.2)";
            }}
          >
            <Zap size={14} className={crawling ? "animate-pulse" : ""} />
            {crawling ? "抓取中..." : "立即抓取热点"}
          </button>
          <button
            onClick={() => setShowCrawlPanel(!showCrawlPanel)}
            className="flex items-center justify-center w-10 rounded-full transition-all duration-200"
            style={{
              background: showCrawlPanel || autoRefreshEnabled
                ? "var(--xhs-red)"
                : "var(--bg-tertiary)",
              color: showCrawlPanel || autoRefreshEnabled
                ? "#fff"
                : "var(--text-secondary)",
              border: `1px solid ${showCrawlPanel || autoRefreshEnabled ? "var(--xhs-red)" : "var(--border-color)"}`,
            }}
            onMouseEnter={(e) => {
              if (!showCrawlPanel && !autoRefreshEnabled) {
                e.currentTarget.style.borderColor = "var(--xhs-red)";
                e.currentTarget.style.color = "var(--xhs-red)";
              }
            }}
            onMouseLeave={(e) => {
              if (!showCrawlPanel && !autoRefreshEnabled) {
                e.currentTarget.style.borderColor = "var(--border-color)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            title="定时抓取设置"
          >
            <Timer size={14} className={autoRefreshEnabled ? "animate-pulse" : ""} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
