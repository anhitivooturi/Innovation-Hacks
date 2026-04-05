import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import {
  fallbackHandoff,
  fallbackQueryResult,
  mockDecisions,
  mockDevlog,
  mockSnapshots,
  mockStatus,
  mockTimeline,
  mockTodos,
} from '../lib/mockData';
import {
  normalizeChange,
  normalizeDecision,
  normalizeDevlog,
  normalizeSnapshot,
  normalizeStatus,
  normalizeTodo,
} from '../lib/normalizers';
import {
  generateHandoffRequest,
  queryDevlogRequest,
  restoreSnapshotRequest,
} from '../lib/api';

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA !== 'false';
const HAS_API_BASE_URL = Boolean(import.meta.env.VITE_API_BASE_URL);

export function useDashboardData() {
  const [timeline, setTimeline] = useState(mockTimeline);
  const [devlog, setDevlog] = useState(mockDevlog);
  const [decisions, setDecisions] = useState(mockDecisions);
  const [snapshots, setSnapshots] = useState(mockSnapshots);
  const [todos, setTodos] = useState(mockTodos);
  const [status, setStatus] = useState(mockStatus);
  const [queryResult, setQueryResult] = useState(fallbackQueryResult);
  const [queryPending, setQueryPending] = useState(false);
  const [handoffDocument, setHandoffDocument] = useState(fallbackHandoff);
  const [handoffPending, setHandoffPending] = useState(false);
  const [restorePending, setRestorePending] = useState(false);

  const firestoreLiveMode = useMemo(
    () => Boolean(!USE_MOCK_DATA && isFirebaseConfigured && db),
    [],
  );
  const apiLiveMode = useMemo(() => !USE_MOCK_DATA && HAS_API_BASE_URL, []);

  useEffect(() => {
    if (!firestoreLiveMode) {
      return undefined;
    }

    const changesQuery = query(
      collection(db, 'changes'),
      orderBy('timestamp', 'desc'),
      limit(30),
    );
    const decisionsQuery = query(
      collection(db, 'decisions'),
      orderBy('timestamp', 'desc'),
      limit(20),
    );
    const snapshotsQuery = query(
      collection(db, 'snapshots'),
      orderBy('timestamp', 'desc'),
      limit(12),
    );
    const todosQuery = query(
      collection(db, 'todos'),
      orderBy('updatedAt', 'desc'),
      limit(12),
    );

    const unsubscribers = [
      onSnapshot(changesQuery, (snapshot) => {
        setTimeline(snapshot.docs.map(normalizeChange));
      }),
      onSnapshot(decisionsQuery, (snapshot) => {
        setDecisions(snapshot.docs.map(normalizeDecision));
      }),
      onSnapshot(snapshotsQuery, (snapshot) => {
        setSnapshots(snapshot.docs.map(normalizeSnapshot));
      }),
      onSnapshot(todosQuery, (snapshot) => {
        setTodos(snapshot.docs.map(normalizeTodo));
      }),
      onSnapshot(doc(db, 'devlog', 'current'), (snapshot) => {
        if (snapshot.exists()) {
          setDevlog(normalizeDevlog(snapshot));
        }
      }),
      onSnapshot(doc(db, 'status', 'current'), (snapshot) => {
        if (snapshot.exists()) {
          setStatus(normalizeStatus(snapshot));
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [firestoreLiveMode]);

  const askDevlog = async (question) => {
    setQueryPending(true);

    try {
      const response = apiLiveMode
        ? await queryDevlogRequest(question)
        : fallbackQueryResult(question);
      setQueryResult(response);
    } catch (_error) {
      setQueryResult({
        answer:
          'The backend query request failed, so the dashboard fell back to mock answer text. Check VITE_API_BASE_URL and the FastAPI service.',
        sources: ['query fallback'],
      });
    } finally {
      setQueryPending(false);
    }
  };

  const generateHandoff = async () => {
    setHandoffPending(true);

    try {
      const response = apiLiveMode
        ? await generateHandoffRequest()
        : fallbackHandoff();
      setHandoffDocument(response);
    } catch (_error) {
      setHandoffDocument({
        content:
          'Handoff generation failed against the backend, so this modal is showing a fallback note. Verify the `/handoff` endpoint and API base URL.',
      });
    } finally {
      setHandoffPending(false);
    }
  };

  const restoreSnapshot = async (snapshot) => {
    setRestorePending(true);

    try {
      if (apiLiveMode) {
        await restoreSnapshotRequest(snapshot.id);
      } else {
        setQueryResult({
          answer: `Mock restore triggered for "${snapshot.title}". Hook this action to POST /restore once the backend endpoint is live.`,
          sources: ['snapshots', 'mock mode'],
        });
      }
    } catch (_error) {
      setQueryResult({
        answer:
          'Snapshot restore failed against the backend. Keep the UI as-is for now and verify the `/restore` contract before the demo.',
        sources: ['restore fallback'],
      });
    } finally {
      setRestorePending(false);
    }
  };

  return {
    connectionMode: firestoreLiveMode ? 'firebase' : 'mock',
    timeline,
    devlog,
    decisions,
    snapshots,
    todos,
    status,
    queryResult,
    queryPending,
    handoffDocument,
    handoffPending,
    restorePending,
    askDevlog,
    generateHandoff,
    restoreSnapshot,
  };
}
