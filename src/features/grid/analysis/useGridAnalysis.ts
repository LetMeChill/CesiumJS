import { useEffect, useState } from 'react';
import { getGridAnalysis, type GridAnalysis } from './gridAnalysisApi';

// Share in-flight work across StrictMode effects and result-panel mounts.
// Settled results are not cached here: fresh server evidence and its model-aware cache remain authoritative.
const pending = new Map<string, Promise<GridAnalysis>>();

function requestAnalysis(datasetId: number, gridId: string): Promise<GridAnalysis> {
  const identity = JSON.stringify([datasetId, gridId]);
  const existing = pending.get(identity);
  if (existing) return existing;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 22000);
  const operation = (async () => {
    try {
      const evidence = await getGridAnalysis(datasetId, gridId, false, controller.signal);
      if (evidence.status !== 'READY') return evidence;
      return await getGridAnalysis(datasetId, gridId, true, controller.signal);
    } finally {
      window.clearTimeout(timer);
    }
  })();
  pending.set(identity, operation);
  const release = () => {
    if (pending.get(identity) === operation) pending.delete(identity);
  };
  void operation.then(release, release);
  return operation;
}

export interface GridAnalysisState {
  data: GridAnalysis | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useGridAnalysis(datasetId: number, gridId: string): GridAnalysisState {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([datasetId, gridId, attempt]);
  const [state, setState] = useState<{
    key: string;
    data: GridAnalysis | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    // An unmounted subscriber stops receiving updates, while shared work can finish for the result panel.
    // Cancelling a browser request would not guarantee cancellation of provider billing.
    requestAnalysis(datasetId, gridId).then(
      (data) => {
        if (active) setState({ key, data, error: null });
      },
      () => {
        if (active)
          setState({
            key,
            data: null,
            error: '분석 요청이 완료되지 않았습니다. 잠시 후 다시 시도해주세요.',
          });
      },
    );
    return () => {
      active = false;
    };
  }, [datasetId, gridId, key]);
  const current = state?.key === key ? state : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}
