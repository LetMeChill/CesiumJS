export interface LstColorStop {
  temperature: number;
  rgb: readonly number[];
}

// 전체 고정 데이터셋의 유효값으로 한 번 계산한다. 화면 범위·줌에 따라 재계산하지 않는다.
// 5·20·40·60·80·95백분위에 색을 대응해 지역 내 상대 차이를 강조한다.
export function getRelativeLstStops(values: readonly (number | null)[]): LstColorStop[] {
  const sorted = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!sorted.length) return [...LST_COLOR_STOPS];
  const quantile = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index),
      upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  const uniform = sorted[0] === sorted[sorted.length - 1];
  return [0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map((p, i) => ({
    temperature: uniform ? sorted[0] - 1 + i * 0.4 : quantile(p),
    rgb: LST_COLOR_STOPS[i].rgb,
  }));
}

// 관측 LST(℃)의 표시 색상이다. 위험등급이나 더 세밀한 관측값을 뜻하지 않는다.
export const LST_COLOR_STOPS = [
  { temperature: 30, rgb: [37, 99, 235] },
  { temperature: 34, rgb: [6, 182, 212] },
  { temperature: 38, rgb: [34, 197, 94] },
  { temperature: 42, rgb: [250, 204, 21] },
  { temperature: 46, rgb: [249, 115, 22] },
  { temperature: 50, rgb: [220, 38, 38] },
] as const;

export const MISSING_LST_COLOR = '#94a3b8';
export const LST_FILL_OPACITY = 0.5;

// 격자 간 온도를 보간하지 않고, 각 격자의 실제 온도에 해당하는 색상만 보간한다.
export function getLstColor(
  lstC: number | null,
  stops: readonly LstColorStop[] = LST_COLOR_STOPS,
): string {
  if (lstC === null || !Number.isFinite(lstC)) return MISSING_LST_COLOR;

  const first = stops[0];
  if (lstC <= first.temperature) return `rgb(${first.rgb.join(',')})`;

  for (let i = 1; i < stops.length; i++) {
    const lower = stops[i - 1];
    const upper = stops[i];
    if (lstC <= upper.temperature) {
      const fraction = (lstC - lower.temperature) / (upper.temperature - lower.temperature);
      const rgb = lower.rgb.map((channel, index) =>
        Math.round(channel + (upper.rgb[index] - channel) * fraction),
      );
      return `rgb(${rgb.join(',')})`;
    }
  }

  const last = stops[stops.length - 1];
  return `rgb(${last.rgb.join(',')})`;
}
