import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowRight, BookOpenText, ListTodo } from 'lucide-react';
import {
  formatRelativeTime,
  getTodoStateClasses,
  splitMarkdownSections,
} from '../lib/formatters';

const SECTION_ORDER = ['Recent Changes', 'Current State', 'Needs Building', 'Completed'];

// Map friendly tab labels to actual markdown heading text
const SECTION_MAPPING = {
  'Recent Changes': 'Recent Changes',
  'Current State': 'Current Working State',
  'Needs Building': 'What Needs To Be Built',
  'Completed': 'Completed',
};

export function DevLogPanel({ devlog, todos }) {
  const sections = useMemo(
    () => splitMarkdownSections(devlog?.content ?? ''),
    [devlog?.content],
  );
  const [activeTab, setActiveTab] = useState('Recent Changes');

  const displayMarkdown = useMemo(() => {
    const sectionKey = SECTION_MAPPING[activeTab];

    if (sections[sectionKey]) {
      return sections[sectionKey];
    }

    return `## ${activeTab}\n\nNo entries yet — changes will appear here as you build.`;
  }, [activeTab, sections]);

  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Living document</p>
          <h2 className="section-title">Project memory that updates while we build.</h2>
        </div>
        <span className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60">
          Updated {formatRelativeTime(devlog?.lastUpdated ?? devlog?.last_updated ?? null)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTION_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-marine text-white'
                : 'border border-ink/10 bg-white text-ink/60 hover:border-ink/20 hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[28px] border border-ink/10 bg-white/75 p-6 shadow-panel">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-ink/50">
            <BookOpenText className="h-4 w-4 text-clay" />
            Markdown view
          </div>
          <div className="markdown-content">
            <ReactMarkdown>{displayMarkdown}</ReactMarkdown>
          </div>
        </article>

        <aside className="rounded-[28px] border border-ink/10 bg-ink p-6 text-white shadow-panel">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-white/60">
            <ListTodo className="h-4 w-4 text-gold" />
            Open work
          </div>
          <div className="mt-4 space-y-3">
            {todos.length === 0 ? (
              <p className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                No todo items published yet.
              </p>
            ) : null}

            {todos.slice(0, 5).map((todo) => (
              <div
                key={todo.id}
                className="rounded-3xl border border-white/10 bg-white/10 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getTodoStateClasses(
                      todo.state,
                    )}`}
                  >
                    {todo.state}
                  </span>
                  <span className="text-xs text-white/50">
                    {formatRelativeTime(todo.updatedAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/80">{todo.title}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-white/60">
            Synced from Firestore
            <ArrowRight className="h-4 w-4" />
          </div>
        </aside>
      </div>
    </section>
  );
}
