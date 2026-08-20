import JSZip, { type JSZipObject } from 'jszip'
import { ScoreImportError, asScoreImportError } from './errors'
import type { LoadedMusicXml, ScoreFileLike, ScoreSourceFormat } from './types'
import { descendantsNamed, parseMusicXmlDocument, parseXmlDocument } from './xml'

export const MAX_SOURCE_FILE_BYTES = 15 * 1024 * 1024
export const MAX_MUSIC_XML_BYTES = 20 * 1024 * 1024

function sourceFormat(fileName: string): ScoreSourceFormat {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'musicxml' || extension === 'xml' || extension === 'mxl') return extension
  throw new ScoreImportError('UNSUPPORTED_EXTENSION', 'Choose a .musicxml, .xml, or .mxl score.', { fileName })
}

function xmlByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function validateXmlSize(xmlText: string, fileName: string): number {
  const bytes = xmlByteLength(xmlText)
  if (bytes === 0 || !xmlText.trim()) throw new ScoreImportError('EMPTY_FILE', 'The selected score is empty.', { fileName })
  if (bytes > MAX_MUSIC_XML_BYTES) {
    throw new ScoreImportError('UNCOMPRESSED_FILE_TOO_LARGE', `The uncompressed MusicXML exceeds the ${MAX_MUSIC_XML_BYTES / 1024 / 1024} MB safety limit.`, { fileName })
  }
  parseMusicXmlDocument(xmlText)
  return bytes
}

function safeArchivePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').some((segment) => segment === '..')) {
    throw new ScoreImportError('INVALID_MXL', 'The MXL container references an unsafe score path.', { detail: path })
  }
  return normalized
}

function findCaseInsensitive(zip: JSZip, path: string): JSZipObject | null {
  const match = Object.keys(zip.files).find((name) => name.toLowerCase() === path.toLowerCase())
  return match ? zip.file(match) : null
}

function fallbackScoreEntry(zip: JSZip): JSZipObject {
  const candidates = Object.values(zip.files).filter((entry) => {
    const name = entry.name.toLowerCase()
    return !entry.dir && !name.startsWith('__macosx/') && name !== 'meta-inf/container.xml' && (name.endsWith('.musicxml') || name.endsWith('.xml'))
  })
  if (candidates.length === 0) throw new ScoreImportError('MISSING_MXL_ROOT', 'The MXL archive does not contain a MusicXML score document.')
  if (candidates.length > 1) throw new ScoreImportError('AMBIGUOUS_MXL_ROOT', 'The MXL archive has no usable container declaration and contains multiple possible score documents.')
  return candidates[0]!
}

async function loadMxl(buffer: ArrayBuffer, fileName: string): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
  } catch (cause) {
    throw new ScoreImportError('INVALID_MXL', 'The selected MXL file is not a readable ZIP archive.', { fileName }, { cause })
  }

  let scoreEntry: JSZipObject | null = null
  const containerEntry = findCaseInsensitive(zip, 'META-INF/container.xml')
  if (containerEntry) {
    try {
      const containerText = await containerEntry.async('string')
      const containerDocument = parseXmlDocument(containerText)
      const rootFiles = descendantsNamed(containerDocument, 'rootfile')
        .map((root) => root.getAttribute('full-path'))
        .filter((path): path is string => Boolean(path?.trim()))
      if (rootFiles.length === 1) scoreEntry = findCaseInsensitive(zip, safeArchivePath(rootFiles[0]!))
      else if (rootFiles.length > 1) {
        const musicXmlRoots = rootFiles.filter((path) => /\.(musicxml|xml)$/i.test(path))
        if (musicXmlRoots.length === 1) scoreEntry = findCaseInsensitive(zip, safeArchivePath(musicXmlRoots[0]!))
        else throw new ScoreImportError('AMBIGUOUS_MXL_ROOT', 'The MXL container declares multiple score roots without one unambiguous MusicXML document.', { fileName })
      }
    } catch (cause) {
      if (cause instanceof ScoreImportError && cause.code !== 'INVALID_XML') throw cause
      scoreEntry = null
    }
  }

  if (!scoreEntry) scoreEntry = fallbackScoreEntry(zip)
  try {
    return await scoreEntry.async('string')
  } catch (cause) {
    throw new ScoreImportError('INVALID_MXL', 'The score document inside the MXL archive could not be decompressed.', { fileName, detail: scoreEntry.name }, { cause })
  }
}

export async function loadMusicXmlFile(file: ScoreFileLike): Promise<LoadedMusicXml> {
  const format = sourceFormat(file.name)
  if (file.size === 0) throw new ScoreImportError('EMPTY_FILE', 'The selected score is empty.', { fileName: file.name })
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new ScoreImportError('FILE_TOO_LARGE', `The selected file exceeds the ${MAX_SOURCE_FILE_BYTES / 1024 / 1024} MB source-file safety limit.`, { fileName: file.name })
  }

  try {
    const musicXmlText = format === 'mxl' ? await loadMxl(await file.arrayBuffer(), file.name) : await file.text()
    const uncompressedBytes = validateXmlSize(musicXmlText, file.name)
    return { fileName: file.name, sourceFormat: format, musicXmlText, sourceBytes: file.size, uncompressedBytes }
  } catch (cause) {
    const error = asScoreImportError(cause)
    if (error.context.fileName) throw error
    throw new ScoreImportError(error.code, error.message, { ...error.context, fileName: file.name }, { cause: error })
  }
}
