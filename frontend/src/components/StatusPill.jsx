import { getHealthClasses } from '../lib/formatters';

export function StatusPill({ label }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold capitalize ${getHealthClasses(
        label,
      )}`}
    >
      <span className="h-2.5 w-2.5 animate-pulseRing rounded-full bg-current" />
      {label}
    </span>
  );
}
