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

function renderInline(text, options = {}) {
  let output = escapeHtml(text)

  // Inline code is extracted first so its content is never formatted.
  const codes = []
  output = output.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })

  // Wiki links: [[target]] or [[target|display]]
  const wiki = options.wiki
  output = output.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (match, rawTarget, rawDisplay) => {
      const target = String(rawTarget).trim()
      const display = String(rawDisplay ?? rawTarget).trim()
      if (!target) return match
      if (!wiki || typeof wiki.resolve !== 'function') {
        return `<span class="rounded-sm bg-muted px-1 py-0.5 text-muted-foreground">${display || escapeHtml(target)}</span>`
      }
      const result = wiki.resolve(target)
      if (result && result.status === 'resolved' && result.id != null) {
        const href = `/documents/${encodeURIComponent(String(result.id))}`
        const folder =
          result.folderName
            ? ` <span class="text-[11px] text-muted-foreground">· ${escapeHtml(String(result.folderName))}</span>`
            : ''
        return `<a href="${href}" data-wiki-doc-id="${escapeHtml(String(result.id))}" class="rounded-sm bg-accent px-1 py-0.5 font-medium underline-offset-2 hover:underline">${display || escapeHtml(target)}${folder}</a>`
      }
      if (result && result.status === 'ambiguous') {
        // Dashed neutral styling via theme tokens only (no arbitrary colors).
        return `<span class="inline-flex items-center gap-1 rounded-sm border border-dashed border-border bg-muted px-1 py-0.5 text-muted-foreground" title="Ambiguous wiki link: multiple accessible documents share this title">${display || escapeHtml(target)}<span class="text-[10px] font-medium uppercase tracking-wide">ambiguous</span></span>`
      }
      if (result && result.status === 'unresolved') {
        return `<span class="inline-flex items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-destructive" title="Unresolved wiki link: no accessible document with this exact title">${display || escapeHtml(target)}<span class="text-[10px] font-medium uppercase tracking-wide">unresolved</span></span>`
      }
      // Neutral "unknown": the backend resolutions for this document were not
      // loaded (or the token was typed since the last save). Never clickable,
      // never claimed as unresolved.
      return `<span class="inline-flex items-center gap-1 rounded-sm border border-dashed border-border bg-muted/50 px-1 py-0.5 text-muted-foreground" title="Wiki link status not available yet (save the document to resolve it)">${display || escapeHtml(target)}<span class="text-[10px] font-medium uppercase tracking-wide">unknown</span></span>`
    },
  )

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

export function renderMarkdown(source = '', options = {}) {
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
      `<p>${paragraph.map((line) => renderInline(line, options)).join('<br />')}</p>`,
    )
    paragraph = []
  }

  function flushList() {
    if (!listItems) return
    const tag = listItems.ordered ? 'ol' : 'ul'
    const items = listItems.items
      .map((item) => `<li>${renderInline(item, options)}</li>`)
      .join('')
    html.push(`<${tag}>${items}</${tag}>`)
    listItems = null
  }

  function flushQuote() {
    if (!quoteLines) return
    html.push(
      `<blockquote>${quoteLines.map((line) => renderInline(line, options)).join('<br />')}</blockquote>`,
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
      html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`)
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
