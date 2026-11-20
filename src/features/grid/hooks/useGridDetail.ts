import { useEffect, useState } from 'react';
import { getGridDetail } from '../api/gridDetailApi';
import type { GridDetail } from '../types/gridDetail';

interface RequestState {
  key: string;
  data: GridDetail | null;
  error: string | null;
}

export function useGridDetail(
  datasetId: number | undefined,
  gridId: string | null,
  enabled = true,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RequestState | null>(null);
  const key = JSON.stringify([datasetId, gridId, attempt]);
  const active = enabled && datasetId != null && gridId !== null;

  useEffect(() => {
    if (!active || datasetId == null || gridId === null) return;
    const controller = new AbortController();
    getGridDetail(datasetId, gridId, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: null });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error: error instanceof Error ? error.message : '상세 조회에 실패했습니다.',
          });
      },
    );
    return () => controller.abort();
  }, [active, datasetId, gridId, key]);

  // 선택이 바뀐 첫 렌더부터 이전 격자의 값을 숨긴다.
  const current = active && result?.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: active && current === null,
    retry: () => setAttempt((value) => value + 1),
  };
}
