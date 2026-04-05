import { useMemo, useState } from 'react';
import { ArchiveRestore, Eye, RotateCcw, X } from 'lucide-react';
import { formatRelativeTime } from '../lib/formatters';

export function SnapshotsDrawer({
  isOpen,
  snapshots,
  isRestoring,
  onClose,
  onRestore,
}) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(
    snapshots[0]?.id ?? null,
  );

  const selectedSnapshot = useMemo(
    () =>
      snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ??
      snapshots[0] ??
      null,
    [selectedSnapshotId, snapshots],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full justify-end bg-ink/30 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-5xl flex-col border-l border-white/20 bg-sand shadow-2xl lg:flex-row">
        <aside className="border-b border-ink/10 px-5 py-5 lg:w-[360px] lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Snapshots</p>
              <h2 className="section-title">Restore points for the demo.</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 p-2 text-ink/60 transition hover:border-ink/20 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-3 overflow-y-auto">
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.id}
                type="button"
                onClick={() => setSelectedSnapshotId(snapshot.id)}
                className={`w-full rounded-[24px] border p-4 text-left transition ${
                  selectedSnapshot?.id === snapshot.id
                    ? 'border-marine bg-white shadow-panel'
                    : 'border-ink/10 bg-white/70 hover:border-ink/20'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-marine/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-marine">
                    {snapshot.reason}
                  </span>
                  <span className="text-xs text-ink/45">
                    {formatRelativeTime(snapshot.timestamp)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">
                  {snapshot.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/70">
                  {snapshot.summary}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[50vh] flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/70">
                <Eye className="h-3.5 w-3.5" />
                Snapshot preview
              </div>
              <h3 className="mt-3 text-xl font-semibold text-ink">
                {selectedSnapshot?.title ?? 'No snapshot selected'}
              </h3>
            </div>
            <button
              type="button"
              disabled={!selectedSnapshot || isRestoring}
              onClick={() => {
                if (!selectedSnapshot) {
                  return;
                }

                const shouldRestore = window.confirm(
                  `Restore snapshot "${selectedSnapshot.title}"?`,
                );

                if (shouldRestore) {
                  void onRestore(selectedSnapshot);
                }
              }}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/45"
            >
              <RotateCcw className="h-4 w-4" />
              {isRestoring ? 'Restoring...' : 'Restore'}
            </button>
          </div>

          <div className="grid flex-1 gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="border-b border-ink/10 bg-ink px-6 py-6 text-white lg:border-b-0 lg:border-r lg:border-r-white/10">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-white/60">
                  <ArchiveRestore className="h-4 w-4 text-gold" />
                  Why this snapshot exists
                </div>
                <p className="mt-4 text-sm leading-7 text-white/80">
                  {selectedSnapshot?.summary ??
                    'Once snapshots arrive from the backend, their rollback reason and metadata will appear here.'}
                </p>
              </div>
            </div>
            <div className="overflow-y-auto px-6 py-6">
              <pre className="whitespace-pre-wrap font-body text-sm leading-7 text-ink/75">
                {selectedSnapshot?.content ??
                  'Snapshot payload preview will render here.'}
              </pre>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
