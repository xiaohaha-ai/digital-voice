import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  CirclePlus,
  Download,
  Edit3,
  FileUp,
  Filter,
  FolderOpen,
  MoreHorizontal,
  Pause,
  Play,
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

function AvatarTile({ presenter, selected, onClick, compact = false }: { presenter: Presenter; selected?: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <button className={`avatar-tile ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`} onClick={onClick} type="button">
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
  onCreateCourse: (draft: Pick<Course, 'title' | 'presenter' | 'slides'>) => void
}

export function RecordingPage({ people, pptFiles, onUploadPpt, onCreateCourse }: RecordingProps) {
  const [activeStep, setActiveStep] = useState(1)
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? '')
  const [selectedPptId, setSelectedPptId] = useState(pptFiles[0]?.id ?? '')
  const [courseName, setCourseName] = useState('')
  const [notice, setNotice] = useState('')
  const [referenceFileName, setReferenceFileName] = useState('')
  const selected = people.find((person) => person.id === selectedId) ?? people[0]
  const selectedPpt = pptFiles.find((file) => file.id === selectedPptId)
  const created = people.filter((person) => person.group === '创建的数字人')
  const publicPeople = people.filter((person) => person.group === '公共数字人')

  const onFile = async (file: File) => {
    const ppt = await onUploadPpt(file)
    setSelectedPptId(ppt.id)
    setNotice(`已添加「${ppt.title}」到我的PPT`)
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
            <FilePickerButton className="reference-upload" accept="image/png,image/jpeg" ariaLabel="上传课程老师形象" onPick={(file) => { setReferenceFileName(file.name); setNotice(`已选择参考图「${file.name}」`) }}>
              <CirclePlus size={36} strokeWidth={1.4} />
              <strong>上传你的课程老师形象</strong>
              <span>{referenceFileName || '支持图片PNG/JPG'}</span>
              <div className="reference-card"><img src={selected?.image} alt="上传照片参考图" /><small>上传照片参考图</small></div>
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
          <div className="upload-panel"><UploadCloud size={48} /><h2>上传一个新的PPT</h2><p>支持 PPT/PPTX，单个文件不超过 500MB</p><FilePickerButton className="primary-button" accept=".ppt,.pptx" ariaLabel="选择本地PPT文件" onPick={onFile}>选择本地文件</FilePickerButton></div>
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

export function PptLibraryPage({ files, onUpload, onRemove }: { files: PptFile[]; onUpload: (file: File) => Promise<PptFile>; onRemove: (ids: string[]) => void }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [active, setActive] = useState('全部')
  const [toast, setToast] = useState('')
  const shownFiles = useMemo(() => files.filter((file) => file.title.toLowerCase().includes(search.toLowerCase())), [files, search])
  const upload = async (file: File) => {
    const ppt = await onUpload(file)
    setToast(`已上传「${ppt.title}」`)
  }
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const remove = () => { onRemove(selected); setSelected([]); setToast('已删除所选PPT') }
  return (
    <section className="library-page">
      <PageToolbar><SearchBox value={search} onChange={setSearch} placeholder="搜索课件" /><FilterTabs tabs={['全部', '我的', '课题组共享']} active={active} onChange={setActive} /><span className="toolbar-spacer" /><FilePickerButton className="primary-button" accept=".ppt,.pptx" ariaLabel="新增PPT文件" onPick={upload}><Plus size={17} />新增PPT</FilePickerButton><button className="ghost-button danger" disabled={!selected.length} onClick={remove} type="button"><Trash2 size={16} />批量删除</button></PageToolbar>
      <div className="ppt-table"><div className="ppt-head"><span></span><span>课件名称</span><span>页数</span><span>更新时间</span><span>操作</span></div>{shownFiles.map((file) => <div className="ppt-row" key={file.id}><input type="checkbox" checked={selected.includes(file.id)} onChange={() => toggle(file.id)} aria-label={`选择${file.title}`} /><div className="ppt-name"><span className="ppt-file-icon"><FileUp size={20} /></span><div><strong>{file.title}</strong>{file.note && <small>有备注</small>}</div></div><span>{file.slides} 页</span><span>{file.updatedAt}</span><div className="row-actions"><button type="button" title="置顶" onClick={() => setToast(`已置顶「${file.title}」`)}>置顶</button><button type="button" title="导出PPT" onClick={() => setToast(`已准备导出「${file.title}」`)}><Download size={16} /></button><button type="button" title="编辑名称" onClick={() => setToast(`请在课程信息中修改「${file.title}」名称`)}><Edit3 size={16} /></button></div></div>)}{shownFiles.length === 0 && <div className="empty-state"><FolderOpen size={34} />没有匹配的PPT文件</div>}</div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

export function DigitalPeoplePage({ people, onCreate, onUploadImage, onRemove }: { people: Presenter[]; onCreate: (person: Presenter) => void; onUploadImage: (file: File) => Promise<string>; onRemove: (id: string) => void }) {
  const [tab, setTab] = useState<'image' | 'video'>('image')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(people[1]?.image ?? '')
  const [toast, setToast] = useState('')
  const [imageFileName, setImageFileName] = useState('')
  const [audioFileName, setAudioFileName] = useState('')
  const create = () => {
    if (!name.trim()) return setToast('请先填写形象名称')
    onCreate({ id: crypto.randomUUID(), name: name.trim(), tone: tab === 'image' ? '图片生成' : '绿幕视频', image: preview || people[0]?.image || '', group: '创建的数字人' })
    setName('')
    setToast('数字人已创建，可在AI录课中选择')
  }
  const updatePreview = async (file: File) => {
    setPreview(await onUploadImage(file))
    setImageFileName(file.name)
    setToast(`已选择形象文件「${file.name}」`)
  }
  const visible = people.filter((person) => person.name.includes(search))
  const created = people.filter((person) => person.group === '创建的数字人')
  return (
    <section className="people-page">
      <aside className="create-panel">
        <div className="segment-tabs"><button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')} type="button">上传图片</button><button className={tab === 'video' ? 'active' : ''} onClick={() => setTab('video')} type="button">上传绿幕视频</button></div>
        <h2>{tab === 'image' ? '方式一：上传图片生成绿幕视频 + 音频' : '方式二：上传绿幕视频生成音频'}</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入形象名称" />
        <FilePickerButton className="create-upload" accept={tab === 'image' ? 'image/png,image/jpeg' : 'video/mp4'} ariaLabel={tab === 'image' ? '上传头像或半身照' : '上传绿幕视频'} onPick={updatePreview}>
          <UploadCloud size={28} /><strong>{tab === 'image' ? '上传头像或半身照' : '上传绿幕视频'}</strong><span>{imageFileName || (tab === 'image' ? '支持 JPG/PNG（竖屏图片）' : '支持 MP4（绿幕视频）')}</span>
        </FilePickerButton>
        <FilePickerButton className="audio-file" accept="audio/*" ariaLabel="上传数字人音频" onPick={(file) => { setAudioFileName(file.name); setToast(`已选择音频文件「${file.name}」`) }}><FileAudioIcon /><span>{audioFileName || '上传音频'}</span></FilePickerButton>
        <button className="primary-button full" type="button" onClick={create}>创建数字人</button>
        <div className="quota"><span>名额</span><strong>{created.length} / 4</strong><small>含额外名额 1 个</small></div>
      </aside>
      <section className="people-library"><PageToolbar><SearchBox value={search} onChange={setSearch} placeholder="搜索数字人" /><span className="toolbar-spacer" /><button className="ghost-button danger" disabled={!selected} type="button" onClick={() => { if (selected) { onRemove(selected); setSelected(null); setToast('已删除数字人') } }}><Trash2 size={16} />批量删除数字人</button><button className="ghost-button" disabled={!selected} type="button" onClick={() => setToast('当前数字人已进入编辑状态')}><Edit3 size={16} />编辑数字人</button></PageToolbar><h2>创建的数字人 <span>（{created.length} 个）</span></h2><div className="people-grid">{visible.filter((person) => person.group === '创建的数字人').map((person) => <AvatarTile selected={selected === person.id} onClick={() => setSelected(person.id)} presenter={person} key={person.id} />)}</div><h2>公共数字人 <span>（{visible.filter((person) => person.group === '公共数字人').length} 个）</span></h2><div className="people-grid">{visible.filter((person) => person.group === '公共数字人').map((person) => <AvatarTile selected={selected === person.id} onClick={() => setSelected(person.id)} presenter={person} key={person.id} />)}</div></section>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

function FileAudioIcon() { return <FileUp size={18} /> }

export function AudioLibraryPage({ voices, onUpload, onRemove }: { voices: Voice[]; onUpload: (file: File) => Promise<Voice>; onRemove: (ids: string[]) => void }) {
  const [playing, setPlaying] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const upload = async (file: File) => {
    const voice = await onUpload(file)
    setToast(`已添加声音「${voice.name}」`)
  }
  const remove = () => { onRemove(selected); setSelected([]); setToast('已删除所选声音') }
  const myVoices = voices.filter((voice) => voice.group === '我的声音')
  return (
    <section className="audio-page">
      <div className="voice-toolbar"><div><h2>我的声音</h2><p>上传或选择音频，用于生成数字人讲解。</p></div><div className="voice-actions"><button type="button" disabled={!selected.length} onClick={() => setToast('已进入声音编辑状态')}><Edit3 size={16} />编辑</button><button type="button" onClick={() => setSelected(selected.length === voices.length ? [] : voices.map((voice) => voice.id))}>全选</button><button className="danger" type="button" disabled={!selected.length} onClick={remove}><Trash2 size={16} />删除</button></div></div>
      <FilePickerButton className="voice-upload" accept="audio/mpeg,audio/wav,audio/x-m4a" ariaLabel="上传声音文件" onPick={upload}><Plus size={26} /><strong>上传声音</strong><span>支持 MP3、WAV</span></FilePickerButton>
      {myVoices.length > 0 && <VoiceSection group="我的声音" voices={myVoices} selected={selected} playing={playing} onSelect={toggle} onPlay={setPlaying} />}
      <VoiceSection group="男音" voices={voices.filter((voice) => voice.group === '男音')} selected={selected} playing={playing} onSelect={toggle} onPlay={setPlaying} />
      <VoiceSection group="女音" voices={voices.filter((voice) => voice.group === '女音')} selected={selected} playing={playing} onSelect={toggle} onPlay={setPlaying} />
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </section>
  )
}

function VoiceSection({ group, voices, selected, playing, onSelect, onPlay }: { group: string; voices: Voice[]; selected: string[]; playing: string | null; onSelect: (id: string) => void; onPlay: (id: string | null) => void }) {
  return <section className="voice-section"><h2>{group === '我的声音' ? '我的声音文件' : '公共声音'} <span>{group === '我的声音' ? `（${voices.length} 个）` : group}</span></h2><div className="voice-grid">{voices.map((voice) => <article className={`voice-card ${selected.includes(voice.id) ? 'selected' : ''}`} key={voice.id} onClick={() => onSelect(voice.id)}><button className="play-button" onClick={(event) => { event.stopPropagation(); onPlay(playing === voice.id ? null : voice.id) }} type="button" aria-label={`试听${voice.name}`}>{playing === voice.id ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><div><strong>{voice.name}</strong><p>{voice.detail}</p></div></article>)}</div></section>
}
