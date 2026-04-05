function isoMinutesAgo(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export const mockTimeline = [
  {
    id: 'change-1',
    timestamp: isoMinutesAgo(3),
    file: 'frontend/src/components/TimelinePanel.jsx',
    classification: 'feature',
    summary:
      'Added the real-time timeline card stack so every file save can turn into a visible story beat during the demo.',
    danger: false,
    agent: 'Gemini summary',
  },
  {
    id: 'change-2',
    timestamp: isoMinutesAgo(11),
    file: 'backend/gemini.py',
    classification: 'fix',
    summary:
      'Tightened the diff summarizer prompt to keep change summaries short enough for the dashboard feed.',
    danger: false,
    agent: 'Gemini summary',
  },
  {
    id: 'change-3',
    timestamp: isoMinutesAgo(18),
    file: 'watcher.py',
    classification: 'breaking',
    summary:
      'Watcher debounce failed on rapid saves, which could spam the backend and duplicate timeline entries.',
    danger: true,
    agent: 'Danger zone',
  },
  {
    id: 'change-4',
    timestamp: isoMinutesAgo(32),
    file: 'extension/src/sidebar.ts',
    classification: 'config',
    summary:
      'Connected the extension sidebar to the shared status schema so color states can match the dashboard.',
    danger: false,
    agent: 'Gemini summary',
  },
];

export const mockDevlog = {
  id: 'current',
  lastUpdated: isoMinutesAgo(5),
  content: `# DevLog AI

## Overview

DevLog AI turns raw coding activity into a running project memory. The demo flow centers on a file save triggering backend analysis, pushing a live update to Firestore, and reflecting that update in both the dashboard and VS Code extension.

## Frontend

- React dashboard scaffold is live with a split view for timeline and project memory.
- Query, handoff, and snapshot surfaces are in place so the demo script can stay on one screen.
- Firestore listeners are wired behind env vars and fall back to mock data while backend setup is still in flight.

## Backend

- FastAPI endpoints still need to publish real \`/query\`, \`/handoff\`, and \`/restore\` responses.
- Status data should land in \`status/current\` using the shared schema.
- Change documents should contain file path, classification, summary, timestamp, and danger metadata.

## Todos

- Finish Firebase project setup and replace mock env values.
- Connect the deployed Cloud Run base URL once backend deployment is ready.
- Confirm snapshot restore endpoint contract before the demo.`,
};

export const mockDecisions = [
  {
    id: 'decision-1',
    timestamp: isoMinutesAgo(7),
    source: 'Claude Code',
    type: 'decision',
    summary: 'Use `status/current` as the canonical status document.',
    details:
      'This keeps the dashboard and extension on the same predictable path and avoids collection-scanning on every render.',
  },
  {
    id: 'decision-2',
    timestamp: isoMinutesAgo(14),
    source: 'ChatGPT',
    type: 'research',
    summary: 'Mock-first dashboard approach approved.',
    details:
      'The UI can be demoed immediately while backend endpoints are still stabilizing, which lowers the integration risk for the first team sync.',
  },
  {
    id: 'decision-3',
    timestamp: isoMinutesAgo(26),
    source: 'User',
    type: 'warning',
    summary: 'The handoff generator needs to be visually polished.',
    details:
      'This is one of the high-drama demo moments, so the modal and copy action should feel finished even before final backend wiring.',
  },
];

export const mockSnapshots = [
  {
    id: 'snapshot-1',
    timestamp: isoMinutesAgo(21),
    reason: 'pre-demo',
    title: 'Stable dashboard layout',
    summary:
      'Saved after the split-view layout and decision filters were working together without overlap issues.',
    content:
      'Snapshot captured with timeline, living document tabs, and decisions panel all rendering cleanly.\n\nUse this restore point if later styling experiments break the demo surface.',
  },
  {
    id: 'snapshot-2',
    timestamp: isoMinutesAgo(47),
    reason: 'rollback',
    title: 'Before query streaming experiment',
    summary:
      'Safe point kept in case streaming `/query` gets too risky and we need to fall back to standard POST + response.',
    content:
      'Backend integration was still mocked at this point.\n\nRecommended restore only if live query handling starts destabilizing the rest of the dashboard.',
  },
];

export const mockTodos = [
  {
    id: 'todo-1',
    title: 'Swap mock data for Firestore listeners after Firebase project setup',
    state: 'in-progress',
    updatedAt: isoMinutesAgo(9),
  },
  {
    id: 'todo-2',
    title: 'Validate backend `/restore` payload once Vibhor ships the endpoint',
    state: 'blocked',
    updatedAt: isoMinutesAgo(16),
  },
  {
    id: 'todo-3',
    title: 'Polish the handoff modal for the final demo rehearsal',
    state: 'done',
    updatedAt: isoMinutesAgo(28),
  },
];

export const mockStatus = {
  projectHealth: 'yellow',
  lastUpdated: isoMinutesAgo(4),
  files: {
    'watcher.py': {
      status: 'danger',
      reason: 'Debounce logic is still duplicating rapid save events.',
      lastChanged: isoMinutesAgo(18),
      classification: 'breaking',
    },
    'frontend/src/App.jsx': {
      status: 'working',
      reason: 'Dashboard shell is rendering correctly in mock mode.',
      lastChanged: isoMinutesAgo(5),
      classification: 'feature',
    },
  },
};

export function fallbackQueryResult(question = 'What broke last?') {
  return {
    answer:
      question.toLowerCase().includes('broke')
        ? 'The latest risky change was in `watcher.py`, where the debounce path can still duplicate rapid save events and create noisy timeline updates.'
        : 'Mock mode is active, so this answer is being generated from local sample data until the FastAPI `/query` endpoint is available.',
    sources: ['devlog/current', 'changes', 'status/current'],
  };
}

export function fallbackHandoff() {
  return {
    content: `DevLog AI Handoff

Current health: yellow
Last key risk: watcher debounce can still duplicate rapid save events.

Frontend status:
- Dashboard scaffold is live in React with timeline, markdown panel, decisions feed, query box, snapshots drawer, and handoff modal.
- Mock mode is enabled by default so the UI remains demoable before Firebase and Cloud Run are connected.

Next steps:
- Add real Firebase env vars and switch VITE_USE_MOCK_DATA=false.
- Connect /query, /handoff, and /restore to the deployed FastAPI backend.
- Run one end-to-end rehearsal using a real file save and decision log write.`,
  };
}
