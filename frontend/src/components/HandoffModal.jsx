import { useMemo, useState } from 'react';
import { Copy, FileText, X } from 'lucide-react';

export function HandoffModal({
  isOpen,
  isLoading,
  handoffDocument,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  const content = useMemo(
    () => handoffDocument?.content ?? 'Handoff details will appear here.',
    [handoffDocument],
  );

  if (!isOpen) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_error) {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
      <div className="panel max-h-[85vh] w-full max-w-4xl overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-5">
          <div>
            <p className="eyebrow">Handoff generator</p>
            <h2 className="section-title">Demo-ready session brief</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/10 p-2 text-ink/60 transition hover:border-ink/20 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="border-b border-ink/10 bg-ink px-6 py-6 text-white lg:border-b-0 lg:border-r lg:border-r-white/10">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-white/60">
                <FileText className="h-4 w-4 text-gold" />
                What this gives you
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/80">
                <li>A polished handoff summary for the next teammate or judge.</li>
                <li>Snapshot of key risks, active todos, and latest project health.</li>
                <li>Copy-ready text for Slack, Notion, or your final demo notes.</li>
              </ul>
            </div>
          </aside>

          <div className="flex min-h-[380px] flex-col">
            <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
              <span className="text-sm text-ink/60">
                {isLoading ? 'Generating handoff...' : 'Formatted output'}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/20"
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <pre className="whitespace-pre-wrap font-body text-sm leading-7 text-ink/80">
                {content}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
