export interface ArticlePayload {
  url: string
  title: string
  byline: string
  excerpt: string
  textContent: string
}

export function fetchArticleHtml(target: string): Promise<string>

export function parseArticleFromHtml(html: string, target: string): ArticlePayload
