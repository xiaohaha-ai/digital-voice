import type { PageId } from './App'
import { FileAudio, FileStack, MonitorPlay, Sparkles, UsersRound, type LucideIcon } from 'lucide-react'

export const navItems: { id: PageId; label: string; icon: LucideIcon }[] = [
  { id: 'recording', label: '视频生成', icon: Sparkles },
  { id: 'courseware', label: '视频素材', icon: MonitorPlay },
  { id: 'ppt', label: '我的PPT', icon: FileStack },
  { id: 'people', label: '数字人', icon: UsersRound },
  { id: 'audio', label: '数字人音频', icon: FileAudio },
]

export type Presenter = {
  id: string
  name: string
  tone: string
  image: string
  group: '创建的数字人' | '公共数字人'
  portraitPath?: string
  audioPath?: string
  script?: string
  voiceGender?: 'male' | 'female'
  videoPath?: string
  videoStatus?: 'processing' | 'ready' | 'failed'
  videoMessage?: string
  generationJobId?: string
  generationStage?: 'voice' | 'avatar'
  provider?: string
  model?: string
  createdAt?: string
}

export const presenters: Presenter[] = [
  {
    id: 'created-3',
    name: '优秀男教师',
    tone: '沉稳表达',
    group: '创建的数字人',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'created-2',
    name: '知性女教师',
    tone: '自然亲和',
    group: '创建的数字人',
    image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'public-1',
    name: '中年女教师',
    tone: '清晰温和',
    group: '公共数字人',
    image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'public-2',
    name: '卡通女教师',
    tone: '轻松活泼',
    group: '公共数字人',
    image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'public-3',
    name: '卡通教师',
    tone: '课堂讲解',
    group: '公共数字人',
    image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'public-4',
    name: '青年女教师',
    tone: '明快专业',
    group: '公共数字人',
    image: 'https://images.unsplash.com/photo-1598550803260-1b28f4eab6b9?auto=format&fit=crop&w=480&q=84',
  },
  {
    id: 'public-5',
    name: '青年教师',
    tone: '稳重清晰',
    group: '公共数字人',
    image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=480&q=84',
  },
]

export type Course = {
  id: string
  title: string
  slides: number
  duration: string
  status: '待合成' | '编辑中' | '已完成'
  color: string
  presenter: string
}

export const courses: Course[] = [
  { id: 'course-1', title: '有备注', slides: 12, duration: '08:24', status: '待合成', color: '#4e74dd', presenter: '优秀男教师' },
  { id: 'course-2', title: 'kaifatest', slides: 8, duration: '05:16', status: '待合成', color: '#2385a4', presenter: '知性女教师' },
  { id: 'course-3', title: '课程设计基础', slides: 22, duration: '14:40', status: '已完成', color: '#7960c7', presenter: '青年女教师' },
]

export type PptFile = {
  id: string
  title: string
  slides: number
  updatedAt: string
  note: boolean
  filePath?: string
  preview?: PptPreview
}

export type PptSlide = {
  index: number
  title: string
  text: string
  note?: string
}

export type PptPreview = {
  state: '已解析' | '待解析' | '解析失败'
  parsedAt?: string
  error?: string
  slides: PptSlide[]
}

export const pptFiles: PptFile[] = [
  { id: 'ppt-1', title: '有备注', slides: 12, updatedAt: '2026/01/26 10:13', note: true },
  { id: 'ppt-2', title: 'kaifatest', slides: 8, updatedAt: '2026/01/25 18:08', note: false },
  { id: 'ppt-3', title: '课程设计基础', slides: 22, updatedAt: '2026/01/24 14:31', note: true },
]

export type Voice = {
  id: string
  name: string
  group: '男音' | '女音' | '我的声音'
  detail: string
  filePath?: string
  clonedFromId?: string
  consentRecordedAt?: string
}

export const voices: Voice[] = [
  { id: 'voice-1', name: '台味大叔', group: '男音', detail: '公共音频 · AI生成' },
  { id: 'voice-2', name: '亲切伯伯', group: '男音', detail: '公共音频 · AI生成' },
  { id: 'voice-3', name: '新闻男主播', group: '男音', detail: '公共音频 · AI生成' },
  { id: 'voice-4', name: '温柔俊彦', group: '男音', detail: '公共音频 · AI生成' },
  { id: 'voice-5', name: '知心姐姐', group: '女音', detail: '公共音频 · AI生成' },
  { id: 'voice-6', name: '娱乐播报', group: '女音', detail: '公共音频 · AI生成' },
  { id: 'voice-7', name: '温柔气泡音', group: '女音', detail: '公共音频 · AI生成' },
  { id: 'voice-8', name: '播音主持', group: '女音', detail: '公共音频 · AI生成' },
]
