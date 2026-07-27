import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  CirclePlay,
  CirclePlus,
  Copy,
  Download,
  Edit3,
  Eye,
  FileUp,
  Filter,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react'
import type { Course, PptFile, Presenter, Voice } from './data'

function PageToolbar({ children }: { children: ReactNode }) {
  return <div className="page-toolbar">{children}</div>
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-box"><Search size={18} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
}

function FilterTabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (tab: string) => void }) {
  return <div className="filter-tabs" role="tablist">{tabs.map((tab) => <button className={active === tab ? 'selected' : ''} onClick={() => onChange(tab)} role="tab" aria-selected={active === tab} type="button" key={tab}>{tab}</button>)}</div>
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast"><Check size={16} />{message}<button onClick={onClose} type="button" aria-label="关闭提示">×</button></div>
}

function FilePickerButton({ accept, onPick, className, children, ariaLabel }: { accept: string; onPick: (file: File) => void; className: string; children: ReactNode; ariaLabel: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return <>
    <input
      ref={inputRef}
      className="visually-hidden-input"
      type="file"
      accept={accept}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        if (file) onPick(file)
        event.currentTarget.value = ''
      }}
    />
    <button className={className} type="button" aria-label={ariaLabel} onClick={() => inputRef.current?.click()}>{children}</button>
  </>
}

function AvatarTile({ presenter, selected, onClick, onDoubleClick, compact = false }: { presenter: Presenter; selected?: boolean; onClick?: () => void; onDoubleClick?: () => void; compact?: boolean }) {
  return (
    <button className={`avatar-tile ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`} onClick={onClick} onDoubleClick={onDoubleClick} type="button">
      <img src={presenter.image} alt={presenter.name} />
      <span className="avatar-name">{presenter.name}</span>
      {!compact && <span className="avatar-tone">{presenter.tone}</span>}
      {selected && <span className="selected-mark"><Check size={14} /></span>}
    </button>
  )
}

type RecordingProps = {
  people: Presenter[]
  pptFiles: PptFile[]
  onUploadPpt: (file: File) => Promise<PptFile>
  onCreatePersonFromPhoto: (file: File) => Promise<Presenter>
  onCreateCourse: (draft: Pick<Course, 'title' | 'presenter' | 'slides'>) => void
}

export function RecordingPage({ people, pptFiles, onUploadPpt, onCreatePersonFromPhoto, onCreateCourse }: RecordingProps) {
  const [activeStep, setActiveStep] = useState(1)
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? '')
  const [selectedPptId, setSelectedPptId] = useState(pptFiles[0]?.id ?? '')
  const [courseName, setCourseName] = useState('')
  const [notice, setNotice] = useState('')
  const [referenceFileName, setReferenceFileName] = useState('')
  const [referenceImage, setReferenceImage] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)
  const selected = people.find((person) => person.id === selectedId) ?? people[0]
  const selectedPpt = pptFiles.find((file) => file.id === selectedPptId)
  const created = people.filter((person) => person.group === '创建的数字人')
  const publicPeople = people.filter((person) => person.group === '公共数字人')

  const onFile = async (file: File) => {
    const ppt = await onUploadPpt(file)
    setSelectedPptId(ppt.id)
    setNotice(`已添加「${ppt.title}」到我的PPT`)
  }

  const createPersonFromPhoto = async (file: File) => {
    setCreatingPerson(true)
    setReferenceFileName(file.name)
    try {
      const person = await onCreatePersonFromPhoto(file)
      setSelectedId(person.id)
      setReferenceImage(person.image)
      setNotice(`已创建数字人「${person.name}」`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '数字人创建失败')
    } finally {
      setCreatingPerson(false)
    }
  }

  const next = () => {
    if (activeStep === 1 && !selected) return setNotice('请先选择数字人老师')
    if (activeStep === 2 && !selectedPpt) return setNotice('请选择或上传一个PPT文件')
    setActiveStep((current) => Math.min(4, current + 1))
  }

  const createCourse = () => {
    if (!selected || !selectedPpt) return setNotice('请完成数字人与PPT选择')
    onCreateCourse({ title: courseName.trim() || selectedPpt.title, presenter: selected.name, slides: selectedPpt.slides })
  }

  return (
    <section className="recording-page">
      <div className="stepper">
        {['数字人老师', '上传PPT', '课程信息', 'AI合成课件'].map((label, index) => {
          const number = index + 1
          return <button className={`stepper-item ${activeStep === number ? 'active' : ''} ${activeStep > number ? 'done' : ''}`} onClick={() => setActiveStep(number)} key={label} type="button"><span>{number}</span><strong>{label}</strong></button>
        })}
      </div>
      {activeStep === 1 && (
        <div className="recording-layout">
          <section className="recording-new">
            <h2>新建数字人老师</h2>
            <FilePickerButton className="reference-upload" accept="image/png,image/jpeg" ariaLabel="上传课程老师形象" onPick={(file) => { void createPersonFromPhoto(file) }}>
              <CirclePlus size={36} strokeWidth={1.4} />
              <strong>{creatingPerson ? '正在创建数字人...' : '上传你的课程老师形象'}</strong>
              <span>{referenceFileName || '支持图片PNG/JPG'}</span>
              <div className="reference-card"><img src={referenceImage || selected?.image} alt="上传照片参考图" /><small>上传照片参考图</small></div>
            </FilePickerButton>
          </section>
          <section className="presenter-picker">
            <div className="picker-title"><h2>选择一个数字人 <em>（{created.length} / 4）</em></h2></div>
            <h3>创建的数字人 <span>（{created.length} 个）</span></h3>
            <div className="avatar-row compact-row">{created.map((person) => <AvatarTile compact selected={person.id === selectedId} onClick={() => setSelectedId(person.id)} presenter={person} key={person.id} />)}</div>
            <h3>公共数字人 <span>（{publicPeople.length} 个）</span></h3>
            <div className="avatar-row public-row">{publicPeople.map((person) => <AvatarTile compact selected={person.id === selectedId} onClick={() => setSelectedId(person.id)} presenter={person} key={person.id} />)}</div>
          </section>
        </div>
      )}
      {activeStep === 2 && (
        <div className="single-step-panel">
          <div className="upload-panel"><UploadCloud size={48} /><h2>上传一个新的PPT</h2><p>支持可解析的 PPTX，单个文件不超过 500MB</p><FilePickerButton className="primary-button" accept=".pptx" ariaLabel="选择本地PPTX文件" onPick={onFile}>选择本地文件</FilePickerButton></div>
          <div className="field-line"><label>选择已有课件</label><select value={selectedPptId} onChange={(event) => setSelectedPptId(event.target.value)}><option value="">请选择课件</option>{pptFiles.map((file) => <option value={file.id} key={file.id}>{file.title} · {file.slides} 页</option>)}</select></div>
        </div>
      )}
      {activeStep === 3 && (
        <div className="single-step-panel course-info-panel">
          <div className="field-line"><label>课程名称</label><input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder={selectedPpt?.title || '请输入课程名称'} /></div>
          <div className="optional-videos"><FileUp size={26} /><div><strong>片头视频（非必填）</strong><span>支持 .mp4 / .avi / .mov，推荐 16:9 横屏</span></div><button type="button">上传视频</button></div>
          <div className="optional-videos"><FileUp size={26} /><div><strong>片尾视频（非必填）</strong><span>支持 .mp4 / .avi / .mov，推荐 16:9 横屏</span></div><button type="button">上传视频</button></div>
        </div>
      )}
      {activeStep === 4 && (
        <div className="single-step-panel generate-panel"><Sparkles size={48} /><h2>确认课程配置</h2><p>数字人：{selected?.name || '未选择'} · 课件：{selectedPpt?.title || '未选择'} · 课程：{courseName || selectedPpt?.title || '未命名课程'}</p><button className="primary-button" type="button" onClick={createCourse}>创建课程并开始合成</button></div>
      )}
      <div className="wizard-footer"><button type="button" onClick={() => setActiveStep((current) => Math.max(1, current - 1))} disabled={activeStep === 1}>上一步</button><span>已选择：{selected?.name || '未选择'}</span><button type="button" className="primary-button" onClick={activeStep === 4 ? createCourse : next}>{activeStep === 4 ? '确认创建' : '下一步'}</button></div>
      {notice && <Toast message={notice} onClose={() => setNotice('')} />}
    </section>
  )
}

export function CoursewarePage({ courses, onUpdateCourses, onCreate }: { courses: Course[]; onUpdateCourses: (courses: Course[]) => void; onCreate: () => void }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('全部')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const visibleCourses = courses.filter((course) => course.title.toLowerCase().includes(search.toLowerCase()) && (filter === '全部' || (filter === '我的' && course.status !== '已完成') || (filter === '已完成' && course.status === '已完成')))
  const editing = courses.find((course) => course.id === editingId)
  const toggleComplete = () => {
    if (!editing) return
    const nextStatus: Course['status'] = editing.status === '已完成' ? '编辑中' : '已完成'
    onUpdateCourses(courses.map((course) => course.id === editing.id ? { ...course, status: nextStatus } : course))
    setToast(`「${editing.title}」已${nextStatus === '已完成' ? '标记为完成' : '恢复编辑'}`)
    setEditingId(null)
  }
  return (
    <section className="library-page">
      <PageToolbar><SearchBox value={search} onChange={setSearch} placeholder="搜索课程" /><FilterTabs tabs={['全部', '我的', '已完成']} active={filter} onChange={setFilter} /><span className="toolbar-spacer" /><button className="ghost-button"><Filter size={16} />筛选课题组</button><button className="primary-button" onClick={onCreate} type="button"><Plus size={17} />新建课程</button></PageToolbar>
      <div className="course-grid">
        {visibleCourses.map((course) => <article className="course-card" key={course.id}><div className="course-cover" style={{ backgroundColor: course.color }}><Video size={42} /><span>视频课件</span></div><div className="course-content"><div className="course-heading"><div><h2>{course.title}</h2><p>{course.slides} 页课件 · {course.presenter}</p></div><button aria-label="更多课程操作" type="button"><MoreHorizontal size={19} /></button></div><div className="course-foot"><span className={`status ${course.status === '已完成' ? 'success' : 'pending'}`}>{course.status}</span><button type="button" onClick={() => setEditingId(course.id)}><Edit3 size={15} />编辑课程</button></div></div></article>)}
      </div>
      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingId(null)}><section className="course-modal" role="dialog" aria-modal="true" aria-labelledby="course-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭编辑器" onClick={() => setEditingId(null)}><X size={18} /></button><span className="modal-kicker">课程编辑器</span><h2 id="course-modal-title">{editing.title}</h2><p>{editing.slides} 页课件 · 当前数字人：{editing.presenter}</p><div className="modal-mode"><Sparkles size={20} /><span>当前状态：{editing.status}</span></div><button className="primary-button" type="button" onClick={toggleComplete}>{editing.status === '已完成' ? '恢复编辑' : '标记为合成完成'}</button></section></div>}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

export function PptLibraryPage({ files, onUpload, onPreview, onRemove }: { files: PptFile[]; onUpload: (file: File) => Promise<PptFile>; onPreview: (id: string) => Promise<{ id: string; title: string; filePath?: string; preview?: PptFile['preview'] }>; onRemove: (ids: string[]) => void }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState('全部')
  const [toast, setToast] = useState('')
  const [previewing, setPreviewing] = useState<PptFile | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const shownFiles = useMemo(() => files.filter((file) => file.title.toLowerCase().includes(search.toLowerCase())), [files, search])
  const upload = async (file: File) => {
    const ppt = await onUpload(file)
    setToast(`已上传「${ppt.title}」`)
  }
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const remove = () => { onRemove(selected); setSelected([]); setToast('已删除所选PPT') }
  const preview = async (file: PptFile) => {
    setPreviewing(file)
    setPreviewLoading(true)
    try {
      const result = await onPreview(file.id)
      setPreviewing({ ...file, filePath: result.filePath ?? file.filePath, preview: result.preview })
    } catch (error) {
      setPreviewing(null)
      setToast(error instanceof Error ? error.message : 'PPT 预览加载失败')
    } finally {
      setPreviewLoading(false)
    }
  }
  return (
    <section className="library-page">
      <PageToolbar><SearchBox value={search} onChange={setSearch} placeholder="搜索课件" /><FilterTabs tabs={['全部', '我的', '课题组共享']} active={active} onChange={setActive} /><span className="toolbar-spacer" /><FilePickerButton className="primary-button" accept=".pptx" ariaLabel="新增PPTX文件" onPick={upload}><Plus size={17} />新增PPT</FilePickerButton><button className="ghost-button danger" disabled={!selected.length} onClick={remove} type="button"><Trash2 size={16} />批量删除</button></PageToolbar>
      <div className="ppt-table"><div className="ppt-head"><span></span><span>课件名称</span><span>页数</span><span>更新时间</span><span>操作</span></div>{shownFiles.map((file) => <div className="ppt-row" key={file.id}><input type="checkbox" checked={selected.includes(file.id)} onChange={() => toggle(file.id)} aria-label={`选择${file.title}`} /><div className="ppt-name"><span className="ppt-file-icon"><FileUp size={20} /></span><div><strong>{file.title}</strong>{file.note && <small>有备注</small>}</div></div><span>{file.slides} 页</span><span>{file.updatedAt}</span><div className="row-actions"><button type="button" title="预览PPT" onClick={() => { void preview(file) }}><Eye size={16} /></button><button type="button" title="导出PPT" onClick={() => setToast(`已准备导出「${file.title}」`)}><Download size={16} /></button><button type="button" title="编辑名称" onClick={() => setToast(`请在课程信息中修改「${file.title}」名称`)}><Edit3 size={16} /></button></div></div>)}{shownFiles.length === 0 && <div className="empty-state"><FolderOpen size={34} />没有匹配的PPT文件</div>}</div>
      {previewing && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreviewing(null)}><section className="ppt-preview-modal" role="dialog" aria-modal="true" aria-labelledby="ppt-preview-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭PPT预览" onClick={() => setPreviewing(null)}><X size={18} /></button><div className="ppt-preview-heading"><div><span className="modal-kicker">PPTX 解析预览</span><h2 id="ppt-preview-title">{previewing.title}</h2><p>{previewing.slides} 页课件{previewing.note ? ' · 含备注' : ''}</p></div>{previewing.filePath && <a className="ghost-button" href={previewing.filePath} target="_blank" rel="noreferrer"><Download size={16} />打开原文件</a>}</div>{previewLoading && <div className="preview-empty">正在解析课件内容...</div>}{!previewLoading && previewing.preview?.state === '已解析' && <div className="ppt-slide-list">{previewing.preview.slides.map((slide) => <article className="ppt-slide-preview" key={slide.index}><strong>{slide.index}</strong><div><h3>{slide.title}</h3>{slide.text && <p>{slide.text}</p>}{slide.note && <small>备注：{slide.note}</small>}</div></article>)}</div>}{!previewLoading && previewing.preview?.state !== '已解析' && <div className="preview-empty">{previewing.preview?.error || '该课件暂未解析，可重新上传 PPTX 文件。'}</div>}</section></div>}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

function DigitalPersonVideoCard({ person, selected, onSelect, onPreview, onImagePreview }: { person: Presenter; selected: boolean; onSelect: () => void; onPreview: () => void; onImagePreview: () => void }) {
  const state = person.videoStatus ?? (person.videoPath ? 'ready' : undefined)
  const statusLabel = state === 'processing' ? '正在生成口型视频' : state === 'ready' ? 'MP4 已生成' : state === 'failed' ? '生成失败' : '尚未生成视频'
  return <article className={`digital-person-card ${selected ? 'selected' : ''}`}>
    <div className="digital-person-media" onDoubleClick={(event) => { event.preventDefault(); onImagePreview() }}>
      {person.videoPath
        ? <video controls preload="metadata" poster={person.image} src={person.videoPath} onClick={(event) => event.stopPropagation()} />
        : <><img src={person.image} alt={person.name} />{state === 'processing' && <span className="video-processing"><LoaderCircle size={18} />生成中</span>}{state === 'failed' && <span className="video-failed"><AlertCircle size={17} />失败</span>}</>}
    </div>
    <div className="digital-person-card-footer">
      <button className="digital-person-select" type="button" onClick={onSelect} aria-pressed={selected}><strong>{person.name}</strong><span>{statusLabel}</span></button>
      {person.videoPath && <button className="video-preview-button" type="button" aria-label={`预览${person.name}的数字人视频`} title="预览 MP4 视频" onClick={onPreview}><CirclePlay size={19} /></button>}
    </div>
    {state === 'failed' && person.videoMessage && <p className="digital-person-error">{person.videoMessage}</p>}
  </article>
}

export function DigitalPeoplePage({ people, onGenerateAvatar, onGenerateTextAvatar, onGenerateDifyScript, onUploadImage, onUploadAudio, onRefreshAvatar, onRemove }: { people: Presenter[]; onGenerateAvatar: (input: { name: string; portraitPath: string; audioPath: string; consent: boolean }) => Promise<Presenter>; onGenerateTextAvatar: (input: { name: string; portraitPath: string; text: string; voiceGender: 'male' | 'female'; consent: boolean }) => Promise<Presenter>; onGenerateDifyScript: (topic: string) => Promise<string>; onUploadImage: (file: File) => Promise<string>; onUploadAudio: (file: File) => Promise<string>; onRefreshAvatar: (id: string) => Promise<Presenter>; onRemove: (id: string) => void }) {
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [portraitPath, setPortraitPath] = useState('')
  const [audioPath, setAudioPath] = useState('')
  const [scriptTopic, setScriptTopic] = useState('')
  const [script, setScript] = useState('')
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female')
  const [toast, setToast] = useState('')
  const [imageFileName, setImageFileName] = useState('')
  const [audioFileName, setAudioFileName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingScript, setGeneratingScript] = useState(false)
  const [uploading, setUploading] = useState<'image' | 'audio' | null>(null)
  const [consent, setConsent] = useState(false)
  const [previewing, setPreviewing] = useState<Presenter | null>(null)
  const [portraitPreviewing, setPortraitPreviewing] = useState<Presenter | null>(null)
  const create = async () => {
    if (!name.trim()) return setToast('请先填写形象名称')
    if (!portraitPath || (!audioPath && !script.trim())) return setToast('请先上传头像，并提供音频或口播内容')
    if (!consent) return setToast('请确认拥有该肖像及相关音频或文本的使用授权')
    setGenerating(true)
    try {
      const person = script.trim()
        ? await onGenerateTextAvatar({ name: name.trim(), portraitPath, text: script.trim(), voiceGender, consent })
        : await onGenerateAvatar({ name: name.trim(), portraitPath, audioPath, consent })
      setName('')
      setPreview('')
      setPortraitPath('')
      setAudioPath('')
      setScriptTopic('')
      setScript('')
      setImageFileName('')
      setAudioFileName('')
      setConsent(false)
      setSelected(person.id)
      setToast(person.videoStatus === 'ready' ? '数字人口型同步 MP4 已生成' : script.trim() ? '已提交配音与数字人视频任务' : '已提交数字人口型同步视频任务')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '数字人视频生成失败')
    } finally {
      setGenerating(false)
    }
  }
  const generateScript = async () => {
    if (!scriptTopic.trim()) return setToast('请先填写口播主题')
    setGeneratingScript(true)
    try {
      setScript(await onGenerateDifyScript(scriptTopic.trim()))
      setToast('已生成约 10 秒口播内容')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Dify 口播内容生成失败')
    } finally {
      setGeneratingScript(false)
    }
  }
  const updatePreview = async (file: File) => {
    setUploading('image')
    try {
      const filePath = await onUploadImage(file)
      setPreview(filePath)
      setPortraitPath(filePath)
      setImageFileName(file.name)
      setToast(`已上传形象文件「${file.name}」`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '形象文件上传失败')
    } finally {
      setUploading(null)
    }
  }
  const updateAudio = async (file: File) => {
    setUploading('audio')
    try {
      setAudioPath(await onUploadAudio(file))
      setAudioFileName(file.name)
      setToast(`已上传音频文件「${file.name}」`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '音频文件上传失败')
    } finally {
      setUploading(null)
    }
  }
  const visible = people.filter((person) => person.name.includes(search))
  const created = people.filter((person) => person.group === '创建的数字人')
  const processingIds = people.filter((person) => person.videoStatus === 'processing' && person.generationJobId).map((person) => person.id).join(',')
  useEffect(() => {
    if (!processingIds) return
    const refresh = async () => {
      for (const id of processingIds.split(',')) {
        try {
          await onRefreshAvatar(id)
        } catch {
          // A temporary worker outage should not change the persisted task state.
        }
      }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3_000)
    return () => window.clearInterval(timer)
  }, [onRefreshAvatar, processingIds])
  return (
    <section className="people-page">
      <aside className="create-panel">
        <h2>上传头像，输入口播内容并选择音色，生成口型同步的 MP4 数字人视频</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入形象名称" />
        <FilePickerButton className="create-upload" accept="image/png,image/jpeg" ariaLabel="上传头像或半身照" onPick={updatePreview}>
          <UploadCloud size={28} /><strong>{uploading === 'image' ? '正在上传头像...' : '上传头像或半身照'}</strong><span>{imageFileName || '支持 JPG/PNG，建议正面竖屏图片'}</span>
        </FilePickerButton>
        {preview && <img className="portrait-preview" src={preview} alt="待生成数字人的头像预览" />}
        <FilePickerButton className="audio-file" accept="audio/mpeg,audio/wav,audio/x-m4a" ariaLabel="上传自备数字人音频" onPick={updateAudio}><FileAudioIcon /><span>{uploading === 'audio' ? '正在上传音频...' : audioFileName || '上传自备音频（可选，MP3/WAV/M4A）'}</span></FilePickerButton>
        <div className="script-input"><div className="script-input-heading"><span>口播内容</span><small>约 10 秒</small></div><div className="dify-script-controls"><input value={scriptTopic} maxLength={240} onChange={(event) => setScriptTopic(event.target.value)} placeholder="输入口播主题" aria-label="Dify 口播主题" /><button className="dify-script-button" type="button" disabled={generatingScript} onClick={() => { void generateScript() }}><Sparkles size={15} />{generatingScript ? '生成中...' : 'Dify 生成'}</button></div><textarea value={script} maxLength={80} onChange={(event) => setScript(event.target.value)} placeholder="可直接输入，或使用 Dify 生成约 10 秒口播。" aria-label="口播内容" /></div>
        <div className="voice-choice"><span>AI 配音音色</span><div className="segment-tabs" role="group" aria-label="选择数字人配音音色"><button className={voiceGender === 'male' ? 'active' : ''} type="button" aria-pressed={voiceGender === 'male'} onClick={() => setVoiceGender('male')}>男声</button><button className={voiceGender === 'female' ? 'active' : ''} type="button" aria-pressed={voiceGender === 'female'} onClick={() => setVoiceGender('female')}>女声</button></div><small>填写口播内容时，将先异步生成配音，再自动生成数字人视频。</small></div>
        <label className="avatar-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />我确认拥有该肖像及相关音频或文本的使用授权</label>
        <button className="primary-button full" type="button" disabled={generating || Boolean(uploading)} onClick={() => { void create() }}><Video size={17} />{generating ? '正在提交任务...' : '生成数字人视频'}</button>
        <div className="quota"><span>名额</span><strong>{created.length} / 4</strong><small>含额外名额 1 个</small></div>
      </aside>
      <section className="people-library"><PageToolbar><SearchBox value={search} onChange={setSearch} placeholder="搜索数字人" /><span className="toolbar-spacer" /><button className="ghost-button danger" disabled={!selected} type="button" onClick={() => { if (selected) { onRemove(selected); setSelected(null); setToast('已删除数字人') } }}><Trash2 size={16} />删除数字人</button><button className="ghost-button" disabled={!selected} type="button" onClick={() => setToast('当前数字人已进入编辑状态')}><Edit3 size={16} />编辑数字人</button></PageToolbar><h2>创建的数字人 <span>（{created.length} 个）</span></h2><div className="people-grid">{visible.filter((person) => person.group === '创建的数字人').map((person) => <DigitalPersonVideoCard selected={selected === person.id} onSelect={() => setSelected(person.id)} onPreview={() => setPreviewing(person)} onImagePreview={() => setPortraitPreviewing(person)} person={person} key={person.id} />)}</div><h2>公共数字人 <span>（{visible.filter((person) => person.group === '公共数字人').length} 个）</span></h2><div className="people-grid">{visible.filter((person) => person.group === '公共数字人').map((person) => <AvatarTile selected={selected === person.id} onClick={() => setSelected(person.id)} onDoubleClick={() => setPortraitPreviewing(person)} presenter={person} key={person.id} />)}</div></section>
      {previewing?.videoPath && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreviewing(null)}><section className="avatar-video-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-video-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭视频预览" onClick={() => setPreviewing(null)}><X size={18} /></button><div className="avatar-video-heading"><span className="modal-kicker">口型同步 MP4</span><h2 id="avatar-video-title">{previewing.name}</h2><p>{previewing.videoMessage || '数字人形象视频'}</p></div><video autoPlay controls preload="metadata" poster={previewing.image} src={previewing.videoPath} /></section></div>}
      {portraitPreviewing && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPortraitPreviewing(null)}><section className="avatar-image-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-image-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="关闭形象预览" onClick={() => setPortraitPreviewing(null)}><X size={18} /></button><div className="avatar-image-heading"><h2 id="avatar-image-title">{portraitPreviewing.name}</h2><p>{portraitPreviewing.tone}</p></div><div className="avatar-image-stage"><img src={portraitPreviewing.image} alt={`${portraitPreviewing.name}完整形象`} /></div></section></div>}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

function FileAudioIcon() { return <FileUp size={18} /> }

export function AudioLibraryPage({ voices, onUpload, onClone, onRemove }: { voices: Voice[]; onUpload: (file: File) => Promise<Voice>; onClone: (id: string, input: { name: string; consent: boolean }) => Promise<Voice>; onRemove: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [clonePanelOpen, setClonePanelOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloneConsent, setCloneConsent] = useState(false)
  const [cloning, setCloning] = useState(false)
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const upload = async (file: File) => {
    const voice = await onUpload(file)
    setToast(`已添加声音「${voice.name}」`)
  }
  const remove = () => { onRemove(selected); setSelected([]); setToast('已删除所选声音') }
  const myVoices = voices.filter((voice) => voice.group === '我的声音')
  const cloneSource = selected.length === 1 ? myVoices.find((voice) => voice.id === selected[0] && voice.filePath) : undefined
  const clone = async () => {
    if (!cloneSource) return
    if (!cloneName.trim()) return setToast('请输入克隆声音名称')
    if (!cloneConsent) return setToast('请确认拥有该声音的克隆授权')
    setCloning(true)
    try {
      const voice = await onClone(cloneSource.id, { name: cloneName.trim(), consent: cloneConsent })
      setSelected([voice.id])
      setCloneName('')
      setCloneConsent(false)
      setClonePanelOpen(false)
      setToast(`已创建克隆声音「${voice.name}」`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '音频克隆失败')
    } finally {
      setCloning(false)
    }
  }
  return (
    <section className="audio-page">
      <div className="voice-toolbar"><div><h2>我的声音</h2><p>上传、试听或克隆已授权的参考声音。</p></div><div className="voice-actions"><button type="button" disabled={!cloneSource} onClick={() => setClonePanelOpen(true)}><Copy size={16} />克隆声音</button><button type="button" disabled={!selected.length} onClick={() => setToast('已进入声音编辑状态')}><Edit3 size={16} />编辑</button><button type="button" onClick={() => setSelected(selected.length === voices.length ? [] : voices.map((voice) => voice.id))}>全选</button><button className="danger" type="button" disabled={!selected.length} onClick={remove}><Trash2 size={16} />删除</button></div></div>
      <FilePickerButton className="voice-upload" accept="audio/mpeg,audio/wav,audio/x-m4a" ariaLabel="上传声音文件" onPick={upload}><Plus size={26} /><strong>上传声音</strong><span>支持 MP3、WAV</span></FilePickerButton>
      {clonePanelOpen && cloneSource && <section className="clone-panel"><div><strong>克隆参考：{cloneSource.name}</strong><span>仅限已获得授权的声音</span></div><input type="text" value={cloneName} onChange={(event) => setCloneName(event.target.value)} placeholder="请输入克隆声音名称" /><label><input type="checkbox" checked={cloneConsent} onChange={(event) => setCloneConsent(event.target.checked)} />我确认拥有该声音的克隆授权</label><button className="primary-button" type="button" disabled={cloning} onClick={() => { void clone() }}>{cloning ? '正在克隆...' : '创建克隆声音'}</button><button className="ghost-button" type="button" onClick={() => setClonePanelOpen(false)}>取消</button></section>}
      {myVoices.length > 0 && <VoiceSection group="我的声音" voices={myVoices} selected={selected} onSelect={toggle} />}
      <VoiceSection group="男音" voices={voices.filter((voice) => voice.group === '男音')} selected={selected} onSelect={toggle} />
      <VoiceSection group="女音" voices={voices.filter((voice) => voice.group === '女音')} selected={selected} onSelect={toggle} />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

function VoiceSection({ group, voices, selected, onSelect }: { group: string; voices: Voice[]; selected: string[]; onSelect: (id: string) => void }) {
  return <section className="voice-section"><h2>{group === '我的声音' ? '我的声音文件' : '公共声音'} <span>{group === '我的声音' ? `（${voices.length} 个）` : group}</span></h2><div className="voice-grid">{voices.map((voice) => <article className={`voice-card ${selected.includes(voice.id) ? 'selected' : ''}`} key={voice.id} onClick={() => onSelect(voice.id)}><div><strong>{voice.name}</strong><p>{voice.detail}</p>{voice.filePath ? <audio controls preload="metadata" src={voice.filePath} onClick={(event) => event.stopPropagation()} /> : <small>暂无可试听音频</small>}</div></article>)}</div></section>
}
