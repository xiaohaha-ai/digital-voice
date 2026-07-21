export type CourseStatus = '待合成' | '编辑中' | '已完成'
export type PresenterGroup = '创建的数字人' | '公共数字人'
export type VoiceGroup = '男音' | '女音' | '我的声音'
export type PptParseState = '已解析' | '待解析' | '解析失败'
export type AvatarVideoStatus = 'processing' | 'ready' | 'failed'

export type PptSlide = {
  index: number
  title: string
  text: string
  note?: string
  summary?: string
  script?: string
}

export type PptPreview = {
  state: PptParseState
  parsedAt?: string
  error?: string
  slides: PptSlide[]
}

export type PptFile = {
  id: string
  title: string
  slides: number
  updatedAt: string
  note: boolean
  filePath?: string
  preview?: PptPreview
}

export type Presenter = {
  id: string
  name: string
  tone: string
  image: string
  group: PresenterGroup
  portraitPath?: string
  audioPath?: string
  videoPath?: string
  videoStatus?: AvatarVideoStatus
  videoMessage?: string
  generationJobId?: string
  provider?: string
  model?: string
  createdAt?: string
}

export type Voice = {
  id: string
  name: string
  group: VoiceGroup
  detail: string
  filePath?: string
  clonedFromId?: string
  consentRecordedAt?: string
}

export type Course = {
  id: string
  title: string
  slides: number
  duration: string
  status: CourseStatus
  color: string
  presenter: string
}

export type Store = {
  ppts: PptFile[]
  people: Presenter[]
  voices: Voice[]
  courses: Course[]
}
