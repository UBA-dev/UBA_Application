"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueAction, getQueuedActions, removeQueuedAction } from "./offlineQueue";

type ProcessorMap = Record<string, (payload: any) => Promise<void>>;

// Reusable hook: monitors connection status, keeps a pending-sync count,
// and syncs queued offline actions back to Firestore (auto + manual).
export function useOfflineSync(processors: ProcessorMap) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const processorsRef = useRef(processors);
  processorsRef.current = processors;

  const refreshPendingCount = useCallback(async () => {
    try {
      const actions = await getQueuedActions();
      setPendingCount(actions.length);
    } catch (err) {
      console.error("Failed to read offline queue:", err);
    }
  }, []);

  const enqueue = useCallback(
    async (type: string, payload: any) => {
      await enqueueAction(type, payload);
      await refreshPendingCount();
    },
    [refreshPendingCount]
  );

  const syncNow = useCallback(async () => {
    if (syncing || typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    try {
      const actions = await getQueuedActions();
      const sorted = [...actions].sort((a, b) => a.id - b.id);
      for (const action of sorted) {
        const processor = processorsRef.current[action.type];
        if (!processor) {
          console.warn(`No processor registered for offline action type "${action.type}"`);
          continue;
        }
        try {
          await processor(action.payload);
          await removeQueuedAction(action.id);
        } catch (err) {
          console.error(`Failed to sync offline action ${action.id} (${action.type}):`, err);
          break; // Stop here, retry the rest later
        }
      }
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }
  }, [syncing]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOnline, pendingCount, syncing, enqueue, syncNow, refreshPendingCount };
}