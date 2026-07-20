import cors from 'cors'
import express, { type RequestHandler } from 'express'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ensureStore, readStore, removeStoredUpload, updateStore, uploadsDirectory } from './store.js'
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
const optionalColor = (body: Record<string, unknown>) => {
  if (!hasOwn(body, 'color')) return undefined
  if (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color)) throw new ApiError(400, '课程颜色格式无效')
  return body.color.toLowerCase()
}
const uniqueId = (id: string, items: { id: string }[], label: string) => {
  if (items.some((item) => item.id === id)) throw new ApiError(409, `${label}已存在`)
}
const cleanupFailedUpload = async (filePath: string | undefined) => { await removeStoredUpload(filePath) }

app.get('/api/health', (_request, response) => response.json({ ok: true }))
app.get('/api/bootstrap', asyncRoute(async (_request, response) => response.json(await readStore())))

app.get('/api/ppts', asyncRoute(async (_request, response) => response.json((await readStore()).ppts)))
app.post('/api/ppts', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const ppt: PptFile = { id: optionalId(body) ?? randomUUID(), title: text(body.title, 'PPT名称'), slides: optionalPositiveInteger(body, 'slides', 'PPT页数', 1)!, updatedAt: now(), note: optionalBoolean(body, 'note') ?? false }
  await updateStore((store) => {
    uniqueId(ppt.id, store.ppts, 'PPT')
    store.ppts.unshift(ppt)
  })
  response.status(201).json(ppt)
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
  const ppt: PptFile = { id: randomUUID(), title, slides: 1, updatedAt: now(), note: false, filePath: `/uploads/${request.file.filename}` }
  try {
    await updateStore((store) => store.ppts.unshift(ppt))
  } catch (error) {
    await cleanupFailedUpload(ppt.filePath)
    throw error
  }
  response.status(201).json(ppt)
}))
app.delete('/api/ppts/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.ppts.findIndex((ppt) => ppt.id === request.params.id)
    if (index < 0) throw new ApiError(404, 'PPT 不存在')
    return store.ppts.splice(index, 1)[0]
  })
  await removeStoredUpload(removed.filePath)
  response.status(204).end()
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
  response.status(201).json(course)
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
  await updateStore((store) => {
    const index = store.courses.findIndex((course) => course.id === request.params.id)
    if (index < 0) throw new ApiError(404, '课程不存在')
    store.courses.splice(index, 1)
  })
  response.status(204).end()
}))

app.get('/api/people', asyncRoute(async (_request, response) => response.json((await readStore()).people)))
app.post('/api/people', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const person: Presenter = { id: optionalId(body) ?? randomUUID(), name: text(body.name, '数字人名称'), tone: optionalText(body, 'tone', '数字人类型', 80) ?? '图片生成', image: optionalText(body, 'image', '数字人图片', 2048) ?? '', group: '创建的数字人' }
  await updateStore((store) => {
    uniqueId(person.id, store.people, '数字人')
    store.people.unshift(person)
  })
  response.status(201).json(person)
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
  response.status(201).json({ filePath: `/uploads/${request.file.filename}`, originalName: uploadedFilename(request.file.originalname) })
}))
app.delete('/api/people/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.people.findIndex((person) => person.id === request.params.id)
    if (index < 0) throw new ApiError(404, '数字人不存在')
    return store.people.splice(index, 1)[0]
  })
  await removeStoredUpload(removed.image)
  response.status(204).end()
}))

app.get('/api/voices', asyncRoute(async (_request, response) => response.json((await readStore()).voices)))
app.post('/api/voices', asyncRoute(async (request, response) => {
  const body = bodyOf(request)
  const voice: Voice = { id: optionalId(body) ?? randomUUID(), name: text(body.name, '声音名称'), group: '我的声音', detail: optionalText(body, 'detail', '声音描述', 160) ?? '已上传音频 · 本地文件' }
  await updateStore((store) => {
    uniqueId(voice.id, store.voices, '声音')
    store.voices.unshift(voice)
  })
  response.status(201).json(voice)
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
app.post('/api/uploads/audio', uploadAudio.single('file'), asyncRoute(async (request, response) => {
  if (!request.file) return invalid(response, '请选择音频文件')
  const voice: Voice = { id: randomUUID(), name: path.parse(uploadedFilename(request.file.originalname)).name, group: '我的声音', detail: '已上传音频 · 本地文件', filePath: `/uploads/${request.file.filename}` }
  try {
    await updateStore((store) => store.voices.unshift(voice))
  } catch (error) {
    await cleanupFailedUpload(voice.filePath)
    throw error
  }
  response.status(201).json(voice)
}))
app.delete('/api/voices/:id', asyncRoute(async (request, response) => {
  const removed = await updateStore((store) => {
    const index = store.voices.findIndex((voice) => voice.id === request.params.id)
    if (index < 0) throw new ApiError(404, '声音不存在')
    return store.voices.splice(index, 1)[0]
  })
  await removeStoredUpload(removed.filePath)
  response.status(204).end()
}))

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ApiError) return response.status(error.status).json({ message: error.message })
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ message: '上传文件超过大小限制' })
  if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ message: '请求体不是有效的 JSON' })
  console.error(error)
  response.status(500).json({ message: '服务暂时不可用' })
})

await ensureStore()
app.listen(port, '127.0.0.1', () => console.log(`API server listening at http://127.0.0.1:${port}`))
