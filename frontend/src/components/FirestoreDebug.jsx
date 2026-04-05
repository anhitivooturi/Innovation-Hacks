import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function FirestoreDebug() {
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!db) {
        console.error('Firebase not initialized');
        return;
      }

      try {
        const results = {};

        // Fetch changes
        const changesSnap = await getDocs(collection(db, 'changes'));
        results.changes = changesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Fetch decisions
        const decisionsSnap = await getDocs(collection(db, 'decisions'));
        results.decisions = decisionsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log('🔍 FIRESTORE DEBUG DATA:', results);
        setCollections(results);
        setLoading(false);
      } catch (error) {
        console.error('Debug fetch error:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="panel">
        <h3 className="text-lg font-semibold mb-4">🔍 Firestore Debug</h3>
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3 className="text-lg font-semibold mb-4">🔍 Firestore Debug</h3>

      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Changes Collection:</h4>
          <pre className="bg-ink/5 p-3 rounded text-xs overflow-auto max-h-60">
            {JSON.stringify(collections.changes || [], null, 2)}
          </pre>
          <p className="text-sm text-ink/60 mt-1">
            Count: {collections.changes?.length || 0}
          </p>
        </div>

        <div>
          <h4 className="font-medium mb-2">Decisions Collection:</h4>
          <pre className="bg-ink/5 p-3 rounded text-xs overflow-auto max-h-60">
            {JSON.stringify(collections.decisions || [], null, 2)}
          </pre>
          <p className="text-sm text-ink/60 mt-1">
            Count: {collections.decisions?.length || 0}
          </p>
        </div>
      </div>
    </div>
  );
}
