import type { Course, PptFile, Presenter, Voice } from './data'

export type BootstrapData = {
  courses: Course[]
  ppts: PptFile[]
  people: Presenter[]
  voices: Voice[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: '请求失败' })) as { message?: string }
    throw new Error(body.message ?? '请求失败')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function json(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function fileBody(file: File): RequestInit {
  const body = new FormData()
  body.append('file', file)
  return { method: 'POST', body }
}

export const api = {
  bootstrap: () => request<BootstrapData>('/bootstrap'),
  createPpt: (ppt: PptFile) => request<PptFile>('/ppts', json('POST', ppt)),
  uploadPpt: (file: File) => request<PptFile>('/uploads/ppt', fileBody(file)),
  deletePpt: (id: string) => request<void>(`/ppts/${id}`, { method: 'DELETE' }),
  createCourse: (course: Course) => request<Course>('/courses', json('POST', course)),
  updateCourse: (id: string, update: Pick<Course, 'status' | 'title'>) => request<Course>(`/courses/${id}`, json('PATCH', update)),
  createPerson: (person: Presenter) => request<Presenter>('/people', json('POST', person)),
  uploadImage: (file: File) => request<{ filePath: string }>('/uploads/image', fileBody(file)),
  deletePerson: (id: string) => request<void>(`/people/${id}`, { method: 'DELETE' }),
  uploadVoice: (file: File) => request<Voice>('/uploads/audio', fileBody(file)),
  deleteVoice: (id: string) => request<void>(`/voices/${id}`, { method: 'DELETE' }),
}
