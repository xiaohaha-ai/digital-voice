import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { storedUploadPath, uploadsDirectory } from './store.js'

type CloneProviderResponse = {
  audioUrl?: unknown
  audioBase64?: unknown
  error?: { message?: unknown }
}

export class VoiceCloneError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function audioMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === '.wav') return 'audio/wav'
  if (extension === '.m4a') return 'audio/mp4'
  return 'audio/mpeg'
}

function outputExtension(contentType: string | null) {
  if (contentType?.includes('wav')) return '.wav'
  if (contentType?.includes('mp4') || contentType?.includes('m4a')) return '.m4a'
  return '.mp3'
}

function providerErrorMessage(payload: CloneProviderResponse) {
  return typeof payload.error?.message === 'string' ? payload.error.message : '音频克隆服务暂时不可用'
}

export async function cloneVoiceFromReference(referenceFilePath: string, name: string) {
  const endpoint = process.env.VOICE_CLONE_API_URL
  if (!endpoint) throw new VoiceCloneError(503, '音频克隆服务尚未配置')

  const sourcePath = storedUploadPath(referenceFilePath)
  if (!sourcePath) throw new VoiceCloneError(400, '克隆参考音频必须来自已上传文件')
  const source = await readFile(sourcePath).catch(() => undefined)
  if (!source) throw new VoiceCloneError(400, '克隆参考音频不存在，请重新上传')

  const form = new FormData()
  form.append('name', name)
  form.append('audio', new Blob([source], { type: audioMimeType(sourcePath) }), path.basename(sourcePath))
  const key = process.env.VOICE_CLONE_API_KEY
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    body: form,
  })

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const payload = await response.json().catch(() => ({})) as CloneProviderResponse
    if (!response.ok) throw new VoiceCloneError(502, providerErrorMessage(payload))
    if (typeof payload.audioUrl === 'string') return payload.audioUrl
    if (typeof payload.audioBase64 === 'string') {
      const fileName = `voice-clone-${Date.now()}-${randomUUID()}.mp3`
      await writeFile(path.join(uploadsDirectory, fileName), Buffer.from(payload.audioBase64, 'base64'))
      return `/uploads/${fileName}`
    }
    throw new VoiceCloneError(502, '音频克隆服务未返回有效音频')
  }

  if (!response.ok) throw new VoiceCloneError(502, '音频克隆服务暂时不可用')
  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length) throw new VoiceCloneError(502, '音频克隆服务未返回有效音频')
  const fileName = `voice-clone-${Date.now()}-${randomUUID()}${outputExtension(contentType)}`
  await writeFile(path.join(uploadsDirectory, fileName), audio)
  return `/uploads/${fileName}`
}
