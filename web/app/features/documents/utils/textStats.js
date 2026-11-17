/** Editor statistics shown in the status bar. */

export function countWords(text) {
  const matches = String(text || '').match(/\S+/g)
  return matches ? matches.length : 0
}

export function countCharacters(text) {
  return String(text || '').length
}
