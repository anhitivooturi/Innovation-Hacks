import { useMemo, useState } from 'react';
import { Bot, Filter, TriangleAlert } from 'lucide-react';
import {
  formatRelativeTime,
  getDecisionSourceClasses,
  getDecisionTypeClasses,
} from '../lib/formatters';

const FILTERS = ['all', 'decision', 'research', 'question', 'warning'];

export function DecisionsPanel({ decisions }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const visibleDecisions = useMemo(() => {
    if (activeFilter === 'all') {
      return decisions;
    }

    return decisions.filter((decision) => decision.type === activeFilter);
  }, [activeFilter, decisions]);

  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Decisions log</p>
          <h2 className="section-title">What the team and tools decided.</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filterName) => (
            <button
              key={filterName}
              type="button"
              onClick={() => setActiveFilter(filterName)}
              className={`rounded-full px-3 py-2 text-sm transition ${
                activeFilter === filterName
                  ? 'bg-ink text-white'
                  : 'border border-ink/10 bg-white text-ink/60 hover:border-ink/20 hover:text-ink'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Filter className="h-3.5 w-3.5" />
                {filterName}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {visibleDecisions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-ink/10 bg-white/50 p-6 text-sm text-ink/60">
            No decisions match the current filter yet.
          </div>
        ) : null}

        {visibleDecisions.map((decision) => (
          <article
            key={decision.id}
            className="rounded-3xl border border-ink/10 bg-white/80 p-5 shadow-panel animate-rise"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${getDecisionSourceClasses(
                  decision.source,
                )}`}
              >
                {decision.source}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getDecisionTypeClasses(
                  decision.type,
                )}`}
              >
                {decision.type}
              </span>
              <span className="text-xs text-ink/50">
                {formatRelativeTime(decision.timestamp)}
              </span>
            </div>

            <div className="mt-4 flex items-start gap-3">
              <span className="rounded-2xl bg-plum/10 p-2 text-plum">
                {decision.type === 'warning' ? (
                  <TriangleAlert className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </span>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-ink">
                  {decision.summary}
                </h3>
                <p className="text-sm leading-6 text-ink/70">
                  {decision.details}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
