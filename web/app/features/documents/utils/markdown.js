/**
 * Minimal Markdown → HTML renderer (no external dependencies).
 *
 * Deliberately hand-written: every character of the source is HTML-escaped
 * first, then a small set of safe constructs is converted, so no sanitizer
 * is needed and arbitrary HTML in documents can never execute.
 *
 * Supported syntax:
 *   # .. ###### headings          - / * / + unordered lists (flat)
 *   **bold**, *italic*, `code`    1. ordered lists (flat)
 *   ``` fenced code blocks        > blockquotes
 *   [text](url) links (http/https/mailto/relative only)
 *   --- / *** / ___ horizontal rules
 *   single newlines become <br /> inside paragraphs
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character])
}

/** Only allow link URLs that cannot inject javascript: or data: schemes. */
function safeUrl(url) {
  const trimmed = String(url).trim()
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(trimmed)) {
    return trimmed
  }
  return '#'
}

function renderInline(text) {
  let output = escapeHtml(text)

  // Inline code is extracted first so its content is never formatted.
  const codes = []
  output = output.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })

  output = output
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, url) =>
        `<a href="${safeUrl(url)}" rel="noopener noreferrer">${label}</a>`,
    )

  return output.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)])
}

function isHorizontalRule(line) {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(line.trim())
}

function headingLevel(marker) {
  return Math.min(marker.length, 6)
}

export function renderMarkdown(source = '') {
  const working = String(source)

  // Fenced code blocks are lifted out before line-based block parsing.
  const codeBlocks = []
  const withoutFences = working.replace(
    /```[^\n]*\n?([\s\S]*?)```/g,
    (_, code) => {
      codeBlocks.push(
        `<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`,
      )
      return `\u0001${codeBlocks.length - 1}\u0001`
    },
  )

  const lines = withoutFences.split('\n')
  const html = []
  let paragraph = []
  let listItems = null // { ordered: boolean, items: string[] }
  let quoteLines = null

  function flushParagraph() {
    if (!paragraph.length) return
    html.push(
      `<p>${paragraph.map(renderInline).join('<br />')}</p>`,
    )
    paragraph = []
  }

  function flushList() {
    if (!listItems) return
    const tag = listItems.ordered ? 'ol' : 'ul'
    const items = listItems.items
      .map((item) => `<li>${renderInline(item)}</li>`)
      .join('')
    html.push(`<${tag}>${items}</${tag}>`)
    listItems = null
  }

  function flushQuote() {
    if (!quoteLines) return
    html.push(
      `<blockquote>${quoteLines.map(renderInline).join('<br />')}</blockquote>`,
    )
    quoteLines = null
  }

  function flushAll() {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const rawLine of lines) {
    const line = rawLine

    const fence = line.match(/^\u0001(\d+)\u0001$/)
    if (fence) {
      flushAll()
      html.push(codeBlocks[Number(fence[1])])
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flushAll()
      const level = headingLevel(heading[1])
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
      continue
    }

    if (isHorizontalRule(line)) {
      flushAll()
      html.push('<hr />')
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      flushList()
      if (!quoteLines) quoteLines = []
      quoteLines.push(quote[1])
      continue
    }

    const unordered = line.match(/^[-*+]\s+(.*)$/)
    if (unordered) {
      flushParagraph()
      flushQuote()
      if (!listItems || listItems.ordered) {
        flushList()
        listItems = { ordered: false, items: [] }
      }
      listItems.items.push(unordered[1])
      continue
    }

    const ordered = line.match(/^\d+[.)]\s+(.*)$/)
    if (ordered) {
      flushParagraph()
      flushQuote()
      if (!listItems || !listItems.ordered) {
        flushList()
        listItems = { ordered: true, items: [] }
      }
      listItems.items.push(ordered[1])
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line)
  }

  flushAll()
  return html.join('\n')
}
