import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rendererUrl = 'http://127.0.0.1:5173'
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

async function fetchHtmlForArticle(target) {
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

/** @type {BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Reader Tool',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('article:fetch', async (_event, url) => {
  const target = String(url || '').trim()

  if (!/^https?:\/\//i.test(target)) {
    throw new Error('请输入有效的网页地址，必须以 http:// 或 https:// 开头。')
  }

  try {
    const html = await fetchHtmlForArticle(target)
    const dom = new JSDOM(html, { url: target })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article?.textContent?.trim()) {
      throw new Error('无法从该网页中提取正文内容。')
    }

    const payload = {
      url: target,
      title: article.title || target,
      byline: article.byline || '',
      excerpt: article.excerpt || '',
      textContent: article.textContent,
    }

    return payload
  } catch (error) {
    throw error
  }
})

ipcMain.handle('data:export', async (_event, payload) => {
  const result = await dialog.showSaveDialog({
    title: '导出阅读数据',
    defaultPath: 'reading-tool-export.json',
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await app.whenReady()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8')

  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog({
    title: '导入阅读数据',
    properties: ['openFile'],
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  await app.whenReady()
  const { readFile } = await import('node:fs/promises')
  const content = await readFile(result.filePaths[0], 'utf8')

  return {
    canceled: false,
    filePath: result.filePaths[0],
    content,
  }
})
