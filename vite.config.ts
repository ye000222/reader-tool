import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const execFileAsync = promisify(execFile)
const browserHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}
const powershellFetchScript = [
  "$ProgressPreference = 'SilentlyContinue'",
  "$headers = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'; 'Accept' = 'text/html,application/xhtml+xml' }",
  "$response = Invoke-WebRequest -Uri $env:TARGET_URL -UseBasicParsing -Headers $headers -TimeoutSec 30",
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'Write-Output $response.Content',
].join('; ')

async function readJsonBody(req: IncomingMessage) {
  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? (JSON.parse(raw) as { url?: string }) : {}
}

async function fetchArticleForDevServer(target: string) {
  const html = await fetchHtmlForDevServer(target)
  const dom = new JSDOM(html, { url: target })
  const article = new Readability(dom.window.document).parse()

  if (!article?.textContent?.trim()) {
    throw new Error('无法从该网页中提取正文内容。')
  }

  return {
    url: target,
    title: article.title || target,
    byline: article.byline || '',
    excerpt: article.excerpt || '',
    textContent: article.textContent,
  }
}

async function fetchHtmlForDevServer(target: string) {
  try {
    const response = await fetch(target, {
      headers: browserHeaders,
    })

    if (!response.ok) {
      throw new Error(`网页抓取失败：${response.status} ${response.statusText}`)
    }

    return await response.text()
  } catch (error) {
    if (process.platform !== 'win32') {
      throw error
    }

    try {
      const result = await execFileAsync(
        'powershell',
        ['-NoProfile', '-Command', powershellFetchScript],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TARGET_URL: target,
          },
          maxBuffer: 20 * 1024 * 1024,
        },
      )

      return result.stdout
    } catch {
      throw error
    }
  }
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

            const article = await fetchArticleForDevServer(target)
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
