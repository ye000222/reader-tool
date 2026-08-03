import type { WebArticlePayload } from '../types'

export async function fetchArticleForCurrentRuntime(target: string): Promise<WebArticlePayload> {
  if (window.desktopApi) {
    return window.desktopApi.fetchArticle(target)
  }

  const response = await fetch('/api/article/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: target }),
  })

  if (!response.ok) {
    let message = `网页导入失败：${response.status}`

    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        message = payload.error
      }
    } catch {
      if (response.status === 404) {
        message = '当前网页模式未启用导入服务。请使用 start-web.bat 启动，或改用桌面版。'
      }
    }

    throw new Error(message)
  }

  return (await response.json()) as WebArticlePayload
}
