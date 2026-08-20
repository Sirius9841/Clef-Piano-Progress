import { DOMParser, type Document as XmlDocument, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom'
import { ScoreImportError } from './errors'

export type { XmlDocument, XmlElement, XmlNode }

export function nodeName(node: XmlNode): string {
  const name = node.localName || node.nodeName
  const separator = name.indexOf(':')
  return separator >= 0 ? name.slice(separator + 1) : name
}

export function childElements(parent: XmlNode): XmlElement[] {
  const result: XmlElement[] = []
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const node = parent.childNodes.item(index)
    if (node?.nodeType === 1) result.push(node as XmlElement)
  }
  return result
}

export function childrenNamed(parent: XmlNode, name: string): XmlElement[] {
  return childElements(parent).filter((child) => nodeName(child) === name)
}

export function firstChildNamed(parent: XmlNode, name: string): XmlElement | null {
  return childElements(parent).find((child) => nodeName(child) === name) ?? null
}

export function descendantsNamed(parent: XmlNode, name: string): XmlElement[] {
  const matches: XmlElement[] = []
  const visit = (node: XmlNode) => {
    for (const child of childElements(node)) {
      if (nodeName(child) === name) matches.push(child)
      visit(child)
    }
  }
  visit(parent)
  return matches
}

export function textContent(element: XmlElement | null): string | null {
  const value = element?.textContent?.trim()
  return value ? value : null
}

export function childText(parent: XmlNode, name: string): string | null {
  return textContent(firstChildNamed(parent, name))
}

export function numericChild(parent: XmlNode, name: string): number | null {
  const text = childText(parent, name)
  if (text === null) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function integerChild(parent: XmlNode, name: string): number | null {
  const value = numericChild(parent, name)
  return value !== null && Number.isSafeInteger(value) ? value : null
}

function rejectExternalResources(document: XmlDocument): void {
  const candidates = ['credit-image', 'image', 'link']
  for (const tagName of candidates) {
    for (const element of descendantsNamed(document, tagName)) {
      for (const attributeName of ['source', 'href', 'xlink:href']) {
        const value = element.getAttribute(attributeName)?.trim()
        if (value) {
          throw new ScoreImportError('EXTERNAL_RESOURCE_NOT_ALLOWED', 'External images and linked resources are not accepted in imported scores.', { detail: `${tagName}[${attributeName}]` })
        }
      }
    }
  }
}

export function parseXmlDocument(xmlText: string): XmlDocument {
  if (!xmlText.trim()) throw new ScoreImportError('EMPTY_FILE', 'The selected score is empty.')
  if (xmlText.toUpperCase().includes('<!DOCTYPE')) {
    throw new ScoreImportError('DOCTYPE_NOT_ALLOWED', 'MusicXML files containing a DOCTYPE declaration are not accepted for security reasons.')
  }

  try {
    const document = new DOMParser({
      onError: (level, message) => {
        throw new Error(`${level}: ${message}`)
      },
    }).parseFromString(xmlText, 'application/xml')
    if (!document.documentElement) throw new ScoreImportError('INVALID_XML', 'The XML document has no root element.')
    return document
  } catch (cause) {
    if (cause instanceof ScoreImportError) throw cause
    throw new ScoreImportError('INVALID_XML', 'The selected file contains malformed XML.', { detail: cause instanceof Error ? cause.message : undefined }, { cause })
  }
}

export function parseMusicXmlDocument(xmlText: string): XmlDocument {
  const document = parseXmlDocument(xmlText)
  try {
    const root = document.documentElement
    if (!root) throw new ScoreImportError('INVALID_XML', 'The XML document has no root element.')
    const rootName = nodeName(root)
    if (rootName === 'score-timewise') {
      throw new ScoreImportError('UNSUPPORTED_SCORE_TIMEWISE', 'Timewise MusicXML is detected but not supported. Export the score as score-partwise MusicXML.')
    }
    if (rootName !== 'score-partwise') {
      throw new ScoreImportError('NOT_MUSICXML', 'The selected XML is not a score-partwise MusicXML document.', { detail: rootName })
    }
    rejectExternalResources(document)
    return document
  } catch (cause) {
    if (cause instanceof ScoreImportError) throw cause
    throw new ScoreImportError('INVALID_XML', 'The selected MusicXML document could not be validated.', { detail: cause instanceof Error ? cause.message : undefined }, { cause })
  }
}
