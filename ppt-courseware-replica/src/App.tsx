import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api } from './api'
import { Sidebar } from './components'
import { courses, navItems, pptFiles, presenters, voices, type Course, type PptFile, type Presenter, type Voice } from './data'
import { AudioLibraryPage, CoursewarePage, DigitalPeoplePage, PptLibraryPage, RecordingPage } from './pages'

export type PageId = 'recording' | 'courseware' | 'ppt' | 'people' | 'audio'

const pageFromHash = (): PageId => {
  const match = window.location.hash.replace('#/', '') as PageId
  return navItems.some((item) => item.id === match) ? match : 'recording'
}

function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key)
      return saved ? JSON.parse(saved) as T : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

function App() {
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [courseList, setCourseList] = usePersistentState<Course[]>('ppt-courseware:courses', courses)
  const [pptList, setPptList] = usePersistentState<PptFile[]>('ppt-courseware:ppts', pptFiles)
  const [people, setPeople] = usePersistentState<Presenter[]>('ppt-courseware:people', presenters)
  const [voiceList, setVoiceList] = usePersistentState<Voice[]>('ppt-courseware:voices', voices)

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    let active = true
    void api.bootstrap().then((data) => {
      if (!active) return
      setCourseList(data.courses)
      setPptList(data.ppts)
      setPeople(data.people)
      setVoiceList(data.voices)
    }).catch(() => undefined)
    return () => { active = false }
  }, [setCourseList, setPeople, setPptList, setVoiceList])

  const navigate = (id: PageId) => {
    window.location.hash = `/${id}`
  }

  const addPpt = (title: string) => {
    const ppt = { id: crypto.randomUUID(), title, slides: 1, updatedAt: '刚刚上传', note: false }
    setPptList((current) => [ppt, ...current])
    void api.createPpt(ppt).catch(() => undefined)
    return ppt
  }

  const uploadPpt = async (file: File) => {
    try {
      const ppt = await api.uploadPpt(file)
      setPptList((current) => [ppt, ...current.filter((item) => item.id !== ppt.id)])
      return ppt
    } catch {
      return addPpt(file.name.replace(/\.(ppt|pptx)$/i, ''))
    }
  }

  const addCourse = ({ title, presenter, slides }: Pick<Course, 'title' | 'presenter' | 'slides'>) => {
    const course: Course = { id: crypto.randomUUID(), title, presenter, slides, duration: '待生成', status: '编辑中', color: '#2f86cc' }
    setCourseList((current) => [course, ...current])
    void api.createCourse(course).catch(() => undefined)
    navigate('courseware')
  }

  const createPersonFromPhoto = async (file: File) => {
    const uploaded = await api.uploadImage(file)
    const person = await api.createPerson({ id: crypto.randomUUID(), name: file.name.replace(/\.(png|jpe?g)$/i, ''), tone: '照片创建', image: uploaded.filePath, group: '创建的数字人' })
    setPeople((current) => [person, ...current.filter((item) => item.id !== person.id)])
    return person
  }

  const generateAvatarVideo = async (input: { name: string; portraitPath: string; audioPath: string; consent: boolean }) => {
    const person = await api.generateAvatarVideo(input)
    setPeople((current) => [person, ...current.filter((item) => item.id !== person.id)])
    return person
  }

  const generateTextAvatarVideo = async (input: { name: string; portraitPath: string; text: string; voiceGender: 'male' | 'female'; consent: boolean }) => {
    const person = await api.generateTextAvatarVideo(input)
    setPeople((current) => [person, ...current.filter((item) => item.id !== person.id)])
    return person
  }

  const generateDifyScript = async (topic: string) => (await api.generateDifyScript(topic)).text

  const uploadImage = async (file: File) => {
    const uploaded = await api.uploadImage(file)
    return uploaded.filePath
  }

  const uploadAvatarAudio = async (file: File) => {
    const uploaded = await api.uploadAvatarAudio(file)
    return uploaded.filePath
  }

  const refreshAvatarVideo = useCallback(async (id: string) => {
    const person = await api.getAvatarVideoStatus(id)
    setPeople((current) => current.map((item) => item.id === person.id ? person : item))
    return person
  }, [setPeople])

  const uploadVoice = async (file: File) => {
    try {
      const voice = await api.uploadVoice(file)
      setVoiceList((current) => [voice, ...current.filter((item) => item.id !== voice.id)])
      return voice
    } catch {
      const voice: Voice = { id: crypto.randomUUID(), name: file.name.replace(/\.(mp3|wav|m4a)$/i, ''), group: '我的声音', detail: '已上传音频 · 本地文件' }
      setVoiceList((current) => [voice, ...current])
      return voice
    }
  }

  const previewPpt = async (id: string) => {
    const preview = await api.getPptPreview(id)
    setPptList((current) => current.map((ppt) => ppt.id === id ? { ...ppt, filePath: preview.filePath ?? ppt.filePath, preview: preview.preview } : ppt))
    return preview
  }

  const cloneVoice = async (id: string, input: { name: string; consent: boolean }) => {
    const voice = await api.cloneVoice(id, input)
    setVoiceList((current) => [voice, ...current.filter((item) => item.id !== voice.id)])
    return voice
  }

  const updateCourses = (nextCourses: Course[]) => {
    const changed = nextCourses.find((nextCourse) => courseList.find((course) => course.id === nextCourse.id)?.status !== nextCourse.status)
    setCourseList(nextCourses)
    if (changed) void api.updateCourse(changed.id, { status: changed.status, title: changed.title }).catch(() => undefined)
  }

  return (
    <div className="app-frame">
      <div className="app-body">
        <Sidebar page={page} onNavigate={navigate} />
        <main className="page-viewport">
          {page === 'recording' && <RecordingPage people={people} pptFiles={pptList} onUploadPpt={uploadPpt} onCreatePersonFromPhoto={createPersonFromPhoto} onCreateCourse={addCourse} />}
          {page === 'courseware' && <CoursewarePage courses={courseList} onUpdateCourses={updateCourses} onCreate={() => navigate('recording')} />}
          {page === 'ppt' && <PptLibraryPage files={pptList} onUpload={uploadPpt} onPreview={previewPpt} onRemove={(ids) => { setPptList((current) => current.filter((file) => !ids.includes(file.id))); ids.forEach((id) => void api.deletePpt(id).catch(() => undefined)) }} />}
          {page === 'people' && <DigitalPeoplePage people={people} onGenerateAvatar={generateAvatarVideo} onGenerateTextAvatar={generateTextAvatarVideo} onGenerateDifyScript={generateDifyScript} onUploadImage={uploadImage} onUploadAudio={uploadAvatarAudio} onRefreshAvatar={refreshAvatarVideo} onRemove={(id) => { setPeople((current) => current.filter((person) => person.id !== id)); void api.deletePerson(id).catch(() => undefined) }} />}
          {page === 'audio' && <AudioLibraryPage voices={voiceList} onUpload={uploadVoice} onClone={cloneVoice} onRemove={(ids) => { setVoiceList((current) => current.filter((voice) => !ids.includes(voice.id))); ids.forEach((id) => void api.deleteVoice(id).catch(() => undefined)) }} />}
        </main>
      </div>
    </div>
  )
}

export default App
