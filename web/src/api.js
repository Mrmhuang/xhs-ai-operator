/**
 * API 封装
 */
const BASE = '';

export async function fetchStream(url, body, onChunk) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        } catch {}
      }
    }
  }
}

export async function generateNote(data) {
  const res = await fetch(`${BASE}/api/chat/generate-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function polishNote(note, instruction, history = []) {
  const res = await fetch(`${BASE}/api/chat/polish-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, instruction, history }),
  });
  return res.json();
}

export async function generateImage(prompt, options = {}) {
  const res = await fetch(`${BASE}/api/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, ...options }),
  });
  return res.json();
}

export async function generateImageForNote(note) {
  const res = await fetch(`${BASE}/api/image/generate-for-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  return res.json();
}

export async function uploadImages(files) {
  const formData = new FormData();
  files.forEach(f => formData.append('images', f));
  const res = await fetch(`${BASE}/api/image/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function publishNote(note, imagePaths) {
  const res = await fetch(`${BASE}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, imagePaths }),
  });
  return res.json();
}

export async function getPublishStatus() {
  const res = await fetch(`${BASE}/api/publish/status`);
  return res.json();
}

export async function triggerCrawl() {
  const res = await fetch(`${BASE}/api/trending/crawl`, { method: 'POST' });
  return res.json();
}

export async function setAutoRefresh(interval) {
  const res = await fetch(`${BASE}/api/trending/auto-refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval }),
  });
  return res.json();
}

export async function getAutoRefreshStatus() {
  const res = await fetch(`${BASE}/api/trending/auto-refresh`);
  return res.json();
}

export async function getPlugins() {
  const res = await fetch(`${BASE}/api/plugins`);
  return res.json();
}

export async function getHealth() {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}

export async function getTrendReport() {
  const res = await fetch(`${BASE}/api/trending/report`);
  return res.json();
}
