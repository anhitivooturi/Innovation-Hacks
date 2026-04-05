function toDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(value) {
  const date = toDate(value);

  if (!date) {
    return 'just now';
  }

  const diffMs = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    { unit: 'day', ms: 86_400_000 },
    { unit: 'hour', ms: 3_600_000 },
    { unit: 'minute', ms: 60_000 },
  ];

  for (const entry of units) {
    if (Math.abs(diffMs) >= entry.ms || entry.unit === 'minute') {
      return formatter.format(Math.round(diffMs / entry.ms), entry.unit);
    }
  }

  return 'just now';
}

export function getHealthClasses(health) {
  switch (health) {
    case 'green':
    case 'working':
      return 'bg-moss/20 text-moss';
    case 'yellow':
    case 'warning':
    case 'incomplete':
      return 'bg-gold/20 text-ink';
    case 'red':
    case 'danger':
      return 'bg-clay/20 text-clay';
    default:
      return 'bg-ink/10 text-ink/70';
  }
}

export function getClassificationClasses(classification) {
  switch (classification) {
    case 'feature':
      return 'bg-moss/20 text-moss';
    case 'fix':
      return 'bg-marine/20 text-marine';
    case 'breaking':
      return 'bg-clay/20 text-clay';
    case 'config':
      return 'bg-gold/20 text-ink';
    case 'refactor':
      return 'bg-plum/20 text-plum';
    default:
      return 'bg-ink/10 text-ink/70';
  }
}

export function getDecisionSourceClasses(source) {
  switch ((source ?? '').toLowerCase()) {
    case 'claude code':
      return 'bg-plum/20 text-plum';
    case 'cursor':
      return 'bg-moss/20 text-moss';
    case 'chatgpt':
      return 'bg-marine/20 text-marine';
    case 'user':
      return 'bg-gold/20 text-ink';
    default:
      return 'bg-ink/10 text-ink/70';
  }
}

export function getDecisionTypeClasses(type) {
  switch (type) {
    case 'warning':
      return 'bg-clay/20 text-clay';
    case 'research':
      return 'bg-marine/20 text-marine';
    case 'question':
      return 'bg-gold/20 text-ink';
    case 'decision':
      return 'bg-moss/20 text-moss';
    default:
      return 'bg-ink/10 text-ink/70';
  }
}

export function getTodoStateClasses(state) {
  switch (state) {
    case 'in-progress':
      return 'bg-marine/20 text-white';
    case 'blocked':
      return 'bg-clay/20 text-white';
    case 'done':
      return 'bg-moss/20 text-white';
    default:
      return 'bg-white/20 text-white';
  }
}

export function splitMarkdownSections(markdown) {
  if (!markdown) {
    return {};
  }

  const lines = markdown.split('\n');
  const sections = {};
  let currentHeading = 'Overview';
  let currentLines = [];

  const flushSection = () => {
    if (currentLines.length > 0) {
      sections[currentHeading] = currentLines.join('\n').trim();
    }
  };

  lines.forEach((line) => {
    const match = line.match(/^##\s+(.*)$/);

    if (match) {
      flushSection();
      currentHeading = match[1].trim();
      currentLines = [line];
      return;
    }

    currentLines.push(line);
  });

  flushSection();
  return sections;
}

export function countOpenTodos(todos) {
  return todos.filter((todo) => todo.state !== 'done').length;
}

export function countDangerZones(status) {
  if (!status?.files) {
    return 0;
  }

  return Object.values(status.files).filter(
    (file) => file.status === 'danger',
  ).length;
}
