export type CourseStatus = '待合成' | '编辑中' | '已完成'
export type PresenterGroup = '创建的数字人' | '公共数字人'
export type VoiceGroup = '男音' | '女音' | '我的声音'

export type PptFile = {
  id: string
  title: string
  slides: number
  updatedAt: string
  note: boolean
  filePath?: string
}

export type Presenter = {
  id: string
  name: string
  tone: string
  image: string
  group: PresenterGroup
}

export type Voice = {
  id: string
  name: string
  group: VoiceGroup
  detail: string
  filePath?: string
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
