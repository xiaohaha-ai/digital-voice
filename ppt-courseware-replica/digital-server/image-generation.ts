import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storedUploadPath, uploadsDirectory } from './store.js'

type ImageApiResponse = {
  data?: Array<{ b64_json?: unknown; url?: unknown }>
  error?: { message?: unknown }
}

export class ImageGenerationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function imageApiUrl(pathname: string) {
  const base = process.env.OPENAI_BASE_URL?.replace(/\/$/, '')
  const key = process.env.OPENAI_API_KEY
  if (!base || !key) throw new ImageGenerationError(503, '图像生成服务尚未配置')
  const apiBase = base.endsWith('/v1') ? base : `${base}/v1`
  return { url: `${apiBase}${pathname}`, key }
}

function imageMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function generationPrompt(prompt: string, hasReferenceImage: boolean) {
  const referenceInstruction = hasReferenceImage
    ? 'Preserve the uploaded person\'s recognizable facial identity, age range, and general appearance.'
    : 'Create an original person without resembling a real public figure.'
  return [
    'Use case: photorealistic-natural.',
    'Asset type: a motion-ready digital teacher portrait for AI course narration.',
    `Primary request: ${prompt}`,
    'Subject: a single professional educator, front-facing, approachable and confident.',
    'Composition/framing: vertical half-body portrait, centered, hands relaxed, clean separation from the background.',
    'Lighting/mood: soft studio lighting, calm and clear.',
    'Constraints: suitable for a digital presenter avatar, no text, no watermark, no extra people.',
    referenceInstruction,
  ].join('\n')
}

function apiErrorMessage(payload: ImageApiResponse) {
  return typeof payload.error?.message === 'string' ? payload.error.message : '图像生成服务暂时不可用'
}

async function generateImage(prompt: string, referenceImagePath?: string) {
  const { url, key } = imageApiUrl(referenceImagePath ? '/images/edits' : '/images/generations')
  const finalPrompt = generationPrompt(prompt, Boolean(referenceImagePath))

  if (!referenceImagePath) {
    return fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt: finalPrompt, size: '1024x1536', quality: 'medium' }),
    })
  }

  const referencePath = storedUploadPath(referenceImagePath)
  if (!referencePath) throw new ImageGenerationError(400, '参考照片必须先上传到本服务')
  const input = await readFile(referencePath).catch(() => undefined)
  if (!input) throw new ImageGenerationError(400, '参考照片不存在，请重新上传')
  const form = new FormData()
  form.append('model', 'gpt-image-2')
  form.append('prompt', finalPrompt)
  form.append('size', '1024x1536')
  form.append('quality', 'medium')
  form.append('image', new Blob([input], { type: imageMimeType(referencePath) }), path.basename(referencePath))
  return fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
}

export async function createDigitalPersonImage(prompt: string, referenceImagePath?: string) {
  const response = await generateImage(prompt, referenceImagePath)
  const payload = await response.json().catch(() => ({})) as ImageApiResponse
  if (!response.ok) throw new ImageGenerationError(502, apiErrorMessage(payload))

  const result = payload.data?.[0]
  if (typeof result?.url === 'string') return result.url
  if (typeof result?.b64_json !== 'string') throw new ImageGenerationError(502, '图像生成服务未返回有效图片')

  const fileName = `digital-person-${Date.now()}-${randomUUID()}.png`
  await writeFile(path.join(uploadsDirectory, fileName), Buffer.from(result.b64_json, 'base64'))
  return `/uploads/${fileName}`
}
