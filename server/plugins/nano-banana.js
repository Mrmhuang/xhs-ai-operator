/**
 * Nano Banana 图片生成插件 - 基于 Gemini API 生成图片
 */
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const nanoBanana = {
  name: 'nano-banana',
  description: 'Nano Banana 图片生成 (Gemini API)',

  /**
   * 生成图片
   * @param {string} prompt - 图片描述
   * @param {object} options - 选项
   * @param {string} options.aspectRatio - 宽高比，默认 '3:4' (小红书)
   * @param {string} options.style - 风格描述
   */
  async generate(prompt, options = {}) {
    const { aspectRatio = '3:4', style = '' } = options;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const fullPrompt = style
      ? `${style}. ${prompt}`
      : prompt;

    // 使用 Gemini 图片生成专用模型
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate an image: ${fullPrompt}. Aspect ratio: ${aspectRatio}. The image should be high quality, modern, and visually appealing for social media.`,
            }],
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${err}`);
    }

    const data = await response.json();

    // 从响应中提取图片
    const images = [];
    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          const { mimeType, data: base64Data } = part.inlineData;
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const filename = `${uuidv4()}.${ext}`;
          const uploadDir = process.env.UPLOAD_DIR || './uploads';
          await fs.mkdir(uploadDir, { recursive: true });
          const filePath = path.join(uploadDir, filename);
          await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
          images.push({
            filename,
            path: filePath,
            url: `/uploads/${filename}`,
            mimeType,
          });
        }
      }
    }

    // 提取文本响应
    let textResponse = '';
    for (const candidate of data.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.text) textResponse += part.text;
      }
    }

    return {
      success: true,
      images,
      text: textResponse,
    };
  },

  /**
   * 根据笔记内容自动生成配图（并发生成2张供用户选择）
   */
  async generateForNote(note) {
    const basePrompt = note.imagePrompt || `Create a visually appealing social media image about: ${note.title}`;
    const styles = [
      'Modern, clean, tech-themed infographic style with vibrant colors',
      'Warm, lifestyle-oriented illustration style with soft gradients and friendly tones',
    ];

    const tasks = styles.map(style =>
      this.generate(basePrompt, { aspectRatio: '3:4', style }).catch(() => ({ success: false, images: [] }))
    );
    const results = await Promise.all(tasks);
    const allImages = results.flatMap(r => r.images || []);

    return {
      success: allImages.length > 0,
      images: allImages,
    };
  },
};

export default nanoBanana;
