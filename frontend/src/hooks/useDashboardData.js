import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import {
  generateHandoffRequest,
  queryDevlogRequest,
  restoreSnapshotRequest,
} from '../lib/api';

const HAS_API_BASE_URL = Boolean(import.meta.env.VITE_API_BASE_URL);

export function useDashboardData() {
  // Connection state
  const [connectionMode, setConnectionMode] = useState('connecting');
  const [connectionError, setConnectionError] = useState(null);

  // Data state - NO MOCK DATA, start empty
  const [timeline, setTimeline] = useState([]);
  const [devlog, setDevlog] = useState({
    content: '# DevLog\n\nConnecting to Firestore...',
    lastUpdated: null
  });
  const [decisions, setDecisions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [todos, setTodos] = useState([]);
  const [status, setStatus] = useState({
    projectHealth: 'connecting',
    lastUpdated: null
  });

  // Query/handoff state
  const [queryResult, setQueryResult] = useState({ answer: '', sources: [] });
  const [queryPending, setQueryPending] = useState(false);
  const [handoffDocument, setHandoffDocument] = useState({ content: '' });
  const [handoffPending, setHandoffPending] = useState(false);
  const [restorePending, setRestorePending] = useState(false);

  // Real-time Firestore listeners - NO MOCK FALLBACK
  useEffect(() => {
    console.log('='.repeat(60));
    console.log('🔥 FIRESTORE CONNECTION STARTING');
    console.log('='.repeat(60));

    // Check if Firebase is configured
    if (!isFirebaseConfigured || !db) {
      const error = 'Firebase not configured - check .env file';
      console.error('❌ ERROR:', error);
      setConnectionMode('error');
      setConnectionError(error);
      return undefined;
    }

    console.log('✅ Firebase configured');
    console.log('📍 Project:', import.meta.env.VITE_FIREBASE_PROJECT_ID);

    try {
      // 1. Listen to CHANGES collection
      const changesQuery = query(
        collection(db, 'changes'),
        orderBy('timestamp', 'desc'),
        limit(30)
      );

      const unsubChanges = onSnapshot(
        changesQuery,
        (snapshot) => {
          console.log('\n📊 CHANGES SNAPSHOT:');
          console.log('   Docs count:', snapshot.docs.length);
          console.log('   Empty?', snapshot.empty);

          if (snapshot.empty) {
            console.log('⚠️  No changes yet in Firestore');
            setTimeline([]);
          } else {
            const data = snapshot.docs.map(doc => {
              const raw = doc.data();
              console.log('   Change doc:', doc.id, raw);
              return {
                id: doc.id,
                file: raw.file || raw.file_path || 'unknown',
                timestamp: raw.timestamp,
                classification: raw.classification || 'feature',
                summary: raw.summary || 'No summary',
                danger: Boolean(raw.danger),
                agent: raw.agent || 'DevLog AI',
              };
            });
            console.log('   Processed:', data.length, 'changes');
            console.log('CHANGES DATA:', JSON.stringify(data, null, 2));
            setTimeline(data);
          }

          setConnectionMode('live');
          setConnectionError(null);
        },
        (error) => {
          console.error('❌ CHANGES ERROR:', error.message);
          console.error('   Full error:', error);
          setConnectionError(error.message);
        }
      );

      // 2. Listen to DEVLOG/current document
      const unsubDevlog = onSnapshot(
        doc(db, 'devlog', 'current'),
        (snapshot) => {
          console.log('\n📄 DEVLOG SNAPSHOT:');
          console.log('   Exists?', snapshot.exists());

          if (snapshot.exists()) {
            const raw = snapshot.data();
            console.log('   Data:', raw);
            const data = {
              id: snapshot.id,
              content: raw.content || '# DevLog\n\nNo content yet',
              lastUpdated: raw.lastUpdated || raw.last_updated || raw.timestamp,
            };
            console.log('DEVLOG DATA:', data);
            setDevlog(data);
          } else {
            console.log('⚠️  devlog/current does not exist yet');
            setDevlog({
              content: '# DevLog\n\nNo data yet. Waiting for first change...',
              lastUpdated: new Date().toISOString()
            });
          }
        },
        (error) => {
          console.error('❌ DEVLOG ERROR:', error.message);
          console.error('   Full error:', error);
        }
      );

      // 3. Listen to DECISIONS collection
      const decisionsQuery = query(
        collection(db, 'decisions'),
        orderBy('timestamp', 'desc'),
        limit(20)
      );

      const unsubDecisions = onSnapshot(
        decisionsQuery,
        (snapshot) => {
          console.log('\n💡 DECISIONS SNAPSHOT:');
          console.log('   Docs count:', snapshot.docs.length);

          if (snapshot.empty) {
            console.log('⚠️  No decisions yet');
            setDecisions([]);
          } else {
            const data = snapshot.docs.map(doc => {
              const raw = doc.data();
              return {
                id: doc.id,
                timestamp: raw.timestamp || raw.createdAt,
                source: raw.source || 'Unknown',
                type: raw.type || 'decision',
                summary: raw.summary || raw.content || 'No summary',
                details: raw.details || raw.reason || '',
              };
            });
            console.log('DECISIONS DATA:', data);
            setDecisions(data);
          }
        },
        (error) => {
          console.error('❌ DECISIONS ERROR:', error.message);
        }
      );

      // 4. Listen to STATUS/current document
      const unsubStatus = onSnapshot(
        doc(db, 'status', 'current'),
        (snapshot) => {
          console.log('\n🏥 STATUS SNAPSHOT:');
          console.log('   Exists?', snapshot.exists());

          if (snapshot.exists()) {
            const raw = snapshot.data();
            console.log('   Data:', raw);
            const data = {
              projectHealth: raw.projectHealth || raw.project_health || 'healthy',
              lastUpdated: raw.lastUpdated || raw.last_updated || raw.timestamp,
              files: raw.files || {},
            };
            console.log('STATUS DATA:', data);
            setStatus(data);
          } else {
            console.log('⚠️  status/current does not exist yet');
            setStatus({
              projectHealth: 'healthy',
              lastUpdated: new Date().toISOString(),
              files: {}
            });
          }
        },
        (error) => {
          console.error('❌ STATUS ERROR:', error.message);
        }
      );

      // 5. Listen to SNAPSHOTS collection
      const snapshotsQuery = query(
        collection(db, 'snapshots'),
        orderBy('timestamp', 'desc'),
        limit(12)
      );

      const unsubSnapshots = onSnapshot(
        snapshotsQuery,
        (snapshot) => {
          console.log('\n📸 SNAPSHOTS SNAPSHOT:', snapshot.docs.length, 'docs');

          const data = snapshot.docs.map(doc => {
            const raw = doc.data();
            return {
              id: doc.id,
              timestamp: raw.timestamp || raw.createdAt,
              reason: raw.reason || 'snapshot',
              title: raw.title || raw.reason || 'Unnamed snapshot',
              summary: raw.summary || 'No summary',
              content: raw.content || '',
            };
          });
          console.log('SNAPSHOTS DATA:', data);
          setSnapshots(data);
        },
        (error) => {
          console.error('❌ SNAPSHOTS ERROR:', error.message);
        }
      );

      // 6. Listen to TODOS collection
      const todosQuery = query(
        collection(db, 'todos'),
        orderBy('updatedAt', 'desc'),
        limit(12)
      );

      const unsubTodos = onSnapshot(
        todosQuery,
        (snapshot) => {
          console.log('\n✅ TODOS SNAPSHOT:', snapshot.docs.length, 'docs');

          const data = snapshot.docs.map(doc => {
            const raw = doc.data();
            return {
              id: doc.id,
              title: raw.title || raw.text || raw.task || 'Untitled',
              state: raw.state || raw.status || 'todo',
              updatedAt: raw.updatedAt || raw.updated_at || raw.timestamp,
            };
          });
          console.log('TODOS DATA:', data);
          setTodos(data);
        },
        (error) => {
          console.error('❌ TODOS ERROR:', error.message);
        }
      );

      console.log('\n✅ All Firestore listeners active!');
      console.log('='.repeat(60));

      // Cleanup function
      return () => {
        console.log('🔌 Disconnecting Firestore listeners');
        unsubChanges();
        unsubDevlog();
        unsubDecisions();
        unsubStatus();
        unsubSnapshots();
        unsubTodos();
      };

    } catch (error) {
      console.error('❌ FAILED TO SET UP LISTENERS:', error);
      setConnectionMode('error');
      setConnectionError(error.message);
      return undefined;
    }
  }, []);

  // Query API
  const askDevlog = async (question) => {
    setQueryPending(true);
    try {
      if (HAS_API_BASE_URL) {
        const response = await queryDevlogRequest(question);
        setQueryResult(response);
      } else {
        setQueryResult({
          answer: 'API URL not configured. Set VITE_API_BASE_URL in .env',
          sources: ['error'],
        });
      }
    } catch (error) {
      setQueryResult({
        answer: `Query failed: ${error.message}`,
        sources: ['error'],
      });
    } finally {
      setQueryPending(false);
    }
  };

  // Generate handoff
  const generateHandoff = async () => {
    setHandoffPending(true);
    try {
      if (HAS_API_BASE_URL) {
        const response = await generateHandoffRequest();
        setHandoffDocument(response);
      } else {
        setHandoffDocument({
          content: 'API URL not configured. Set VITE_API_BASE_URL in .env',
        });
      }
    } catch (error) {
      setHandoffDocument({
        content: `Handoff generation failed: ${error.message}`,
      });
    } finally {
      setHandoffPending(false);
    }
  };

  // Restore snapshot
  const restoreSnapshot = async (snapshot) => {
    setRestorePending(true);
    try {
      if (HAS_API_BASE_URL) {
        await restoreSnapshotRequest(snapshot.id);
        setQueryResult({
          answer: `Restored snapshot: ${snapshot.title}`,
          sources: ['snapshots'],
        });
      } else {
        setQueryResult({
          answer: 'API URL not configured',
          sources: ['error'],
        });
      }
    } catch (error) {
      setQueryResult({
        answer: `Restore failed: ${error.message}`,
        sources: ['error'],
      });
    } finally {
      setRestorePending(false);
    }
  };

  return {
    connectionMode,
    connectionError,
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
