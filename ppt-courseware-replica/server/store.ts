import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Course, PptFile, Presenter, Store, Voice } from './types.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
export const dataDirectory = path.join(serverDirectory, 'data')
export const uploadsDirectory = path.join(serverDirectory, 'uploads')
const storePath = path.join(dataDirectory, 'store.json')
let mutationQueue: Promise<void> = Promise.resolve()

const starterStore: Store = {
  ppts: [
    { id: 'ppt-1', title: '有备注', slides: 12, updatedAt: '2026/01/26 10:13', note: true },
    { id: 'ppt-2', title: 'kaifatest', slides: 8, updatedAt: '2026/01/25 18:08', note: false },
    { id: 'ppt-3', title: '课程设计基础', slides: 22, updatedAt: '2026/01/24 14:31', note: true },
  ],
  people: [
    { id: 'created-3', name: '优秀男教师', tone: '沉稳表达', group: '创建的数字人', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=480&q=84' },
    { id: 'created-2', name: '知性女教师', tone: '自然亲和', group: '创建的数字人', image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=480&q=84' },
    { id: 'public-1', name: '中年女教师', tone: '清晰温和', group: '公共数字人', image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=480&q=84' },
    { id: 'public-2', name: '卡通女教师', tone: '轻松活泼', group: '公共数字人', image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=480&q=84' },
    { id: 'public-3', name: '卡通教师', tone: '课堂讲解', group: '公共数字人', image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=480&q=84' },
    { id: 'public-4', name: '青年女教师', tone: '明快专业', group: '公共数字人', image: 'https://images.unsplash.com/photo-1598550803260-1b28f4eab6b9?auto=format&fit=crop&w=480&q=84' },
    { id: 'public-5', name: '青年教师', tone: '稳重清晰', group: '公共数字人', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=480&q=84' },
  ],
  voices: [
    { id: 'voice-1', name: '台味大叔', group: '男音', detail: '公共音频 · AI生成' },
    { id: 'voice-2', name: '亲切伯伯', group: '男音', detail: '公共音频 · AI生成' },
    { id: 'voice-3', name: '新闻男主播', group: '男音', detail: '公共音频 · AI生成' },
    { id: 'voice-4', name: '温柔俊彦', group: '男音', detail: '公共音频 · AI生成' },
    { id: 'voice-5', name: '知心姐姐', group: '女音', detail: '公共音频 · AI生成' },
    { id: 'voice-6', name: '娱乐播报', group: '女音', detail: '公共音频 · AI生成' },
    { id: 'voice-7', name: '温柔气泡音', group: '女音', detail: '公共音频 · AI生成' },
    { id: 'voice-8', name: '播音主持', group: '女音', detail: '公共音频 · AI生成' },
  ],
  courses: [
    { id: 'course-1', title: '有备注', slides: 12, duration: '08:24', status: '待合成', color: '#4e74dd', presenter: '优秀男教师' },
    { id: 'course-2', title: 'kaifatest', slides: 8, duration: '05:16', status: '待合成', color: '#2385a4', presenter: '知性女教师' },
    { id: 'course-3', title: '课程设计基础', slides: 22, duration: '14:40', status: '已完成', color: '#7960c7', presenter: '青年女教师' },
  ],
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isPpt = (value: unknown): value is PptFile => isRecord(value)
  && isString(value.id)
  && isString(value.title)
  && Number.isSafeInteger(value.slides)
  && isString(value.updatedAt)
  && typeof value.note === 'boolean'
  && (value.filePath === undefined || isString(value.filePath))
const isPresenter = (value: unknown): value is Presenter => isRecord(value)
  && isString(value.id)
  && isString(value.name)
  && isString(value.tone)
  && isString(value.image)
  && (value.group === '创建的数字人' || value.group === '公共数字人')
const isVoice = (value: unknown): value is Voice => isRecord(value)
  && isString(value.id)
  && isString(value.name)
  && isString(value.detail)
  && (value.group === '男音' || value.group === '女音' || value.group === '我的声音')
  && (value.filePath === undefined || isString(value.filePath))
const isCourse = (value: unknown): value is Course => isRecord(value)
  && isString(value.id)
  && isString(value.title)
  && Number.isSafeInteger(value.slides)
  && isString(value.duration)
  && (value.status === '待合成' || value.status === '编辑中' || value.status === '已完成')
  && isString(value.color)
  && isString(value.presenter)
const isStore = (value: unknown): value is Store => isRecord(value)
  && Array.isArray(value.ppts) && value.ppts.every(isPpt)
  && Array.isArray(value.people) && value.people.every(isPresenter)
  && Array.isArray(value.voices) && value.voices.every(isVoice)
  && Array.isArray(value.courses) && value.courses.every(isCourse)

function repairMultipartFilename(value: string) {
  if (!/[\u0080-\u00ff]/.test(value)) return value
  const repaired = Buffer.from(value, 'latin1').toString('utf8')
  return repaired.includes('\ufffd') ? value : repaired
}

function repairStoredUploadNames(store: Store) {
  let changed = false
  for (const ppt of store.ppts) {
    if (!ppt.filePath) continue
    const repaired = repairMultipartFilename(ppt.title)
    if (repaired !== ppt.title) {
      ppt.title = repaired
      changed = true
    }
  }
  for (const voice of store.voices) {
    if (!voice.filePath) continue
    const repaired = repairMultipartFilename(voice.name)
    if (repaired !== voice.name) {
      voice.name = repaired
      changed = true
    }
  }
  return changed
}

async function loadStore(): Promise<Store> {
  const parsed: unknown = JSON.parse(await readFile(storePath, 'utf8'))
  if (!isStore(parsed)) throw new Error('持久化数据格式无效')
  return parsed
}

export async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true })
  await mkdir(uploadsDirectory, { recursive: true })
  try {
    const store = await loadStore()
    if (repairStoredUploadNames(store)) await writeStore(store)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await writeStore(starterStore)
  }
}

export async function readStore(): Promise<Store> {
  await ensureStore()
  return loadStore()
}

export async function writeStore(store: Store) {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), 'utf8')
    await rename(temporaryPath, storePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

// Keep each read-modify-write operation in process order so requests cannot overwrite one another.
export async function updateStore<T>(mutate: (store: Store) => T | Promise<T>): Promise<T> {
  let result: T
  const operation = mutationQueue.then(async () => {
    const store = await readStore()
    result = await mutate(store)
    await writeStore(store)
  })
  mutationQueue = operation.catch(() => undefined)
  await operation
  return result!
}

export async function removeStoredUpload(filePath?: string) {
  if (!filePath?.startsWith('/uploads/')) return
  const fileName = path.basename(filePath)
  await unlink(path.join(uploadsDirectory, fileName)).catch(() => undefined)
}
