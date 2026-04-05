function asTimestamp(value) {
  if (!value) {
    return null;
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function normalizeChange(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    file: data.file ?? data.filePath ?? 'unknown file',
    timestamp: asTimestamp(data.timestamp ?? data.createdAt),
    classification: data.classification ?? data.type ?? 'feature',
    summary: data.summary ?? data.description ?? 'No summary provided.',
    danger: Boolean(data.danger ?? data.isDangerZone),
    agent: data.agent ?? 'Gemini summary',
  };
}

export function normalizeDecision(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    timestamp: asTimestamp(data.timestamp ?? data.createdAt),
    source: data.source ?? 'Unknown',
    type: data.type ?? 'decision',
    summary: data.summary ?? data.title ?? 'No summary provided.',
    details: data.details ?? data.reason ?? '',
  };
}

export function normalizeSnapshot(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    timestamp: asTimestamp(data.timestamp ?? data.createdAt),
    reason: data.reason ?? 'snapshot',
    title: data.title ?? data.label ?? 'Unnamed snapshot',
    summary: data.summary ?? 'No summary provided.',
    content: data.content ?? data.payload ?? JSON.stringify(data, null, 2),
  };
}

export function normalizeTodo(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    title: data.title ?? data.task ?? 'Untitled todo',
    state: data.state ?? data.status ?? 'todo',
    updatedAt: asTimestamp(data.updatedAt ?? data.timestamp ?? data.createdAt),
  };
}

export function normalizeDevlog(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    lastUpdated: asTimestamp(data.lastUpdated ?? data.timestamp ?? data.updatedAt),
    content:
      data.content ??
      data.markdown ??
      data.projectMd ??
      '# DevLog\n\nNo markdown content published yet.',
  };
}

export function normalizeStatus(snapshot) {
  const data = snapshot.data();

  return {
    projectHealth: data.projectHealth ?? 'unknown',
    lastUpdated: asTimestamp(data.lastUpdated ?? data.timestamp ?? data.updatedAt),
    files: data.files ?? {},
  };
}
