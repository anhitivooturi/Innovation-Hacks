import { useState } from 'react';
import { CornerDownLeft, Search, Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  'What broke last?',
  "What's left to build?",
  'What did we decide about auth?',
];

export function QueryPanel({ result, isLoading, onSubmit }) {
  const [question, setQuestion] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();

    const value = question.trim();
    if (!value) {
      return;
    }

    await onSubmit(value);
    setQuestion('');
  };

  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="eyebrow">Query interface</p>
          <h2 className="section-title">Ask DevLog the thing the judges will ask you.</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/60">
          <Sparkles className="h-4 w-4 text-gold" />
          Natural language answers with source cues
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuestion(suggestion)}
            className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/70 transition hover:border-ink/20 hover:text-ink"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask what changed, what is risky, or what still needs work."
            className="w-full rounded-[26px] border border-ink/10 bg-white px-12 py-4 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-marine focus:ring-2 focus:ring-marine/10"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-[26px] bg-clay px-5 py-4 text-sm font-semibold text-white transition hover:bg-clay/90 disabled:cursor-not-allowed disabled:bg-clay/55"
        >
          <CornerDownLeft className="h-4 w-4" />
          {isLoading ? 'Asking...' : 'Ask DevLog'}
        </button>
      </form>

      <article className="rounded-[28px] border border-ink/10 bg-white/75 p-6 shadow-panel">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/70">
            Latest answer
          </span>
          {result?.sources?.map((source) => (
            <span
              key={source}
              className="rounded-full bg-marine/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-marine"
            >
              {source}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm leading-7 text-ink/70">
          {result?.answer ??
            'Ask a question to see backend responses here. In mock mode, this panel returns sample citations so the UI stays demoable.'}
        </p>
      </article>
    </section>
  );
}
