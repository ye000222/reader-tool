import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
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

function assertPublicUrl(target) {
  let hostname

  try {
    hostname = new URL(target).hostname
  } catch {
    throw new Error('请输入有效的网页地址。')
  }

  if (!hostname) {
    throw new Error('该地址不允许抓取（内网/回环地址被拦截）。')
  }

  const normalized = hostname.toLowerCase().replace(/\.$/, '')

  if (normalized === 'localhost') {
    throw new Error('该地址不允许抓取（内网/回环地址被拦截）。')
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('该地址不允许抓取（内网/回环地址被拦截）。')
    }
  }
}

function isPrivateIp(ip) {
  if (ip.includes(':')) {
    return ip === '::1' || ip === '::' || /^f[cd][0-9a-f]{2}:/i.test(ip)
  }

  const parts = ip.split('.').map(Number)

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true
  }

  const [a, b] = parts

  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true

  return false
}

export async function fetchArticleHtml(target) {
  assertPublicUrl(target)

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
