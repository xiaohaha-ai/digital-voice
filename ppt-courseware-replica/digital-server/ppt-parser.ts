import { readFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import type { PptPreview, PptSlide } from './types.js'

const maxSlides = 500
const maxSlideTextLength = 20000

export class PptParseError extends Error {
  constructor(message: string) {
    super(message)
  }
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(x[\da-fA-F]+|\d+);/g, (_match, code: string) => {
      const value = code.startsWith('x') ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)
      return Number.isSafeInteger(value) ? String.fromCodePoint(value) : ''
    })
}

function textRuns(xml: string) {
  return Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g))
    .map((match) => decodeXml(match[1]).trim())
    .filter(Boolean)
}

function slideIndex(name: string) {
  const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(name)
  return match ? Number.parseInt(match[1], 10) : undefined
}

function parsedAt() {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date())
}

export async function parsePptx(filePath: string): Promise<PptPreview> {
  if (path.extname(filePath).toLowerCase() !== '.pptx') throw new PptParseError('暂仅支持解析 PPTX 文件，请将旧版 PPT 转换为 PPTX 后再上传')

  const source = await readFile(filePath).catch(() => undefined)
  if (!source) throw new PptParseError('PPT 文件不存在，请重新上传')

  let archive: JSZip
  try {
    archive = await JSZip.loadAsync(source)
  } catch {
    throw new PptParseError('PPTX 文件无法解析，请确认文件没有损坏')
  }

  const entries = Object.keys(archive.files)
    .map((name) => ({ name, index: slideIndex(name) }))
    .filter((entry): entry is { name: string; index: number } => entry.index !== undefined)
    .sort((left, right) => left.index - right.index)

  if (!entries.length) throw new PptParseError('文件中未找到可解析的幻灯片')
  if (entries.length > maxSlides) throw new PptParseError(`单个 PPTX 最多支持 ${maxSlides} 页幻灯片`)

  const slides: PptSlide[] = []
  for (const entry of entries) {
    const xml = await archive.file(entry.name)?.async('string')
    if (!xml) continue
    const text = textRuns(xml).join('\n').slice(0, maxSlideTextLength)
    const noteXml = await archive.file(`ppt/notesSlides/notesSlide${entry.index}.xml`)?.async('string')
    const note = noteXml ? textRuns(noteXml).join('\n').slice(0, maxSlideTextLength) : undefined
    slides.push({ index: entry.index, title: text.split('\n').find(Boolean) ?? `第 ${entry.index} 页`, text, ...(note ? { note } : {}) })
  }

  return { state: '已解析', parsedAt: parsedAt(), slides }
}
