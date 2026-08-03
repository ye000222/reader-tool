import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

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

export async function fetchArticleHtml(target) {
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

export function parseArticleFromHtml(html, target) {
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
