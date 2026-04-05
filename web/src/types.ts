export type ChangeType = 'create' | 'modify' | 'delete'
export type Classification =
  | 'feature'
  | 'fix'
  | 'refactor'
  | 'config'
  | 'breaking'
  | 'revert'
  | 'unknown'
export type Area = 'frontend' | 'backend' | 'shared' | 'infra' | 'human_loop'

export interface TimelineEvent {
  id: string
  projectId: string
  timestamp: string
  filePath: string
  changeType: ChangeType
  note?: string | null
  classification: Classification
  area: Area
  summary: string
  whyItMatters: string
  riskFlag?: string | null
  createSnapshot: boolean
}

export interface Snapshot {
  id: string
  timestamp: string
  title: string
  markdown: string
}

export interface ProjectState {
  projectId: string
  currentSummary: string
  frontendStatus: string
  backendStatus: string
  sharedStatus: string
  infraStatus: string
  activeTodos: string[]
  resolvedTodos: string[]
  risks: string[]
  lastCompleted: string
  pendingNote?: string | null
  markdown: string
  updatedAt: string
  timeline: TimelineEvent[]
  snapshots: Snapshot[]
}
