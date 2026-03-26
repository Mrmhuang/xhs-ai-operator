FROM node:20-slim

WORKDIR /app

# 安装后端依赖
COPY package.json package-lock.json* ./
RUN npm ci --production

# 构建前端
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build

# 复制后端代码
COPY server/ ./server/

# 创建上传目录
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server/app.js"]
