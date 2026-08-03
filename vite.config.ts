import type { IncomingMessage, ServerResponse } from 'node:http'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { fetchArticleHtml, parseArticleFromHtml } from './shared/fetch-article.mjs'

async function readJsonBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? (JSON.parse(raw) as { url?: string }) : {}
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'reader-tool-web-import-dev-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'POST' || req.url !== '/api/article/fetch') {
            next()
            return
          }

          try {
            const body = await readJsonBody(req)
            const target = String(body.url || '').trim()

            if (!/^https?:\/\//i.test(target)) {
              writeJson(res, 400, {
                error: '请输入有效的网页地址，必须以 http:// 或 https:// 开头。',
              })
              return
            }

            const html = await fetchArticleHtml(target)
            const article = parseArticleFromHtml(html, target)
            writeJson(res, 200, article)
          } catch (error) {
            writeJson(res, 500, {
              error: error instanceof Error ? error.message : '网页导入失败。',
            })
          }
        })
      },
    },
  ],
})
