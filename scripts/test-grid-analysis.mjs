import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

// Every data request is intercepted. Automatic-generation tests never spend real credits.
const port = 5194;
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>열환경 설명 검증</title>
<body style="margin:32px;max-width:1000px"><div id="root"></div>
<script type="module" src="/__grid-analysis-entry.js"></script></body></html>`;
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import GridAnalysisBox from '/src/features/grid/analysis/GridAnalysisBox.tsx';
import PolicyWorkspace from '/src/features/simulation/components/PolicyWorkspace.tsx';
import '/src/styles/typography.css';
const root = createRoot(document.getElementById('root'));
const render = element => root.render(React.createElement(React.StrictMode,null,element));
window.showGrid = gridId => render(React.createElement(GridAnalysisBox,{datasetId:1,gridId}));
window.showPolicy = () => render(React.createElement(PolicyWorkspace, {
  dataset:{datasetId:1,code:'mch30_platform_fixed_v2',referenceTime:'2026-06-16T02:10:00Z',gridVersion:{code:'mch30_v1'},region:{regionId:1}},
  selected:{gridId:'A',areaM2:900,lstC:45},onClose:()=>root.unmount()
}));
window.showGrid('A');`;
const server = await createServer({
  server: { port, strictPort: true, open: false },
  plugins: [
    {
      name: 'analysis-ui-test',
      resolveId(id) {
        if (id === '/__grid-analysis-entry.js') return '\0analysis-harness';
      },
      load(id) {
        if (id === '\0analysis-harness') return entry;
      },
      configureServer(dev) {
        dev.middlewares.use('/__grid-analysis-test', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(await dev.transformIndexHtml('/__grid-analysis-test', html));
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  let mode = 'READY';
  let posts = 0;
  let gets = 0;
  let slowRelease;
  const sample = (gridId, status = mode) => ({
    datasetId: 1,
    gridId,
    status,
    cached: false,
    factorIds: [],
    model: null,
    generatedAt: null,
    summary:
      status === 'COMPLETE'
        ? `선택 격자 ${gridId}의 관측 지표면온도는 동일 자료의 격자 평균보다 약 5.0℃ 높습니다. 상대적으로 높은 불투수 피복 비율, 상대적으로 낮은 산림 및 초지 비율이 확인됩니다. 온도 차이와 함께 살펴볼 단서이며 원인으로 단정할 수 없습니다.`
        : null,
    evidence: {
      observedAt: '2026-06-16T02:10:00Z',
      selected: { datasetId: 1, gridId, lstC: 45 },
      comparedGridCount: 3,
      meanLstC: 40,
      medianLstC: 40,
      percentile: 83.33,
      differenceFromMeanC: 5,
      comparisonScope: '동일 데이터셋의 유효 관측값 비교입니다.',
      limitation: '인과관계나 정책 효과를 검증한 결과가 아닙니다.',
    },
  });
  await page.route('**/v1/datasets/1/grids/*/analysis', async (route) => {
    const grid = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2));
    const post = route.request().method() === 'POST';
    if (post) posts++;
    else gets++;
    if (post && mode === 'SLOW')
      await new Promise((resolve) => {
        slowRelease = resolve;
      });
    if (mode === 'HTTP_FAILURE') return route.fulfill({ status: 503, body: 'unavailable' });
    const data = sample(
      mode === 'MISMATCH' ? 'WRONG' : grid,
      post ? 'COMPLETE' : mode === 'SLOW' ? 'READY' : mode,
    );
    await route.fulfill({ json: { success: true, result: data } }).catch(() => {});
  });

  const open = () => page.goto(`http://localhost:${port}/__grid-analysis-test`);
  const waitText = (text) => page.getByText(text, { exact: false }).first().waitFor();
  await open();
  await waitText('선택 격자 A의 관측');
  assert.equal(gets, 1, 'StrictMode must share the initial evidence request');
  assert.equal(posts, 1, 'StrictMode must not duplicate automatic generation');
  assert.equal(
    await page.getByRole('button', { name: '열환경 설명 생성', exact: true }).count(),
    0,
  );
  await page
    .getByRole('heading', { name: '3. 선택한 격자 지표면 온도 원인 분석', exact: true })
    .waitFor();
  await page.getByText('45.0℃', { exact: true }).waitFor();
  assert.equal(await page.locator('details').count(), 0);
  assert.equal(await page.locator('.grid-analysis-summary u').count(), 2);
  assert.equal(
    await page.locator('.grid-analysis-summary u').nth(0).textContent(),
    '평균보다 약 5.0℃',
  );
  assert(
    (await page.locator('.grid-analysis-summary u').nth(1).textContent()).includes(
      '높은 불투수 피복 비율',
    ),
  );
  for (const removed of [
    '정책 적용 전 관측 자료의 비교입니다.',
    '온도 차이와 함께 살펴볼 단서이며 원인으로 단정할 수 없습니다.',
    '인과관계나 정책 효과를 검증한 결과가 아닙니다.',
  ]) {
    assert.equal(await page.getByText(removed, { exact: false }).count(), 0);
  }
  const out = process.env.ANALYSIS_SCREENSHOT_DIR;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/automatic-analysis-box.png`, fullPage: true });
  }
  let before = posts;
  mode = 'COMPLETE';
  await open();
  await waitText('선택 격자 A의 관측');
  assert.equal(posts, before, 'A server-cached result must skip generation');
  mode = 'NOT_CONFIGURED';
  await open();
  await waitText('분석 기능을 연결 중');
  assert.equal(posts, before);
  assert.equal(await page.getByRole('button').count(), 0);
  mode = 'INSUFFICIENT_DATA';
  await open();
  await waitText('비교 자료가 부족');
  assert.equal(posts, before);
  mode = 'LIMIT_REACHED';
  await open();
  await waitText('생성 한도에 도달');
  assert.equal(posts, before);
  assert.equal(await page.getByRole('button').count(), 0);
  mode = 'MISMATCH';
  await open();
  await waitText('분석 요청이 완료되지 않았습니다.');
  assert.equal(posts, before);
  assert.equal(await page.getByText('선택 격자 WRONG', { exact: false }).count(), 0);
  mode = 'READY';
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await waitText('선택 격자 A의 관측');
  assert.equal(posts, before + 1);
  mode = 'SLOW';
  const started = page.waitForRequest(
    (r) => r.url().endsWith('/grids/A/analysis') && r.method() === 'POST',
  );
  await open();
  await started;
  mode = 'READY';
  await page.evaluate(() => window.showGrid('B'));
  await waitText('선택 격자 B의 관측');
  slowRelease?.();
  assert.equal(await page.getByText('선택 격자 A의 관측', { exact: false }).count(), 0);
  mode = 'HTTP_FAILURE';
  await open();
  await waitText('분석 요청이 완료되지 않았습니다.');
  before = posts;
  await page.waitForTimeout(100);
  assert.equal(posts, before, 'Errors must not start a paid retry loop');
  mode = 'READY';
  await page.route('**/data/policy-availability-20260616.json', (route) =>
    route.fulfill({
      json: {
        datasetCode: 'mch30_platform_fixed_v2',
        gridVersion: 'mch30_v1',
        date: '2026-06-16',
        roofAreas: { A: 100 },
        trees: {},
      },
    }),
  );
  await page.route('**/simulations/green-roof/explain', (route) =>
    route.fulfill({
      status: 503,
      json: { success: false, code: 'SIMULATION503_1', message: 'test' },
    }),
  );
  const prefetched = page.waitForResponse(
    (r) => r.url().endsWith('/grids/A/analysis') && r.request().method() === 'POST',
  );
  await page.evaluate(() => window.showPolicy());
  await prefetched;
  assert.equal(posts, before + 1, 'The policy selection screen must prefetch automatically');
  assert.equal(
    await page.getByRole('heading', { name: '3. 선택한 격자 지표면 온도 원인 분석' }).count(),
    0,
    'Analysis stays out of policy selection UI',
  );
  await page.getByRole('button', { name: '적용 규모 확인', exact: false }).click();
  await page.getByRole('button', { name: '예측 결과 비교', exact: false }).click();
  await waitText('예측을 완료하지 못했습니다.');
  await waitText('옥상 면적 자료가 준비되지 않았습니다.');
  await waitText('선택 격자 A의 관측');
  assert.equal(posts, before + 1, 'Moving between policy steps must reuse the prefetched analysis');
  assert.equal(
    await page
      .getByRole('region', { name: '선택한 격자 지표면 온도 원인 분석', exact: true })
      .count(),
    1,
  );
  await page.getByText('45.0℃', { exact: true }).waitFor();
  if (out)
    await page.screenshot({ path: `${out}/automatic-analysis-policy-error.png`, fullPage: true });
  assert.deepEqual(consoleErrors, []);
  console.log(
    'PASS: automatic policy prefetch, StrictMode deduplication, cached/disabled/missing/limited states, retry, stale selection isolation, failure handling, visible evidence, underlines, removed copy, policy outage independence.',
  );
} finally {
  await browser?.close();
  await server.close();
}
