import { AlertTriangle, Clock3, GitCommitHorizontal } from 'lucide-react';
import {
  formatRelativeTime,
  getClassificationClasses,
} from '../lib/formatters';

export function TimelinePanel({ entries }) {
  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Timeline</p>
          <h2 className="section-title">Watch the build story arrive in real time.</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60">
          <Clock3 className="h-4 w-4 text-clay" />
          Auto-refreshes when Firestore changes land
        </span>
      </div>

      <div className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-18px)] before:w-px before:bg-gradient-to-b before:from-clay before:to-transparent">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="relative ml-10 rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-panel animate-rise"
          >
            <span className="absolute -left-[34px] top-5 flex h-4 w-4 items-center justify-center rounded-full border-4 border-sand bg-clay" />
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getClassificationClasses(
                  entry.classification,
                )}`}
              >
                {entry.classification}
              </span>
              <span className="inline-flex items-center gap-2 text-xs text-ink/50">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                {entry.file}
              </span>
              <span className="text-xs text-ink/50">
                {formatRelativeTime(entry.timestamp)}
              </span>
            </div>

            <p className="mt-4 text-base leading-7 text-ink/70">{entry.summary}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {entry.danger ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-clay/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-clay">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Danger zone
                </span>
              ) : null}
              {entry.agent ? (
                <span className="rounded-full bg-ink/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">
                  {entry.agent}
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
