import type { Course, PptFile, PptPreview, Presenter, Voice } from './data'

export type BootstrapData = {
  courses: Course[]
  ppts: PptFile[]
  people: Presenter[]
  voices: Voice[]
}

export type GenerateDigitalPersonInput = {
  name: string
  prompt: string
  referenceImage?: string
}

type DeleteResult = { id: string; deleted: true }
export type PptPreviewResponse = Pick<PptFile, 'id' | 'title' | 'filePath'> & { preview?: PptPreview }

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
  getPptPreview: (id: string) => request<PptPreviewResponse>(`/ppts/${id}/preview`),
  parsePpt: (id: string) => request<PptFile>(`/ppts/${id}/parse`, json('POST', {})),
  deletePpt: (id: string) => request<DeleteResult>(`/ppts/${id}`, { method: 'DELETE' }),
  createCourse: (course: Course) => request<Course>('/courses', json('POST', course)),
  updateCourse: (id: string, update: Pick<Course, 'status' | 'title'>) => request<Course>(`/courses/${id}`, json('PATCH', update)),
  createPerson: (person: Presenter) => request<Presenter>('/people', json('POST', person)),
  uploadImage: (file: File) => request<{ filePath: string }>('/uploads/image', fileBody(file)),
  generateDigitalPerson: (input: GenerateDigitalPersonInput) => request<Presenter>('/digital-people/generate', json('POST', input)),
  deletePerson: (id: string) => request<DeleteResult>(`/people/${id}`, { method: 'DELETE' }),
  uploadVoice: (file: File) => request<Voice>('/uploads/audio', fileBody(file)),
  cloneVoice: (id: string, input: { name: string; consent: boolean }) => request<Voice>(`/voices/${id}/clone`, json('POST', input)),
  deleteVoice: (id: string) => request<DeleteResult>(`/voices/${id}`, { method: 'DELETE' }),
}
