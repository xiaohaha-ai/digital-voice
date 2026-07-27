import cors from 'cors'
import express, { type RequestHandler } from 'express'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ensureStore, readStore, removeStoredUpload, storedUploadPath, updateStore, uploadsDirectory } from './store.js'
import { createDigitalPersonImage, ImageGenerationError } from './image-generation.js'
import { generateDifyScript, generateMuseTalkAvatar, generatePptScripts, getProviderStatuses, getRemoteJob, ModelProviderError, removeBackground, resolveAvatarJob, resolveVoiceJob, synthesizePresetVoice, synthesizeWithCosyVoice, type VoiceGender } from './model-providers.js'
import { parsePptx, PptParseError } from './ppt-parser.js'
import { cloneVoiceFromReference, VoiceCloneError } from './voice-cloning.js'
import type { Course, CourseStatus, PptFile, Presenter, Voice } from './types.js'

const app = express()
const port = Number(process.env.PORT ?? 8787)
const colorOptions = ['#2f86cc', '#506edb', '#7960c7', '#2385a4']
const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

class UploadTypeError extends ApiError {
  constructor(message: string) {
    super(415, message)
  }
}

type UploadRule = {
  extensions: readonly string[]
  maxSize: number
  label: string
}

// Multer receives non-ASCII multipart filenames as Latin-1 in some browsers.
function uploadedFilename(originalName: string) {
  if (!/[\u0080-\u00ff]/.test(originalName)) return originalName
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8')
  return decoded.includes('\ufffd') ? originalName : decoded
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDirectory),
  filename: (_request, file, callback) => {
    const safeName = uploadedFilename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')
    callback(null, `${Date.now()}-${randomUUID()}-${safeName}`)
  },
})
const uploadFor = ({ extensions, maxSize, label }: UploadRule) => multer({
  storage,
  limits: { fileSize: maxSize, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    if (!extensions.includes(extension)) return callback(new UploadTypeError(`仅支持${label}文件`))
    callback(null, true)
  },
})

const uploadPpt = uploadFor({ extensions: ['.ppt', '.pptx'], maxSize: 500 * 1024 * 1024, label: 'PPT/PPTX' })
const uploadImage = uploadFor({ extensions: ['.jpg', '.jpeg', '.png'], maxSize: 10 * 1024 * 1024, label: 'JPG/PNG' })
const uploadAudio = uploadFor({ extensions: ['.mp3', '.wav', '.m4a'], maxSize: 100 * 1024 * 1024, label: 'MP3/WAV/M4A' })

app.disable('x-powered-by')
app.use((request, response, next) => {
  const startedAt = Date.now()
  response.on('finish', () => {
    const durationMs = Date.now() - startedAt
    console.log(`[request] ${request.method} ${request.path} ${response.statusCode} ${durationMs}ms`)
  })
  next()
})
app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(uploadsDirectory))

const asyncRoute = (handler: (request: express.Request, response: express.Response) => Promise<unknown>): RequestHandler => {
  return (request, response, next) => { void handler(request, response).catch(next) }
}

const invalid = (response: express.Response, message: string) => response.status(400).json({ message })
const now = () => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date()).replaceAll('/', '/')
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const bodyOf = (request: express.Request): Record<string, unknown> => {
  if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) throw new ApiError(400, '请求体必须是 JSON 对象')
  return request.body as Record<string, unknown>
}
const text = (value: unknown, label: string, maxLength = 120) => {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${label}不能为空`)
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new ApiError(400, `${label}不能超过 ${maxLength} 个字符`)
  return normalized
}
const optionalText = (body: Record<string, unknown>, key: string, label: string, maxLength = 120) => hasOwn(body, key) ? text(body[key], label, maxLength) : undefined
const optionalId = (body: Record<string, unknown>) => {
  if (!hasOwn(body, 'id')) return undefined
  const id = text(body.id, 'ID', 128)
  if (!identifierPattern.test(id)) throw new ApiError(400, 'ID格式无效')
  return id
}
const optionalPositiveInteger = (body: Record<string, unknown>, key: string, label: string, defaultValue?: number) => {
  if (!hasOwn(body, key)) return defaultValue
  const value = body[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 10000) throw new ApiError(400, `${label}必须是 1 到 10000 的整数`)
  return value
}
const optionalBoolean = (body: Record<string, unknown>, key: string) => {
  if (!hasOwn(body, key)) return undefined
  if (typeof body[key] !== 'boolean') throw new ApiError(400, '备注标记必须是布尔值')
  return body[key]
}
const voiceGender = (value: unknown): VoiceGender => {
  if (value === 'male' || value === 'female') return value
  throw new ApiError(400, '音色必须选择男声或女声')
}
const optionalColor = (body: Record<string, unknown>) => {
  if (!hasOwn(body, 'color')) return undefined
  if (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color)) throw new ApiError(400, '课程颜色格式无效')
  return body.color.toLowerCase()
}
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? '' : value ?? ''
const uniqueId = (id: string, items: { id: string }[], label: string) => {
  if (items.some((item) => item.id === id)) throw new ApiError(409, `${label}已存在`)
}
const cleanupFailedUpload = async (filePath: string | undefined) => { await removeStoredUpload(filePath) }
const isPng = (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
const isJpeg = (bytes: Buffer) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
async function validateImageUpload(file: Express.Multer.File) {
  const bytes = await readFile(file.path).catch(() => Buffer.alloc(0))
  if (isPng(bytes) || isJpeg(bytes)) return
  await cleanupFailedUpload(`/uploads/${file.filename}`)
  throw new UploadTypeError('上传文件不是有效的 JPG 或 PNG 图片')
}

async function parseStoredPpt(id: string, force = false) {
  let parsingError: Error | undefined
  const ppt = await updateStore(async (store) => {
    const ppt = store.ppts.find((item) => item.id === id)
    if (!ppt) throw new ApiError(404, 'PPT 不存在')
    if (!force && ppt.preview?.state === '已解析') return ppt
    const filePath = ppt.filePath ? storedUploadPath(ppt.filePath) : undefined
    if (!filePath) throw new ApiError(422, '此 PPT 没有可解析的本地文件')
    try {
      const preview = await parsePptx(filePath)
      ppt.preview = preview
      ppt.slides = preview.slides.length
      ppt.note = preview.slides.some((slide) => Boolean(slide.note))
      ppt.updatedAt = now()
      return ppt
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PPT 解析失败'
      ppt.preview = { state: '解析失败', error: message, slides: [] }
      ppt.updatedAt = now()
      parsingError = error instanceof Error ? error : new PptParseError(message)
      return ppt
    }
  })
  if (parsingError) throw parsingError
  return ppt
}

app.get('/api/health', (_request, response) => response.json({ ok: true }))
app.get('/api/providers/status', asyncRoute(async (_request, response) => response.json({ providers: await getProviderStatuses() })))
app.post('/api/dify/scripts/generate', asyncRoute(async (request, response) => {
  const topic = text(bodyOf(request).topic, '口播主题', 240)
  response.json({ text: await generateDifyScript(topic) })
}))
app.get('/api/jobs/:id', asyncRoute(async (request, response) => {
  const jobId = routeId(request.params.id)
  if (!identifierPattern.test(jobId)) return invalid(response, '任务 ID 格式无效')
  response.json(await getRemoteJob(jobId))
}))
app.get('/api/bootstrap', asyncRoute(async (_request, response) => response.json(await readStore())))

app.get('/api/ppts', asyncRoute(async (_request, response) => response.json((await readStore()).ppts)))
app.post('/api/ppts', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const ppt: PptFile = { id: optionalId(body) ?? randomUUID(), title: text(body.title, 'PPT名称'), slides: optionalPositiveInteger(body, 'slides', 'PPT页数', 1)!, updatedAt: now(), note: optionalBoolean(body, 'note') ?? false }
  await updateStore((store) => {
    uniqueId(ppt.id, store.ppts, 'PPT')
    store.ppts.unshift(ppt)
  })
  response.status(200).json(ppt)
}))
app.get('/api/ppts/:id', asyncRoute(async (request, response) => {
  const ppt = (await readStore()).ppts.find((item) => item.id === request.params.id)
  if (!ppt) return response.status(404).json({ message: 'PPT 不存在' })
  response.json(ppt)
}))
app.patch('/api/ppts/:id', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const title = optionalText(body, 'title', 'PPT名称')
  const slides = optionalPositiveInteger(body, 'slides', 'PPT页数')
  const note = optionalBoolean(body, 'note')
  if (title === undefined && slides === undefined && note === undefined) return invalid(response, '请提供需要更新的PPT字段')
  const ppt = await updateStore((store) => {
    const item = store.ppts.find((candidate) => candidate.id === request.params.id)
    if (!item) throw new ApiError(404, 'PPT 不存在')
    if (title !== undefined) item.title = title
    if (slides !== undefined) item.slides = slides
    if (note !== undefined) item.note = note
    item.updatedAt = now()
    return item
  })
  response.json(ppt)
}))
app.post('/api/uploads/ppt', uploadPpt.single('file'), asyncRoute(async (request, response) => {
  if (!request.file) return invalid(response, '请选择 PPT 文件')
  const title = path.parse(uploadedFilename(request.file.originalname)).name
  const filePath = `/uploads/${request.file.filename}`
  const localPath = storedUploadPath(filePath)
  if (!localPath) throw new ApiError(500, '上传文件保存失败')
  let preview
  try {
    preview = await parsePptx(localPath)
  } catch (error) {
    await cleanupFailedUpload(filePath)
    throw error
  }
  const ppt: PptFile = { id: randomUUID(), title, slides: preview.slides.length, updatedAt: now(), note: preview.slides.some((slide) => Boolean(slide.note)), filePath, preview }
  try {
    await updateStore((store) => store.ppts.unshift(ppt))
  } catch (error) {
    await cleanupFailedUpload(ppt.filePath)
    throw error
  }
  response.status(200).json(ppt)
}))
app.get('/api/ppts/:id/preview', asyncRoute(async (request, response) => {
  const ppt = await parseStoredPpt(routeId(request.params.id))
  response.status(200).json({ id: ppt.id, title: ppt.title, filePath: ppt.filePath, preview: ppt.preview })
}))
app.post('/api/ppts/:id/parse', asyncRoute(async (request, response) => {
  const ppt = await parseStoredPpt(routeId(request.params.id), true)
  response.status(200).json(ppt)
}))
app.post('/api/ppts/:id/scripts/generate', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const pptId = routeId(request.params.id)
  const ppt = await parseStoredPpt(pptId)
  if (!ppt.preview?.slides.length) throw new ApiError(422, 'PPT 没有可用于生成口播稿的页面内容')
  const duration = hasOwn(body, 'targetDurationSeconds') ? body.targetDurationSeconds : undefined
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration < 5 || duration > 600)) return invalid(response, '目标时长必须是 5 到 600 秒')
  const result = await generatePptScripts({
    slides: ppt.preview.slides,
    language: hasOwn(body, 'language') ? text(body.language, '语言', 32) : undefined,
    tone: hasOwn(body, 'tone') ? text(body.tone, '语气', 80) : undefined,
    audience: hasOwn(body, 'audience') ? text(body.audience, '受众', 80) : undefined,
    targetDurationSeconds: duration as number | undefined,
  })
  const scriptByIndex = new Map(result.scripts.map((script) => [script.index, script]))
  const updated = await updateStore((store) => {
    const item = store.ppts.find((candidate) => candidate.id === pptId)
    if (!item?.preview) throw new ApiError(404, 'PPT 不存在')
    item.preview.slides = item.preview.slides.map((slide) => ({ ...slide, ...scriptByIndex.get(slide.index) }))
    item.updatedAt = now()
    return item
  })
  response.status(200).json({ id: updated.id, provider: result.provider, model: result.model, slides: updated.preview?.slides ?? [] })
}))
app.delete('/api/ppts/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.ppts.findIndex((ppt) => ppt.id === request.params.id)
    if (index < 0) throw new ApiError(404, 'PPT 不存在')
    return store.ppts.splice(index, 1)[0]
  })
  await removeStoredUpload(removed.filePath)
  response.status(200).json({ id: removed.id, deleted: true })
}))

app.get('/api/courses', asyncRoute(async (_request, response) => response.json((await readStore()).courses)))
app.post('/api/courses', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const title = text(body.title, '课程名称')
  const presenter = text(body.presenter, '数字人名称')
  const id = optionalId(body) ?? randomUUID()
  const slides = optionalPositiveInteger(body, 'slides', '课程页数', 1)!
  const color = optionalColor(body)
  const course = await updateStore((store) => {
    uniqueId(id, store.courses, '课程')
    if (!store.people.some((person) => person.name === presenter)) throw new ApiError(400, '选择的数字人不存在')
    const item: Course = { id, title, presenter, slides, duration: '待生成', status: '编辑中', color: color ?? colorOptions[store.courses.length % colorOptions.length] }
    store.courses.unshift(item)
    return item
  })
  response.status(200).json(course)
}))
app.get('/api/courses/:id', asyncRoute(async (request, response) => {
  const course = (await readStore()).courses.find((item) => item.id === request.params.id)
  if (!course) return response.status(404).json({ message: '课程不存在' })
  response.json(course)
}))
app.patch('/api/courses/:id', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const title = optionalText(body, 'title', '课程名称')
  const status = hasOwn(body, 'status') ? body.status : undefined
  if (status !== undefined && (typeof status !== 'string' || !(['待合成', '编辑中', '已完成'] as CourseStatus[]).includes(status as CourseStatus))) return invalid(response, '课程状态无效')
  if (title === undefined && status === undefined) return invalid(response, '请提供需要更新的课程字段')
  const course = await updateStore((store) => {
    const item = store.courses.find((candidate) => candidate.id === request.params.id)
    if (!item) throw new ApiError(404, '课程不存在')
    if (title !== undefined) item.title = title
    if (status !== undefined) item.status = status as CourseStatus
    return item
  })
  response.json(course)
}))
app.delete('/api/courses/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.courses.findIndex((course) => course.id === request.params.id)
    if (index < 0) throw new ApiError(404, '课程不存在')
    return store.courses.splice(index, 1)[0]
  })
  response.status(200).json({ id: removed.id, deleted: true })
}))

app.get('/api/people', asyncRoute(async (_request, response) => response.json((await readStore()).people)))
app.post('/api/people', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const person: Presenter = { id: optionalId(body) ?? randomUUID(), name: text(body.name, '数字人名称'), tone: optionalText(body, 'tone', '数字人类型', 80) ?? '图片生成', image: optionalText(body, 'image', '数字人图片', 2048) ?? '', group: '创建的数字人' }
  await updateStore((store) => {
    uniqueId(person.id, store.people, '数字人')
    store.people.unshift(person)
  })
  response.status(200).json(person)
}))
app.get('/api/people/:id', asyncRoute(async (request, response) => {
  const person = (await readStore()).people.find((item) => item.id === request.params.id)
  if (!person) return response.status(404).json({ message: '数字人不存在' })
  response.json(person)
}))
app.patch('/api/people/:id', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const name = optionalText(body, 'name', '数字人名称')
  const tone = optionalText(body, 'tone', '数字人类型', 80)
  const image = optionalText(body, 'image', '数字人图片', 2048)
  if (name === undefined && tone === undefined && image === undefined) return invalid(response, '请提供需要更新的数字人字段')
  const person = await updateStore((store) => {
    const item = store.people.find((candidate) => candidate.id === request.params.id)
    if (!item) throw new ApiError(404, '数字人不存在')
    if (name !== undefined) item.name = name
    if (tone !== undefined) item.tone = tone
    if (image !== undefined) item.image = image
    return item
  })
  response.json(person)
}))
app.post('/api/uploads/image', uploadImage.single('file'), asyncRoute(async (request, response) => {
  if (!request.file) return invalid(response, '请选择图片文件')
  await validateImageUpload(request.file)
  response.status(200).json({ filePath: `/uploads/${request.file.filename}`, originalName: uploadedFilename(request.file.originalname) })
}))
app.post('/api/uploads/avatar-audio', uploadAudio.single('file'), asyncRoute(async (request, response) => {
  if (!request.file) return invalid(response, '请选择音频文件')
  response.status(200).json({ filePath: `/uploads/${request.file.filename}`, originalName: uploadedFilename(request.file.originalname) })
}))
app.post('/api/digital-people/generate', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const name = text(body.name, '数字人名称')
  const prompt = text(body.prompt, '生成提示词', 800)
  const referenceImage = hasOwn(body, 'referenceImage') ? text(body.referenceImage, '参考照片路径', 512) : undefined
  if (referenceImage && !referenceImage.startsWith('/uploads/')) return invalid(response, '参考照片必须使用已上传文件')
  const image = await createDigitalPersonImage(prompt, referenceImage)
  const person: Presenter = { id: randomUUID(), name, tone: 'AI动态形象', image, group: '创建的数字人' }
  try {
    await updateStore((store) => {
      uniqueId(person.id, store.people, '数字人')
      store.people.unshift(person)
    })
  } catch (error) {
    await removeStoredUpload(image)
    throw error
  }
  response.status(200).json(person)
}))
app.post('/api/digital-people/avatar', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  if (body.consent !== true) return invalid(response, '请确认你拥有该人物肖像和音频的使用授权')
  const name = text(body.name, '数字人名称')
  const portraitPath = text(body.portraitPath, '人物图片路径', 512)
  const audioPath = text(body.audioPath, '配音文件路径', 512)
  if (!portraitPath.startsWith('/uploads/') || !audioPath.startsWith('/uploads/')) return invalid(response, '人物图片和配音必须使用已上传文件')

  const result = await generateMuseTalkAvatar({ portraitPath, audioPath })
  if (result.status === 'completed' && !result.filePath) throw new ApiError(502, '数字人视频 Provider 未返回 MP4 文件')
  if (result.status === 'queued' && !result.jobId) throw new ApiError(502, '数字人视频 Provider 未返回可查询的任务 ID')
  const person: Presenter = {
    id: randomUUID(),
    name,
    tone: '口型同步视频',
    image: portraitPath,
    portraitPath,
    audioPath,
    videoPath: result.filePath,
    videoStatus: result.status === 'completed' ? 'ready' : 'processing',
    videoMessage: result.message,
    generationJobId: result.jobId,
    provider: result.provider,
    model: result.model,
    createdAt: now(),
    group: '创建的数字人',
  }
  await updateStore((store) => {
    uniqueId(person.id, store.people, '数字人')
    store.people.unshift(person)
  })
  response.status(result.status === 'queued' ? 202 : 201).json(person)
}))
app.post('/api/digital-people/text-avatar', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  if (body.consent !== true) return invalid(response, '请确认你拥有该人物肖像和生成内容的使用授权')
  const name = text(body.name, '数字人名称')
  const portraitPath = text(body.portraitPath, '人物图片路径', 512)
  const script = text(body.text, '口播内容', 8_000)
  const selectedVoiceGender = voiceGender(body.voiceGender)
  if (!portraitPath.startsWith('/uploads/')) return invalid(response, '人物图片必须使用已上传文件')

  const voiceResult = await synthesizePresetVoice({ text: script, gender: selectedVoiceGender })
  if (voiceResult.status === 'queued') {
    if (!voiceResult.jobId) throw new ApiError(502, '语音 Provider 未返回可查询的任务 ID')
    const person: Presenter = {
      id: randomUUID(),
      name,
      tone: selectedVoiceGender === 'male' ? '男声口型同步视频' : '女声口型同步视频',
      image: portraitPath,
      portraitPath,
      script,
      voiceGender: selectedVoiceGender,
      videoStatus: 'processing',
      videoMessage: voiceResult.message,
      generationJobId: voiceResult.jobId,
      generationStage: 'voice',
      provider: voiceResult.provider,
      model: voiceResult.model,
      createdAt: now(),
      group: '创建的数字人',
    }
    await updateStore((store) => {
      uniqueId(person.id, store.people, '数字人')
      store.people.unshift(person)
    })
    return response.status(202).json(person)
  }
  if (!voiceResult.filePath) throw new ApiError(502, '语音 Provider 未返回音频文件')

  const avatarResult = await generateMuseTalkAvatar({ portraitPath, audioPath: voiceResult.filePath })
  if (avatarResult.status === 'queued' && !avatarResult.jobId) throw new ApiError(502, '数字人视频 Provider 未返回可查询的任务 ID')
  if (avatarResult.status === 'completed' && !avatarResult.filePath) throw new ApiError(502, '数字人视频 Provider 未返回 MP4 文件')
  const person: Presenter = {
    id: randomUUID(),
    name,
    tone: selectedVoiceGender === 'male' ? '男声口型同步视频' : '女声口型同步视频',
    image: portraitPath,
    portraitPath,
    audioPath: voiceResult.filePath,
    script,
    voiceGender: selectedVoiceGender,
    videoPath: avatarResult.filePath,
    videoStatus: avatarResult.status === 'completed' ? 'ready' : 'processing',
    videoMessage: avatarResult.message,
    generationJobId: avatarResult.jobId,
    generationStage: avatarResult.status === 'queued' ? 'avatar' : undefined,
    provider: avatarResult.provider,
    model: avatarResult.model,
    createdAt: now(),
    group: '创建的数字人',
  }
  await updateStore((store) => {
    uniqueId(person.id, store.people, '数字人')
    store.people.unshift(person)
  })
  response.status(avatarResult.status === 'queued' ? 202 : 201).json(person)
}))
app.get('/api/people/:id/video-status', asyncRoute(async (request, response) => {
  const id = routeId(request.params.id)
  const current = (await readStore()).people.find((person) => person.id === id)
  if (!current) return response.status(404).json({ message: '数字人不存在' })
  if (current.videoStatus !== 'processing' || !current.generationJobId) return response.json(current)

  try {
    if (current.generationStage === 'voice') {
      const voiceResult = await resolveVoiceJob(current.generationJobId)
      if (voiceResult.status === 'queued') {
        const pending = await updateStore((store) => {
          const person = store.people.find((item) => item.id === id)
          if (!person) throw new ApiError(404, '数字人不存在')
          person.videoMessage = voiceResult.message
          return person
        })
        return response.json(pending)
      }
      if (!voiceResult.filePath || !current.portraitPath) throw new ApiError(502, '语音 Provider 未返回音频文件')
      const avatarResult = await generateMuseTalkAvatar({ portraitPath: current.portraitPath, audioPath: voiceResult.filePath })
      if (avatarResult.status === 'queued' && !avatarResult.jobId) throw new ApiError(502, '数字人视频 Provider 未返回可查询的任务 ID')
      if (avatarResult.status === 'completed' && !avatarResult.filePath) throw new ApiError(502, '数字人视频 Provider 未返回 MP4 文件')
      const transitioned = await updateStore((store) => {
        const person = store.people.find((item) => item.id === id)
        if (!person) throw new ApiError(404, '数字人不存在')
        person.audioPath = voiceResult.filePath
        person.videoPath = avatarResult.filePath
        person.videoStatus = avatarResult.status === 'completed' ? 'ready' : 'processing'
        person.videoMessage = avatarResult.message
        person.generationJobId = avatarResult.jobId
        person.generationStage = avatarResult.status === 'queued' ? 'avatar' : undefined
        person.provider = avatarResult.provider
        person.model = avatarResult.model
        if (avatarResult.status === 'completed') delete person.generationJobId
        return person
      })
      return response.json(transitioned)
    }
    const result = await resolveAvatarJob(current.generationJobId, current.provider)
    if (result.status === 'queued') {
      const pending = await updateStore((store) => {
        const person = store.people.find((item) => item.id === id)
        if (!person) throw new ApiError(404, '数字人不存在')
        person.videoMessage = result.message
        return person
      })
      return response.json(pending)
    }
    if (!result.filePath) throw new ApiError(502, '数字人视频 Provider 未返回 MP4 文件')
    const ready = await updateStore((store) => {
      const person = store.people.find((item) => item.id === id)
      if (!person) throw new ApiError(404, '数字人不存在')
      person.videoPath = result.filePath
      person.videoStatus = 'ready'
      person.videoMessage = result.message
      person.provider = result.provider
      person.model = result.model
      delete person.generationJobId
      delete person.generationStage
      return person
    })
    response.json(ready)
  } catch (error) {
    if (!(error instanceof ModelProviderError) || error.status === 503) throw error
    const failed = await updateStore((store) => {
      const person = store.people.find((item) => item.id === id)
      if (!person) throw new ApiError(404, '数字人不存在')
      person.videoStatus = 'failed'
      person.videoMessage = error.message
      delete person.generationJobId
      delete person.generationStage
      return person
    })
    response.json(failed)
  }
}))
app.delete('/api/people/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.people.findIndex((person) => person.id === request.params.id)
    if (index < 0) throw new ApiError(404, '数字人不存在')
    return store.people.splice(index, 1)[0]
  })
  await Promise.all([...new Set([removed.image, removed.portraitPath, removed.audioPath, removed.videoPath])].map((filePath) => removeStoredUpload(filePath)))
  response.status(200).json({ id: removed.id, deleted: true })
}))

app.get('/api/voices', asyncRoute(async (_request, response) => response.json((await readStore()).voices)))
app.post('/api/voices', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const voice: Voice = { id: optionalId(body) ?? randomUUID(), name: text(body.name, '声音名称'), group: '我的声音', detail: optionalText(body, 'detail', '声音描述', 160) ?? '已上传音频 · 本地文件' }
  await updateStore((store) => {
    uniqueId(voice.id, store.voices, '声音')
    store.voices.unshift(voice)
  })
  response.status(200).json(voice)
}))
app.get('/api/voices/:id', asyncRoute(async (request, response) => {
  const voice = (await readStore()).voices.find((item) => item.id === request.params.id)
  if (!voice) return response.status(404).json({ message: '声音不存在' })
  response.json(voice)
}))
app.patch('/api/voices/:id', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const name = optionalText(body, 'name', '声音名称')
  const detail = optionalText(body, 'detail', '声音描述', 160)
  if (name === undefined && detail === undefined) return invalid(response, '请提供需要更新的声音字段')
  const voice = await updateStore((store) => {
    const item = store.voices.find((candidate) => candidate.id === request.params.id)
    if (!item) throw new ApiError(404, '声音不存在')
    if (name !== undefined) item.name = name
    if (detail !== undefined) item.detail = detail
    return item
  })
  response.json(voice)
}))
app.post('/api/voices/:id/clone', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const name = text(body.name, '克隆声音名称')
  if (body.consent !== true) return invalid(response, '请确认你拥有该声音的克隆授权')
  const reference = (await readStore()).voices.find((voice) => voice.id === request.params.id)
  if (!reference) return response.status(404).json({ message: '声音不存在' })
  if (reference.group !== '我的声音' || !reference.filePath) return invalid(response, '仅支持使用本人上传的声音作为克隆参考')
  const filePath = await cloneVoiceFromReference(reference.filePath, name)
  const voice: Voice = { id: randomUUID(), name, group: '我的声音', detail: '音频克隆 · 已授权', filePath, clonedFromId: reference.id, consentRecordedAt: now() }
  try {
    await updateStore((store) => {
      uniqueId(voice.id, store.voices, '声音')
      store.voices.unshift(voice)
    })
  } catch (error) {
    await cleanupFailedUpload(filePath)
    throw error
  }
  response.status(200).json(voice)
}))
app.post('/api/voices/:id/synthesize', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  if (body.consent !== true) return invalid(response, '请确认你拥有该声音的使用授权')
  const reference = (await readStore()).voices.find((voice) => voice.id === request.params.id)
  if (!reference) return response.status(404).json({ message: '声音不存在' })
  if (reference.group !== '我的声音' || !reference.filePath) return invalid(response, '仅支持使用本人上传的声音作为配音参考')
  const speed = hasOwn(body, 'speed') ? body.speed : undefined
  if (speed !== undefined && (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.5 || speed > 2)) return invalid(response, '语速必须在 0.5 到 2 之间')
  const result = await synthesizeWithCosyVoice({
    referenceAudioPath: reference.filePath,
    text: text(body.text, '配音文本', 8_000),
    speed: speed as number | undefined,
    emotion: hasOwn(body, 'emotion') ? text(body.emotion, '情绪', 40) : undefined,
  })
  if (result.status === 'queued') return response.status(202).json(result)
  if (!result.filePath) throw new ApiError(502, '声音 Provider 未返回音频文件')
  const voice: Voice = { id: randomUUID(), name: `${reference.name} · 配音`, group: '我的声音', detail: `${result.model} · ${result.provider}`, filePath: result.filePath, clonedFromId: reference.id, consentRecordedAt: now() }
  await updateStore((store) => store.voices.unshift(voice))
  response.status(201).json({ ...result, voice })
}))
app.post('/api/uploads/audio', uploadAudio.single('file'), asyncRoute(async (request, response) => {
  if (!request.file) return invalid(response, '请选择音频文件')
  const voice: Voice = { id: randomUUID(), name: path.parse(uploadedFilename(request.file.originalname)).name, group: '我的声音', detail: '已上传音频 · 本地文件', filePath: `/uploads/${request.file.filename}` }
  try {
    await updateStore((store) => store.voices.unshift(voice))
  } catch (error) {
    await cleanupFailedUpload(voice.filePath)
    throw error
  }
  response.status(200).json(voice)
}))
app.post('/api/avatars/generate', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  if (body.consent !== true) return invalid(response, '请确认你拥有该人物肖像的使用授权')
  const portraitPath = text(body.portraitPath, '人物图片路径', 512)
  const audioPath = text(body.audioPath, '配音文件路径', 512)
  if (!portraitPath.startsWith('/uploads/') || !audioPath.startsWith('/uploads/')) return invalid(response, '人物图片和配音必须使用已上传文件')
  const result = await generateMuseTalkAvatar({ portraitPath, audioPath })
  response.status(result.status === 'queued' ? 202 : 201).json(result)
}))
app.post('/api/backgrounds/remove', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const sourcePath = text(body.sourcePath, '输入文件路径', 512)
  const kind = body.kind
  const mode = body.mode
  if (kind !== 'image' && kind !== 'video') return invalid(response, 'kind 必须是 image 或 video')
  if (mode !== 'transparent' && mode !== 'color' && mode !== 'image') return invalid(response, 'mode 必须是 transparent、color 或 image')
  if (!sourcePath.startsWith('/uploads/')) return invalid(response, '输入文件必须使用已上传文件')
  const backgroundPath = hasOwn(body, 'backgroundPath') ? text(body.backgroundPath, '背景图片路径', 512) : undefined
  if (backgroundPath && !backgroundPath.startsWith('/uploads/')) return invalid(response, '背景图片必须使用已上传文件')
  const backgroundColor = hasOwn(body, 'backgroundColor') ? text(body.backgroundColor, '背景颜色', 7) : undefined
  if (mode === 'color' && !backgroundColor) return invalid(response, '纯色背景需要提供 backgroundColor')
  if (backgroundColor && !/^#[0-9a-fA-F]{6}$/.test(backgroundColor)) return invalid(response, '背景颜色必须是 #RRGGBB 格式')
  const result = await removeBackground({ sourcePath, kind, mode, backgroundPath, backgroundColor })
  response.status(result.status === 'queued' ? 202 : 201).json(result)
}))
app.delete('/api/voices/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.voices.findIndex((voice) => voice.id === request.params.id)
    if (index < 0) throw new ApiError(404, '声音不存在')
    return store.voices.splice(index, 1)[0]
  })
  await removeStoredUpload(removed.filePath)
  response.status(200).json({ id: removed.id, deleted: true })
}))

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ApiError) return response.status(error.status).json({ message: error.message })
  if (error instanceof ImageGenerationError) return response.status(error.status).json({ message: error.message })
  if (error instanceof ModelProviderError) return response.status(error.status).json({ message: error.message })
  if (error instanceof PptParseError) return response.status(422).json({ message: error.message })
  if (error instanceof VoiceCloneError) return response.status(error.status).json({ message: error.message })
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ message: '上传文件超过大小限制' })
  if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ message: '请求体不是有效的 JSON' })
  console.error(error)
  response.status(500).json({ message: '服务暂时不可用' })
})

await ensureStore()
app.listen(port, '127.0.0.1', () => console.log(`API server listening at http://127.0.0.1:${port}`))
