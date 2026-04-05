import type { ProjectState, TimelineEvent } from './types'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return (await response.json()) as T
}

export function fetchState(projectId = 'default') {
  return request<ProjectState>(`/state?projectId=${projectId}`)
}

export function fetchTimeline(projectId = 'default', limit = 30) {
  return request<TimelineEvent[]>(`/timeline?projectId=${projectId}&limit=${limit}`)
}

export function postNote(projectId: string, note: string) {
  return request<ProjectState>('/notes', {
    method: 'POST',
    body: JSON.stringify({ projectId, note }),
  })
}

export function postQuery(projectId: string, question: string) {
  return request<{ answer: string }>('/query', {
    method: 'POST',
    body: JSON.stringify({ projectId, question }),
  })
}

export function postHandoff(projectId: string) {
  return request<{ handoff: string }>('/handoff', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  })
}
