import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { fetchState, fetchTimeline, postHandoff, postNote, postQuery } from './api'
import type { ProjectState, TimelineEvent } from './types'
import './App.css'

const PROJECT_ID = 'default'

const EMPTY_STATE: ProjectState = {
  projectId: PROJECT_ID,
  currentSummary: 'DevLog has not processed any project events yet.',
  frontendStatus: 'No frontend events recorded.',
  backendStatus: 'No backend events recorded.',
  sharedStatus: 'No shared events recorded.',
  infraStatus: 'No infrastructure events recorded.',
  activeTodos: [],
  resolvedTodos: [],
  risks: [],
  lastCompleted: 'No completed milestone yet.',
  pendingNote: null,
  markdown: '',
  updatedAt: '',
  timeline: [],
  snapshots: [],
}

function App() {
  const [state, setState] = useState<ProjectState>(EMPTY_STATE)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('What changed recently?')
  const [queryAnswer, setQueryAnswer] = useState('Ask DevLog about the current project memory.')
  const [handoff, setHandoff] = useState('Generate a handoff to capture the current session state.')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'note' | 'query' | 'handoff' | null>(null)

  const updatedLabel = useMemo(() => {
    if (!state.updatedAt) {
      return 'No sync yet'
    }

    return new Date(state.updatedAt).toLocaleString()
  }, [state.updatedAt])

  const refresh = useEffectEvent(async () => {
    try {
      const [nextState, nextTimeline] = await Promise.all([
        fetchState(PROJECT_ID),
        fetchTimeline(PROJECT_ID),
      ])

      startTransition(() => {
        setState(nextState)
        setTimeline(nextTimeline)
        setError(null)
        setLoading(false)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown network error'
      startTransition(() => {
        setError(message)
        setLoading(false)
      })
    }
  })

  useEffect(() => {
    void refresh()
    const intervalId = window.setInterval(() => {
      void refresh()
    }, 4000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [refresh])

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!note.trim()) {
      return
    }

    setBusyAction('note')
    try {
      const nextState = await postNote(PROJECT_ID, note.trim())
      startTransition(() => {
        setState(nextState)
        setNote('')
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleQuerySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!query.trim()) {
      return
    }

    setBusyAction('query')
    try {
      const response = await postQuery(PROJECT_ID, query.trim())
      startTransition(() => {
        setQueryAnswer(response.answer)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query DevLog.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleHandoff() {
    setBusyAction('handoff')
    try {
      const response = await postHandoff(PROJECT_ID)
      startTransition(() => {
        setHandoff(response.handoff)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate handoff.')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">DevLog AI</p>
          <h1>Project memory for fast, messy, AI-assisted builds.</h1>
          <p className="hero-text">
            The watcher tracks meaningful changes, the backend updates a living markdown
            document, and this dashboard keeps the entire session legible.
          </p>
        </div>
        <div className="hero-metrics">
          <div className="metric-card">
            <span className="metric-label">Last Sync</span>
            <strong>{loading ? 'Loading...' : updatedLabel}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Pending Note</span>
            <strong>{state.pendingNote || 'None queued'}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">Open Risks</span>
            <strong>{state.risks.length}</strong>
          </div>
        </div>
      </section>

      {error ? <p className="banner error">{error}</p> : null}

      <section className="state-grid">
        <article className="panel summary-panel">
          <div className="panel-header">
            <h2>Current State</h2>
            <span className="badge">Live</span>
          </div>
          <p className="lead">{state.currentSummary}</p>
          <div className="state-list">
            <div>
              <span>Frontend</span>
              <p>{state.frontendStatus}</p>
            </div>
            <div>
              <span>Backend</span>
              <p>{state.backendStatus}</p>
            </div>
            <div>
              <span>Shared</span>
              <p>{state.sharedStatus}</p>
            </div>
            <div>
              <span>Infra</span>
              <p>{state.infraStatus}</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Active TODOs</h2>
            <span className="badge quiet">{state.activeTodos.length}</span>
          </div>
          <ul className="check-list">
            {state.activeTodos.length ? (
              state.activeTodos.map((todo) => <li key={todo}>{todo}</li>)
            ) : (
              <li>No active TODOs.</li>
            )}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Danger Zones</h2>
            <span className="badge warning">{state.risks.length}</span>
          </div>
          <ul className="risk-list">
            {state.risks.length ? (
              state.risks.map((risk) => <li key={risk}>{risk}</li>)
            ) : (
              <li>No flagged risks.</li>
            )}
          </ul>
        </article>
      </section>

      <section className="action-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Attach Intent Note</h2>
            <span className="badge">Human loop</span>
          </div>
          <form className="stack" onSubmit={handleNoteSubmit}>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              placeholder={'Example: todo: Add retry logic\nExample: done: Hooked the auth panel into the API'}
            />
            <button type="submit" disabled={busyAction === 'note'}>
              {busyAction === 'note' ? 'Saving note...' : 'Queue note for next change'}
            </button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Ask DevLog</h2>
            <span className="badge">Query</span>
          </div>
          <form className="stack" onSubmit={handleQuerySubmit}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What changed in auth today?"
            />
            <button type="submit" disabled={busyAction === 'query'}>
              {busyAction === 'query' ? 'Thinking...' : 'Run query'}
            </button>
          </form>
          <pre className="response-box">{queryAnswer}</pre>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Session Handoff</h2>
            <span className="badge">Export</span>
          </div>
          <button
            className="handoff-button"
            type="button"
            onClick={handleHandoff}
            disabled={busyAction === 'handoff'}
          >
            {busyAction === 'handoff' ? 'Generating...' : 'Generate handoff'}
          </button>
          <pre className="response-box">{handoff}</pre>
        </article>
      </section>

      <section className="timeline-layout">
        <article className="panel timeline-panel">
          <div className="panel-header">
            <h2>Timeline</h2>
            <span className="badge quiet">{timeline.length} events</span>
          </div>
          <div className="timeline-list">
            {timeline.length ? (
              timeline.map((entry) => (
                <article key={entry.id} className="timeline-entry">
                  <header>
                    <div className="entry-tags">
                      <span className={`tag area-${entry.area}`}>{entry.area}</span>
                      <span className={`tag type-${entry.classification}`}>
                        {entry.classification}
                      </span>
                      {entry.createSnapshot ? <span className="tag snapshot">snapshot</span> : null}
                    </div>
                    <time>{new Date(entry.timestamp).toLocaleString()}</time>
                  </header>
                  <h3>{entry.summary}</h3>
                  <p>{entry.whyItMatters}</p>
                  <code>{entry.filePath}</code>
                  {entry.note ? <blockquote>{entry.note}</blockquote> : null}
                  {entry.riskFlag ? <p className="risk-callout">{entry.riskFlag}</p> : null}
                </article>
              ))
            ) : (
              <p className="empty">No events yet. Start the backend and watcher, then save a file.</p>
            )}
          </div>
        </article>

        <article className="panel markdown-panel">
          <div className="panel-header">
            <h2>Living Markdown</h2>
            <span className="badge">Mirror</span>
          </div>
          <pre className="markdown-box">{state.markdown || 'No markdown mirror yet.'}</pre>
        </article>
      </section>
    </main>
  )
}

export default App
