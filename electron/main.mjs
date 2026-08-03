import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchArticleHtml, parseArticleFromHtml } from '../shared/fetch-article.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rendererUrl = 'http://127.0.0.1:5173'

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

  const html = await fetchArticleHtml(target)
  return parseArticleFromHtml(html, target)
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
