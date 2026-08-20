import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { loadMusicXmlFile, MAX_SOURCE_FILE_BYTES } from '../fileLoader'
import type { ScoreFileLike } from '../types'
import { basicMelodyFixture } from './fixtures'

function fileLike(name: string, data: string | Uint8Array): ScoreFileLike {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return {
    name,
    size: bytes.byteLength,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }
}

async function mxlFile(container: string | null, entries: Record<string, string>): Promise<ScoreFileLike> {
  const zip = new JSZip()
  if (container !== null) zip.file('META-INF/container.xml', container)
  for (const [path, value] of Object.entries(entries)) zip.file(path, value)
  return fileLike('test.mxl', await zip.generateAsync({ type: 'uint8array' }))
}

const validContainer = `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="scores/main.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`

describe('MusicXML file loader', () => {
  it('loads and validates plain .musicxml files', async () => {
    const result = await loadMusicXmlFile(fileLike('melody.musicxml', basicMelodyFixture))
    expect(result).toMatchObject({ fileName: 'melody.musicxml', sourceFormat: 'musicxml' })
    expect(result.musicXmlText).toBe(basicMelodyFixture)
  })

  it('loads the declared score root from META-INF/container.xml', async () => {
    const file = await mxlFile(validContainer, { 'scores/main.musicxml': basicMelodyFixture, 'readme.xml': '<readme/>' })
    const result = await loadMusicXmlFile(file)
    expect(result.sourceFormat).toBe('mxl')
    expect(result.musicXmlText).toBe(basicMelodyFixture)
  })

  it('uses a conservative unambiguous fallback when the container is missing', async () => {
    const file = await mxlFile(null, { 'main.musicxml': basicMelodyFixture })
    await expect(loadMusicXmlFile(file)).resolves.toMatchObject({ sourceFormat: 'mxl', musicXmlText: basicMelodyFixture })
  })

  it('uses the same conservative fallback when the container is malformed', async () => {
    const file = await mxlFile('<container><rootfiles>', { 'main.musicxml': basicMelodyFixture })
    await expect(loadMusicXmlFile(file)).resolves.toMatchObject({ sourceFormat: 'mxl', musicXmlText: basicMelodyFixture })
  })

  it('rejects ambiguous fallback candidates', async () => {
    const file = await mxlFile(null, { 'one.musicxml': basicMelodyFixture, 'two.xml': basicMelodyFixture })
    await expect(loadMusicXmlFile(file)).rejects.toMatchObject({ code: 'AMBIGUOUS_MXL_ROOT' })
  })

  it('rejects malformed archives and unsupported extensions with typed codes', async () => {
    await expect(loadMusicXmlFile(fileLike('broken.mxl', 'not a zip'))).rejects.toMatchObject({ code: 'INVALID_MXL' })
    await expect(loadMusicXmlFile(fileLike('score.pdf', 'data'))).rejects.toMatchObject({ code: 'UNSUPPORTED_EXTENSION' })
  })

  it('rejects empty and unsafe XML documents', async () => {
    await expect(loadMusicXmlFile(fileLike('empty.xml', ''))).rejects.toMatchObject({ code: 'EMPTY_FILE' })
    await expect(loadMusicXmlFile(fileLike('linked.xml', '<score-partwise><credit><credit-image source="https://example.test/image.png"/></credit></score-partwise>'))).rejects.toMatchObject({ code: 'EXTERNAL_RESOURCE_NOT_ALLOWED' })
  })

  it('rejects oversized sources before reading their content', async () => {
    const unreadableLargeFile: ScoreFileLike = {
      name: 'large.musicxml',
      size: MAX_SOURCE_FILE_BYTES + 1,
      text: async () => { throw new Error('must not read') },
      arrayBuffer: async () => { throw new Error('must not read') },
    }
    await expect(loadMusicXmlFile(unreadableLargeFile)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })
})
