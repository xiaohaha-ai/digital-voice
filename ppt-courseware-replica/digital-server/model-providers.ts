import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import path from 'node:path'
import { storedUploadPath, uploadsDirectory } from './store.js'
import type { PptSlide } from './types.js'

type ProviderMode = 'mock' | 'remote' | 'local' | 'disabled' | 'volcengine'
type WorkerProviderMode = Exclude<ProviderMode, 'volcengine'>
type WorkerCapability = 'voice' | 'avatar' | 'image-background' | 'video-background'
type ArtifactKind = 'audio' | 'video' | 'image'
export type VoiceGender = 'male' | 'female'

export type ProviderStatus = {
  id: string
  label: string
  model: string
  mode: ProviderMode
  location: 'server' | 'gpu-worker' | 'external-api'
  ready: boolean
  message: string
}

export type ModelJobResult = {
  status: 'completed' | 'queued'
  provider: string
  model: string
  filePath?: string
  jobId?: string
  message: string
}

export class ModelProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const validModes = new Set<ProviderMode>(['mock', 'remote', 'local', 'disabled', 'volcengine'])
const workerBaseUrl = process.env.GPU_WORKER_BASE_URL?.replace(/\/$/, '')
const workerToken = process.env.GPU_WORKER_TOKEN
const volcAccessKey = process.env.VOLCENGINE_ACCESS_KEY_ID?.trim()
const volcSecretKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY
const volcPublicUploadBaseUrl = process.env.VOLCENGINE_PUBLIC_UPLOAD_BASE_URL?.replace(/\/$/, '')
const volcVisualHost = 'visual.volcengineapi.com'
const llmBaseUrl = process.env.LLM_BASE_URL?.replace(/\/$/, '')
const llmApiKey = process.env.LLM_API_KEY
const llmModel = process.env.LLM_MODEL?.trim() || 'configured-llm'
const difyApiBaseUrl = process.env.DIFY_API_BASE_URL?.replace(/\/$/, '')
const difyApiKey = process.env.DIFY_API_KEY?.trim()
const difyScriptInputKey = process.env.DIFY_SCRIPT_INPUT_KEY?.trim() || 'topic'
const difyScriptOutputKey = process.env.DIFY_SCRIPT_OUTPUT_KEY?.trim() || 'text'

function configuredMode(name: string, fallback: ProviderMode): ProviderMode {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  if (validModes.has(value as ProviderMode)) return value as ProviderMode
  throw new ModelProviderError(500, `${name} 必须是 mock、remote、local、disabled 或 volcengine`)
}

function workerMode(capability: Exclude<WorkerCapability, 'avatar'>): WorkerProviderMode {
  const environment = capability === 'voice'
    ? 'VOICE_PROVIDER'
    : capability === 'image-background'
      ? 'IMAGE_BACKGROUND_PROVIDER'
      : 'VIDEO_BACKGROUND_PROVIDER'
  const mode = configuredMode(environment, 'mock')
  if (mode === 'volcengine') throw new ModelProviderError(500, `${environment} 不支持 volcengine`)
  return mode
}

function avatarMode(): ProviderMode {
  return configuredMode('AVATAR_PROVIDER', 'mock')
}

function modelName(capability: WorkerCapability) {
  if (capability === 'voice') return 'CosyVoice 3'
  if (capability === 'avatar') return 'MuseTalk 1.5'
  if (capability === 'image-background') return 'BiRefNet'
  return 'Robust Video Matting'
}

function capabilityPath(capability: WorkerCapability) {
  if (capability === 'voice') return '/internal/voice/synthesize'
  if (capability === 'avatar') return '/internal/avatar/generate'
  if (capability === 'image-background') return '/internal/background/image'
  return '/internal/background/video'
}

function authHeaders() {
  return workerToken ? { Authorization: `Bearer ${workerToken}` } : undefined
}

function storedInput(filePath: string, label: string) {
  const localPath = storedUploadPath(filePath)
  if (!localPath) throw new ModelProviderError(400, `${label}必须使用已上传文件`)
  return localPath
}

async function appendStoredFile(form: FormData, field: string, filePath: string, label: string) {
  const localPath = storedInput(filePath, label)
  const bytes = await readFile(localPath).catch(() => undefined)
  if (!bytes) throw new ModelProviderError(400, `${label}不存在，请重新上传`)
  form.append(field, new Blob([bytes]), path.basename(localPath))
}

async function writeArtifact(bytes: Uint8Array, prefix: string, extension: string) {
  const fileName = `${prefix}-${Date.now()}-${randomUUID()}${extension}`
  await writeFile(path.join(uploadsDirectory, fileName), bytes)
  return `/uploads/${fileName}`
}

async function copyMockArtifact(sourcePath: string, prefix: string) {
  const source = storedInput(sourcePath, '输入文件')
  const extension = path.extname(source) || '.bin'
  const fileName = `${prefix}-mock-${Date.now()}-${randomUUID()}${extension}`
  await copyFile(source, path.join(uploadsDirectory, fileName))
  return `/uploads/${fileName}`
}

type WorkerPayload = Record<string, unknown> & {
  status?: unknown
  state?: unknown
  phase?: unknown
  job_id?: unknown
  jobId?: unknown
  output_url?: unknown
  url?: unknown
  audio_url?: unknown
  video_url?: unknown
  image_url?: unknown
  output_base64?: unknown
  audio_base64?: unknown
  video_base64?: unknown
  image_base64?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function tenSecondScript(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) throw new ModelProviderError(502, 'Dify 工作流未返回口播内容')
  const characters = Array.from(normalized)
  if (characters.length <= 60) return normalized

  const excerpt = characters.slice(0, 60)
  let boundary = -1
  for (let index = excerpt.length - 1; index >= 24; index -= 1) {
    if ('。！？；'.includes(excerpt[index])) {
      boundary = index
      break
    }
  }
  return boundary >= 0 ? excerpt.slice(0, boundary + 1).join('') : `${excerpt.join('').trimEnd()}。`
}

export async function generateDifyScript(topic: string) {
  if (!difyApiBaseUrl || !difyApiKey) throw new ModelProviderError(503, 'Dify 工作流尚未配置，请设置 DIFY_API_BASE_URL 和 DIFY_API_KEY')
  const apiBase = difyApiBaseUrl.endsWith('/v1') ? difyApiBaseUrl : `${difyApiBaseUrl}/v1`
  const prompt = [
    `主题：${topic}`,
    '请生成一段适合数字人朗读的中文口播正文。',
    '时长约 10 秒，建议 40 到 55 个汉字。',
    '只输出正文，不要标题、说明、Markdown 或时长标记。',
  ].join('\n')
  const response = await fetch(`${apiBase}/workflows/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${difyApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: { [difyScriptInputKey]: prompt }, response_mode: 'blocking', user: 'digital-person' }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => undefined)
  if (!response) throw new ModelProviderError(503, 'Dify 工作流当前不可连接')

  const payload = await response.json().catch(() => ({})) as { message?: unknown; data?: unknown }
  const data = asRecord(payload.data)
  if (!response.ok || data?.status === 'failed') {
    const message = typeof payload.message === 'string'
      ? payload.message
      : typeof data?.error === 'string'
        ? data.error
        : 'Dify 工作流执行失败'
    throw new ModelProviderError(response.status === 401 || response.status === 403 ? 503 : 502, message)
  }

  const outputs = asRecord(data?.outputs)
  const configuredOutput = outputs?.[difyScriptOutputKey]
  const fallbackOutput = outputs && Object.values(outputs).find((value): value is string => typeof value === 'string')
  const output = typeof configuredOutput === 'string' ? configuredOutput : fallbackOutput
  if (!output) throw new ModelProviderError(502, `Dify 工作流未返回 ${difyScriptOutputKey} 输出变量`)
  return tenSecondScript(output)
}

function stringValue(payload: WorkerPayload, keys: string[]) {
  for (const key of keys) {
    if (typeof payload[key] === 'string') return payload[key] as string
  }
  const nested = asRecord(payload.result)
  if (!nested) return undefined
  for (const key of keys) {
    if (typeof nested[key] === 'string') return nested[key] as string
  }
  return undefined
}

function statusMessage(payload: WorkerPayload) {
  return stringValue(payload, ['message', 'detail']) ?? 'GPU Worker 已接受任务'
}

function extensionFor(kind: ArtifactKind, contentType?: string | null) {
  if (kind === 'audio') {
    if (contentType?.includes('wav')) return '.wav'
    if (contentType?.includes('mp4') || contentType?.includes('m4a')) return '.m4a'
    return '.mp3'
  }
  if (kind === 'video') return '.mp4'
  if (contentType?.includes('jpeg')) return '.jpg'
  return '.png'
}

async function downloadWorkerOutput(url: string, prefix: string, kind: ArtifactKind) {
  let outputUrl: URL
  try {
    outputUrl = new URL(url)
  } catch {
    throw new ModelProviderError(502, 'GPU Worker 返回的产物地址无效')
  }
  if (outputUrl.protocol !== 'http:' && outputUrl.protocol !== 'https:') throw new ModelProviderError(502, 'GPU Worker 返回的产物地址协议无效')
  const response = await fetch(outputUrl, { headers: authHeaders(), signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new ModelProviderError(502, '无法从 GPU Worker 下载生成产物')
  return writeArtifact(Buffer.from(await response.arrayBuffer()), prefix, extensionFor(kind, response.headers.get('content-type')))
}

function publicUploadUrl(filePath: string, label: string) {
  const localPath = storedInput(filePath, label)
  if (!volcPublicUploadBaseUrl) throw new ModelProviderError(503, '缺少 VOLCENGINE_PUBLIC_UPLOAD_BASE_URL，火山引擎无法读取本地上传文件')
  return `${volcPublicUploadBaseUrl}/${encodeURIComponent(path.basename(localPath))}`
}

function requireVolcengineCredentials() {
  if (!volcAccessKey || !volcSecretKey) throw new ModelProviderError(503, '缺少 VOLCENGINE_ACCESS_KEY_ID 或 VOLCENGINE_SECRET_ACCESS_KEY')
  return { accessKey: volcAccessKey, secretKey: volcSecretKey }
}

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function encodeVolcQuery(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function volcTimestamp(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

async function callVolcVisual(action: 'CVSubmitTask' | 'CVGetResult', body: Record<string, unknown>) {
  const { accessKey, secretKey } = requireVolcengineCredentials()
  const payload = JSON.stringify(body)
  const payloadHash = sha256(payload)
  const xDate = volcTimestamp(new Date())
  const date = xDate.slice(0, 8)
  const canonicalQuery = `Action=${encodeVolcQuery(action)}&Version=2022-08-31`
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalHeaders = `content-type:application/json\nhost:${volcVisualHost}\nx-content-sha256:${payloadHash}\nx-date:${xDate}\n`
  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`
  const credentialScope = `${date}/cn-north-1/cv/request`
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${sha256(canonicalRequest)}`
  const signingKey = hmac(hmac(hmac(hmac(secretKey, date), 'cn-north-1'), 'cv'), 'request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  const response = await fetch(`https://${volcVisualHost}/?${canonicalQuery}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Host: volcVisualHost,
      'X-Content-Sha256': payloadHash,
      'X-Date': xDate,
    },
    body: payload,
    signal: AbortSignal.timeout(60_000),
  }).catch(() => undefined)
  if (!response) throw new ModelProviderError(503, '火山引擎 OmniHuman 服务当前不可连接')
  const result = await response.json().catch(() => ({})) as { code?: unknown; message?: unknown; data?: unknown }
  if (!response.ok || result.code !== 10000) {
    const message = typeof result.message === 'string' ? result.message : '火山引擎 OmniHuman 请求失败'
    throw new ModelProviderError(response.status === 401 || response.status === 403 ? 503 : 502, message)
  }
  return result.data
}

async function downloadVolcengineVideo(url: string) {
  let outputUrl: URL
  try {
    outputUrl = new URL(url)
  } catch {
    throw new ModelProviderError(502, '火山引擎返回的视频地址无效')
  }
  if (outputUrl.protocol !== 'https:') throw new ModelProviderError(502, '火山引擎返回的视频地址必须使用 HTTPS')
  const response = await fetch(outputUrl, { signal: AbortSignal.timeout(120_000) }).catch(() => undefined)
  if (!response?.ok) throw new ModelProviderError(502, '无法下载火山引擎生成的 MP4')
  return writeArtifact(Buffer.from(await response.arrayBuffer()), 'omnihuman', '.mp4')
}

async function generateOmniHumanAvatar(input: { portraitPath: string; audioPath: string }): Promise<ModelJobResult> {
  const data = asRecord(await callVolcVisual('CVSubmitTask', {
    req_key: 'jimeng_realman_avatar_picture_omni_v15',
    image_url: publicUploadUrl(input.portraitPath, '人物图片'),
    audio_url: publicUploadUrl(input.audioPath, '配音文件'),
    output_resolution: 720,
    pe_fast_mode: true,
  }))
  const jobId = data && typeof data.task_id === 'string' ? data.task_id : undefined
  if (!jobId) throw new ModelProviderError(502, '火山引擎未返回视频任务 ID')
  return { status: 'queued', provider: 'volcengine-omnihuman', model: 'OmniHuman 1.5', jobId, message: 'OmniHuman 数字人视频任务已提交' } satisfies ModelJobResult
}

async function resolveOmniHumanJob(jobId: string): Promise<ModelJobResult> {
  const data = asRecord(await callVolcVisual('CVGetResult', {
    req_key: 'jimeng_realman_avatar_picture_omni_v15',
    task_id: jobId,
  }))
  const status = data && typeof data.status === 'string' ? data.status : undefined
  if (status === 'done') {
    const videoUrl = data && typeof data.video_url === 'string' ? data.video_url : undefined
    if (!videoUrl) throw new ModelProviderError(502, 'OmniHuman 任务已完成，但未返回 MP4 地址')
    return { status: 'completed', provider: 'volcengine-omnihuman', model: 'OmniHuman 1.5', filePath: await downloadVolcengineVideo(videoUrl), message: 'OmniHuman 口型同步 MP4 已生成' }
  }
  if (status === 'not_found' || status === 'expired') throw new ModelProviderError(502, 'OmniHuman 视频任务不存在或已过期')
  return { status: 'queued', provider: 'volcengine-omnihuman', model: 'OmniHuman 1.5', jobId, message: status === 'generating' ? 'OmniHuman 正在生成口型同步视频' : 'OmniHuman 视频任务排队中' }
}

async function saveWorkerPayload(payload: WorkerPayload, capability: WorkerCapability, kind: ArtifactKind): Promise<ModelJobResult> {
  const provider = 'remote-gpu-worker'
  const model = modelName(capability)
  const prefix = capability.replaceAll('-', '-')
  const jobId = stringValue(payload, ['job_id', 'jobId'])
  const encoded = stringValue(payload, ['output_base64', 'audio_base64', 'video_base64', 'image_base64'])
  if (encoded) {
    return {
      status: 'completed',
      provider,
      model,
      filePath: await writeArtifact(Buffer.from(encoded, 'base64'), prefix, extensionFor(kind)),
      message: statusMessage(payload),
    }
  }

  const outputUrl = stringValue(payload, ['output_url', 'audio_url', 'video_url', 'image_url', 'url'])
  if (outputUrl) {
    return {
      status: 'completed',
      provider,
      model,
      filePath: await downloadWorkerOutput(outputUrl, prefix, kind),
      message: statusMessage(payload),
    }
  }

  if (jobId) return { status: 'queued', provider, model, jobId, message: statusMessage(payload) }
  throw new ModelProviderError(502, `${model} GPU Worker 未返回任务或产物`)
}

async function saveWorkerResponse(response: Response, capability: WorkerCapability, kind: ArtifactKind): Promise<ModelJobResult> {
  const provider = 'remote-gpu-worker'
  const model = modelName(capability)
  const prefix = capability.replaceAll('-', '-')
  const contentType = response.headers.get('content-type')

  if (!contentType?.includes('application/json')) {
    if (!response.ok) throw new ModelProviderError(502, `${model} GPU Worker 请求失败`)
    return {
      status: 'completed',
      provider,
      model,
      filePath: await writeArtifact(Buffer.from(await response.arrayBuffer()), prefix, extensionFor(kind, contentType)),
      message: `${model} 处理完成`,
    }
  }

  const payload = await response.json().catch(() => ({})) as WorkerPayload
  if (!response.ok) throw new ModelProviderError(502, stringValue(payload, ['error', 'message', 'detail']) ?? `${model} GPU Worker 请求失败`)
  try {
    return await saveWorkerPayload(payload, capability, kind)
  } catch (error) {
    if (response.status === 202 && error instanceof ModelProviderError && error.status === 502) {
      return { status: 'queued', provider, model, message: statusMessage(payload) }
    }
    throw error
  }
}

async function runWorker(capability: WorkerCapability, kind: ArtifactKind, form: FormData) {
  if (!workerBaseUrl) throw new ModelProviderError(503, '尚未配置 GPU_WORKER_BASE_URL，无法调用远程模型')
  const response = await fetch(`${workerBaseUrl}${capabilityPath(capability)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(60_000),
  }).catch(() => undefined)
  if (!response) throw new ModelProviderError(503, 'GPU Worker 当前不可连接')
  return saveWorkerResponse(response, capability, kind)
}

export async function getRemoteJob(jobId: string) {
  if (!workerBaseUrl) throw new ModelProviderError(503, '尚未配置 GPU_WORKER_BASE_URL，无法查询远程任务')
  const response = await fetch(`${workerBaseUrl}/internal/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined)
  if (!response) throw new ModelProviderError(503, 'GPU Worker 当前不可连接')
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new ModelProviderError(response.status === 404 ? 404 : 502, typeof payload.message === 'string' ? payload.message : 'GPU Worker 任务查询失败')
  return payload
}

async function resolveWorkerJob(jobId: string, capability: WorkerCapability, kind: ArtifactKind): Promise<ModelJobResult> {
  const payload = await getRemoteJob(jobId) as WorkerPayload
  const state = stringValue(payload, ['status', 'state', 'phase'])?.trim().toLowerCase()
  const failedStates = new Set(['failed', 'error', 'cancelled', 'canceled'])
  const completedStates = new Set(['completed', 'complete', 'succeeded', 'success', 'done'])
  if (state && failedStates.has(state)) throw new ModelProviderError(502, stringValue(payload, ['error', 'message', 'detail']) ?? '数字人视频生成失败')
  if (!state || !completedStates.has(state)) {
    return {
      status: 'queued',
      provider: 'remote-gpu-worker',
      model: modelName(capability),
      jobId,
      message: statusMessage(payload),
    }
  }
  const result = await saveWorkerPayload(payload, capability, kind)
  if (result.status === 'queued') throw new ModelProviderError(502, `${modelName(capability)} 任务已完成，但未返回产物文件`)
  return result
}

export async function resolveAvatarJob(jobId: string, provider?: string): Promise<ModelJobResult> {
  if (provider === 'volcengine-omnihuman') return resolveOmniHumanJob(jobId)
  return resolveWorkerJob(jobId, 'avatar', 'video')
}

export async function resolveVoiceJob(jobId: string): Promise<ModelJobResult> {
  return resolveWorkerJob(jobId, 'voice', 'audio')
}

export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const remoteCapabilities: Exclude<WorkerCapability, 'avatar'>[] = ['voice', 'image-background', 'video-background']
  const needsWorker = remoteCapabilities.some((capability) => workerMode(capability) === 'remote') || avatarMode() === 'remote'
  let workerReady = false
  let workerMessage = '未启用远程 GPU Worker'
  if (needsWorker && workerBaseUrl) {
    const response = await fetch(`${workerBaseUrl}/internal/health`, { headers: authHeaders(), signal: AbortSignal.timeout(5_000) }).catch(() => undefined)
    workerReady = Boolean(response?.ok)
    workerMessage = workerReady ? 'GPU Worker 就绪' : 'GPU Worker 不可连接或健康检查失败'
  } else if (needsWorker) {
    workerMessage = '缺少 GPU_WORKER_BASE_URL'
  }

  const statusFor = (id: WorkerCapability, label: string): ProviderStatus => {
    const mode = id === 'avatar' ? avatarMode() : workerMode(id)
    if (mode === 'volcengine') {
      const ready = Boolean(volcAccessKey && volcSecretKey && volcPublicUploadBaseUrl)
      return {
        id,
        label,
        model: 'OmniHuman 1.5',
        mode,
        location: 'external-api',
        ready,
        message: ready ? '已配置火山引擎 OmniHuman 1.5' : '缺少火山引擎 AK/SK 或公网上传地址',
      }
    }
    if (mode === 'mock') {
      if (id === 'avatar') return { id, label, model: modelName(id), mode, location: 'server', ready: false, message: 'Mock 模式无法生成真实口型同步 MP4，请配置 remote GPU Worker' }
      return { id, label, model: modelName(id), mode, location: 'server', ready: true, message: 'Mock 模式，不执行真实模型推理' }
    }
    if (mode === 'disabled') return { id, label, model: modelName(id), mode, location: 'gpu-worker', ready: false, message: '已禁用' }
    if (mode === 'local') return { id, label, model: modelName(id), mode, location: 'server', ready: false, message: '当前后端不承载 CUDA 模型，请使用 remote GPU Worker' }
    return { id, label, model: modelName(id), mode, location: 'gpu-worker', ready: workerReady, message: workerMessage }
  }

  const pptMode = configuredMode('PPT_PROVIDER', 'local')
  const llmMode = configuredMode('LLM_PROVIDER', 'mock')
  const llmStatus: ProviderStatus = llmMode === 'mock'
    ? { id: 'llm', label: '口播稿生成', model: '可配置 LLM Provider', mode: llmMode, location: 'server', ready: true, message: 'Mock 模式，不调用任何付费 API' }
    : llmMode === 'remote' && llmBaseUrl
      ? { id: 'llm', label: '口播稿生成', model: llmModel, mode: llmMode, location: 'external-api', ready: true, message: '已配置 OpenAI 兼容 LLM Provider' }
      : { id: 'llm', label: '口播稿生成', model: '可配置 LLM Provider', mode: llmMode, location: 'external-api', ready: false, message: llmMode === 'remote' ? '缺少 LLM_BASE_URL' : '当前后端仅支持 mock 或 remote LLM Provider' }
  return [
    { id: 'ppt', label: 'PPT 结构解析', model: '内置 PPTX 解析器（可替换为 python-pptx + LibreOffice）', mode: pptMode, location: 'server', ready: pptMode === 'local', message: pptMode === 'local' ? '当前使用本机解析器' : '等待 Provider 配置' },
    llmStatus,
    statusFor('voice', '声音克隆与配音'),
    statusFor('avatar', '数字人口型视频'),
    statusFor('image-background', '图片背景移除'),
    statusFor('video-background', '视频背景移除'),
  ]
}

export type GeneratedScript = Pick<PptSlide, 'index' | 'summary' | 'script'>

function mockScripts(slides: PptSlide[], tone: string, audience: string) {
  return slides.map((slide) => {
    const source = slide.text.trim().replace(/\s+/g, ' ')
    const summary = source ? source.slice(0, 140) : `${slide.title} 的重点内容`
    return {
      index: slide.index,
      summary,
      script: `下面介绍第 ${slide.index} 页“${slide.title}”。${source || '请结合页面内容进行讲解。'} 面向${audience}，请以${tone}的语气说明本页重点。`,
    }
  })
}

function parseScriptResponse(content: string, slideIndexes: number[]): GeneratedScript[] {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(normalized) as { slides?: unknown }
  if (!Array.isArray(parsed.slides)) throw new ModelProviderError(502, 'LLM 未返回 slides 数组')
  const scripts = parsed.slides.map((value) => {
    const item = asRecord(value)
    if (!item || typeof item.index !== 'number' || typeof item.summary !== 'string' || typeof item.script !== 'string') throw new ModelProviderError(502, 'LLM 返回的口播稿格式无效')
    return { index: item.index, summary: item.summary.trim(), script: item.script.trim() }
  })
  if (scripts.length !== slideIndexes.length || scripts.some((item) => !slideIndexes.includes(item.index) || !item.summary || !item.script)) throw new ModelProviderError(502, 'LLM 返回的页面口播稿不完整')
  return scripts
}

export async function generatePptScripts(input: { slides: PptSlide[]; language?: string; tone?: string; audience?: string; targetDurationSeconds?: number }) {
  const mode = configuredMode('LLM_PROVIDER', 'mock')
  const tone = input.tone || '清晰、自然'
  const audience = input.audience || '学习者'
  if (mode === 'mock') return { provider: 'mock', model: 'template', scripts: mockScripts(input.slides, tone, audience) }
  if (mode !== 'remote' || !llmBaseUrl) throw new ModelProviderError(503, 'LLM Provider 未配置，请使用 mock 或设置 LLM_PROVIDER=remote 和 LLM_BASE_URL')

  const response = await fetch(`${llmBaseUrl}${llmBaseUrl.endsWith('/v1') ? '' : '/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(llmApiKey ? { Authorization: `Bearer ${llmApiKey}` } : {}) },
    body: JSON.stringify({
      model: llmModel,
      temperature: 0.4,
      messages: [
        { role: 'system', content: '你是中文课程口播稿编辑。仅输出 JSON，不要 Markdown。' },
        {
          role: 'user',
          content: JSON.stringify({
            task: '为每张幻灯片生成摘要和可朗读口播稿。',
            language: input.language || 'zh-CN',
            tone,
            audience,
            target_duration_seconds_per_slide: input.targetDurationSeconds,
            response_schema: { slides: [{ index: 1, summary: 'string', script: 'string' }] },
            slides: input.slides.map((slide) => ({ index: slide.index, title: slide.title, text: slide.text, notes: slide.note || '' })),
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => undefined)
  if (!response) throw new ModelProviderError(503, 'LLM Provider 当前不可连接')
  const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: unknown } }
  if (!response.ok) throw new ModelProviderError(502, typeof payload.error?.message === 'string' ? payload.error.message : 'LLM Provider 请求失败')
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new ModelProviderError(502, 'LLM Provider 未返回口播稿')
  return { provider: 'remote-llm', model: llmModel, scripts: parseScriptResponse(content, input.slides.map((slide) => slide.index)) }
}

export async function synthesizeWithCosyVoice(input: { referenceAudioPath: string; text: string; speed?: number; emotion?: string }) {
  const mode = workerMode('voice')
  if (mode === 'disabled' || mode === 'local') throw new ModelProviderError(503, 'CosyVoice 3 未启用，请配置 VOICE_PROVIDER=remote 或使用 mock')
  if (mode === 'mock') {
    return { status: 'completed', provider: 'mock', model: 'CosyVoice 3', filePath: await copyMockArtifact(input.referenceAudioPath, 'cosyvoice'), message: 'Mock 配音已创建，输出为参考音频副本' } satisfies ModelJobResult
  }
  const form = new FormData()
  form.append('text', input.text)
  if (input.speed !== undefined) form.append('speed', String(input.speed))
  if (input.emotion) form.append('emotion', input.emotion)
  await appendStoredFile(form, 'reference_audio', input.referenceAudioPath, '参考音频')
  return runWorker('voice', 'audio', form)
}

export async function synthesizePresetVoice(input: { text: string; gender: VoiceGender }) {
  const mode = workerMode('voice')
  if (mode === 'disabled' || mode === 'local') throw new ModelProviderError(503, 'CosyVoice 3 未启用，请配置 VOICE_PROVIDER=remote')
  if (mode === 'mock') throw new ModelProviderError(503, '当前为 Mock 模式，无法生成男声或女声配音。请配置 VOICE_PROVIDER=remote 和 GPU_WORKER_BASE_URL')
  const form = new FormData()
  form.append('text', input.text)
  form.append('voice_gender', input.gender)
  return runWorker('voice', 'audio', form)
}

export async function generateMuseTalkAvatar(input: { portraitPath: string; audioPath: string }): Promise<ModelJobResult> {
  const mode = avatarMode()
  if (mode === 'volcengine') return generateOmniHumanAvatar(input)
  if (mode === 'disabled' || mode === 'local') throw new ModelProviderError(503, 'MuseTalk 1.5 未启用，请配置 AVATAR_PROVIDER=remote 和 GPU_WORKER_BASE_URL')
  if (mode === 'mock') throw new ModelProviderError(503, '当前为 Mock 模式，无法生成口型同步 MP4。请配置 AVATAR_PROVIDER=remote 和 GPU_WORKER_BASE_URL')
  const form = new FormData()
  await appendStoredFile(form, 'portrait', input.portraitPath, '人物图片')
  await appendStoredFile(form, 'audio', input.audioPath, '配音文件')
  return runWorker('avatar', 'video', form)
}

export async function removeBackground(input: { sourcePath: string; kind: 'image' | 'video'; mode: 'transparent' | 'color' | 'image'; backgroundPath?: string; backgroundColor?: string }) {
  const capability: WorkerCapability = input.kind === 'image' ? 'image-background' : 'video-background'
  const mode = workerMode(capability)
  if (mode === 'disabled' || mode === 'local') throw new ModelProviderError(503, `${modelName(capability)} 未启用，请配置对应 Provider=remote 或使用 mock`)
  if (mode === 'mock') {
    return {
      status: 'completed',
      provider: 'mock',
      model: modelName(capability),
      filePath: await copyMockArtifact(input.sourcePath, capability),
      message: 'Mock 背景处理已完成，输出为原文件副本',
    } satisfies ModelJobResult
  }
  const form = new FormData()
  form.append('mode', input.mode)
  if (input.backgroundColor) form.append('background_color', input.backgroundColor)
  await appendStoredFile(form, 'source', input.sourcePath, input.kind === 'image' ? '图片' : '视频')
  if (input.backgroundPath) await appendStoredFile(form, 'background', input.backgroundPath, '背景图片')
  return runWorker(capability, input.kind, form)
}
