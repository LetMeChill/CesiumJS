import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';

// Fully mocked: no model credits, remote services, or source data modifications.
const port = 5195;
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import PolicyWorkspace from '/src/features/simulation/components/PolicyWorkspace.tsx';
import '/src/styles/typography.css';
const root=createRoot(document.getElementById('root'));
window.showPolicy=()=>root.render(React.createElement(React.StrictMode,null,React.createElement(PolicyWorkspace,{
dataset:{datasetId:1,code:'mch30_platform_fixed_v2',referenceTime:'2026-06-16T02:10:00Z',gridVersion:{code:'mch30_v1'},region:{name:'인천광역시 미추홀구'}},
selected:{gridId:'A',areaM2:900,lstC:45,boundary:{type:'MultiPolygon',coordinates:[[[[126.6,37.4],[126.61,37.4],[126.6,37.41],[126.6,37.4]]]]}},onClose:()=>root.unmount()})));
window.showPolicy();`;
const server = await createServer({
  server: { port, strictPort: true, open: false },
  plugins: [
    {
      name: 'range-test',
      resolveId(id) {
        if (id === '/__range-entry.js') return '\0range-entry';
      },
      load(id) {
        if (id === '\0range-entry') return entry;
      },
      configureServer(dev) {
        dev.middlewares.use('/__ranges', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await dev.transformIndexHtml(
              '/__ranges',
              '<!doctype html><html lang="ko"><meta charset="utf-8"><div id="root"></div><script type="module" src="/__range-entry.js"></script></html>',
            ),
          );
        });
      },
    },
  ],
});
const meta = {
  date: '2026-06-16',
  datasetCode: 'mch30_platform_fixed_v2',
  gridVersion: 'mch30_v1',
  sceneId: 'LC08_L2SP_116034_20260616_20260626_02_T1',
};
const grid = (id = 'A') => ({
  gridId: id,
  baselinePredictedLstC: 43,
  qualityStatus: 'SAME_DAY',
  reason: null,
  sourceDates: ['2026-06-16'],
});
const rangeGrid = (id = 'A') => ({
  ...grid(id),
  scenarioPredictedLstLowerC: 42.4,
  scenarioPredictedLstUpperC: 43.2,
  deltaLstLowerC: -0.6,
  deltaLstUpperC: 0.2,
});
const xaiGrid = (id = 'A') => ({
  ...grid(id),
  qualityStatus: 'PRIOR_SUPPORTED',
  reason: 'HIGH_AEROSOL',
  scenarioPredictedLstC: 42.6,
  deltaLstC: -0.4,
  explanation: {
    method: 'TWO_FEATURE_SHAPLEY',
    indexSourceDate: '2026-06-16',
    ndvi: { before: 0.1, after: 0.2, contributionC: -0.26 },
    ndmi: { before: 0.1, after: 0.2, contributionC: -0.14 },
  },
});
function response(policy, xai = false) {
  const roof = policy === 'green-roof';
  const rows = (roof ? ['A'] : xai ? ['A', 'B'] : ['B', 'A']).map((id) => ({
    ...(xai ? xaiGrid(id) : rangeGrid(id)),
    ...(roof ? { appliedRoofAreaM2: 100 } : { newCanopyAreaM2: 20 }),
  }));
  if (!roof && !xai)
    Object.assign(
      rows.find((g) => g.gridId === 'B'),
      {
        scenarioPredictedLstLowerC: 41,
        scenarioPredictedLstUpperC: 42,
        deltaLstLowerC: -2,
        deltaLstUpperC: -1,
      },
    );
  return {
    success: true,
    result: {
      ...meta,
      scenarioVersion: xai
        ? 'representative_v1'
        : roof
          ? 'mch30_green_roof_area_20260616_p10p90_v1'
          : 'mch30_street_tree_lst_20260616_p10p90_v1',
      ...(roof && xai ? { grid: rows[0] } : { grids: rows }),
      ...(!roof ? { treeCount: 2, affectedGridCount: 2, totalNewCanopyAreaM2: 40 } : {}),
    },
  };
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/grids/*/analysis', (route) =>
    route.fulfill({
      json: {
        success: true,
        result: {
          datasetId: 1,
          gridId: 'A',
          status: 'COMPLETE',
          cached: true,
          factorIds: [],
          model: null,
          generatedAt: null,
          summary:
            '선택 격자의 관측 지표면온도는 동일 자료의 격자 평균보다 약 2.8℃ 높습니다. 상대적으로 높은 불투수 피복 비율, 상대적으로 낮은 산림 및 초지 비율이 확인됩니다.',
          evidence: {
            observedAt: '2026-06-16T02:10:14Z',
            selected: { datasetId: 1, gridId: 'A', lstC: 43.5 },
            comparedGridCount: 28211,
            meanLstC: 40.7,
            medianLstC: 40.8,
            percentile: 83,
            differenceFromMeanC: 2.8,
            comparisonScope: '동일 자료',
            limitation: '관측 지표 비교',
          },
        },
      },
    }),
  );
  await page.route('**/data/policy-availability-20260616.json', (r) =>
    r.fulfill({
      json: {
        ...meta,
        roofAreas: { A: 100 },
        trees: { A: { maxTreeCount: 2, maxNewCanopyAreaM2: 40, status: 'DEMO_ESTIMATE' } },
      },
    }),
  );
  let mode = 'normal',
    rangeCalls = 0,
    xaiCalls = 0,
    release;
  await page.route('**/simulations/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const xai = path.endsWith('/explain');
    const policy = path.includes('street-trees') ? 'street-trees' : 'green-roof';
    const body = route.request().postDataJSON();
    assert.deepEqual(
      body,
      policy === 'green-roof' && xai ? { gridId: 'A' } : { selectedGridIds: ['A'] },
    );
    if (xai) xaiCalls++;
    else rangeCalls++;
    if (!xai && mode === 'slow')
      await new Promise((resolve) => {
        release = resolve;
      });
    if ((!xai && mode === 'range-failure') || (xai && mode === 'xai-failure'))
      return route.fulfill({ status: 503, json: { success: false } });
    const data = response(policy, xai);
    if (!xai && mode === 'unavailable')
      Object.assign(
        data.result.grids.find((g) => g.gridId === 'A'),
        {
          qualityStatus: 'UNAVAILABLE',
          reason: 'RANGE_MIX_INFEASIBLE',
          scenarioPredictedLstLowerC: null,
          scenarioPredictedLstUpperC: null,
          deltaLstLowerC: null,
          deltaLstUpperC: null,
        },
      );
    await route.fulfill({ json: data }).catch(() => {});
  });
  const open = () => page.goto(`http://localhost:${port}/__ranges`);
  const run = async () => {
    await page.getByRole('button', { name: '적용 규모 확인', exact: false }).click();
    await page.getByRole('button', { name: '예측 결과 비교', exact: false }).click();
  };
  const waitFor = () =>
    page.locator('.policy-range-metric').first().getByText('식생 표본의 10~90분위').waitFor();
  const metrics = page.locator('.policy-metrics');
  await open();
  await run();
  await waitFor();
  assert.match(await metrics.innerText(), /42.40\s*~\s*43.20/);
  assert.match(await metrics.innerText(), /−0.60\s*~\s*\+0.20/);
  await page.getByText('−0.26℃', { exact: true }).waitFor();
  await page.locator('.grid-analysis-evidence dl > div').last().waitFor();
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const fit = await page.evaluate(() => {
      const last = document.querySelector('.grid-analysis-evidence').getBoundingClientRect();
      const footer = document.querySelector('.policy-footer').getBoundingClientRect();
      return {
        bottom: last.bottom,
        footerTop: footer.top,
        scrollTop: document.querySelector('.policy-workspace').scrollTop,
      };
    });
    assert.equal(fit.scrollTop, 0, 'Results must start without scrolling');
    assert.ok(
      fit.bottom <= fit.footerTop,
      `All three result sections must fit at ${viewport.width}x${viewport.height}: ${JSON.stringify(fit)}`,
    );
    if (process.env.RANGE_SCREENSHOT_DIR) {
      await mkdir(process.env.RANGE_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: `${process.env.RANGE_SCREENSHOT_DIR}/compact-${viewport.width}x${viewport.height}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const colors = await metrics
    .locator('.policy-range-metric')
    .last()
    .locator('strong > span')
    .evaluateAll((spans) =>
      spans
        .filter((s) => !s.classList.contains('policy-range-separator'))
        .map((s) => getComputedStyle(s).color),
    );
  assert.notEqual(colors[0], colors[1], 'Negative and positive bounds must have different colors');
  const out = process.env.RANGE_SCREENSHOT_DIR;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/roof-range.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await metrics.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
    'Mobile metrics must fit',
  );
  if (out) await page.screenshot({ path: `${out}/roof-range-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  mode = 'range-failure';
  await open();
  await run();
  await page.getByRole('button', { name: '범위 다시 불러오기' }).waitFor();
  await page.getByText('−0.26℃', { exact: true }).waitFor();
  const count = xaiCalls;
  mode = 'normal';
  await page.getByRole('button', { name: '범위 다시 불러오기' }).click();
  await waitFor();
  assert.equal(xaiCalls, count, 'Range retry must not repeat XAI');
  mode = 'xai-failure';
  await open();
  await run();
  await waitFor();
  await page.getByText('예측을 완료하지 못했습니다.', { exact: true }).waitFor();
  assert.match(await metrics.innerText(), /−0.60\s*~\s*\+0.20/);
  mode = 'unavailable';
  await open();
  await run();
  await page
    .getByText('현재 공간 조건으로 식생 표본의 예측 범위를 계산할 수 없습니다.', { exact: false })
    .waitFor();
  await page.getByText('−0.26℃', { exact: true }).waitFor();
  assert.equal(await metrics.getByText('범위 계산 불가', { exact: true }).count(), 2);
  mode = 'normal';
  await open();
  await page.getByRole('button', { name: '가로수 식재', exact: false }).click();
  await run();
  await waitFor();
  const b = page.locator('.policy-neighbors tbody tr').filter({ hasText: 'B' });
  assert.match(
    await b.innerText(),
    /41.00\s*~\s*42.00/,
    'Neighbor bounds must match gridId, not array index',
  );
  if (out) await page.screenshot({ path: `${out}/trees-range.png`, fullPage: true });
  // A late response from an abandoned policy must never replace the new policy.
  mode = 'slow';
  await open();
  await run();
  await page.getByText('−0.26℃', { exact: true }).waitFor();
  await page.getByRole('button', { name: '다른 정책 검토', exact: true }).click();
  await page.getByRole('button', { name: '가로수 식재', exact: false }).click();
  mode = 'normal';
  release?.();
  await run();
  await waitFor();
  await page.locator('.policy-neighbors').waitFor();
  // Exercise response validation directly through the same browser module.
  await page.unroute('**/simulations/**');
  let fixture = response('green-roof');
  await page.route('**/simulations/green-roof', (route) => route.fulfill({ json: fixture }));
  const valid = () =>
    page.evaluate(async () => {
      const api = await import('/src/features/simulation/api/simulationApi.ts');
      try {
        await api.simulateRanges(1, 'A', 'green-roof', new AbortController().signal);
        return true;
      } catch {
        return false;
      }
    });
  for (const [name, mutate] of [
    ['reversed bounds', (d) => (d.result.grids[0].deltaLstLowerC = 1)],
    ['inconsistent temperature', (d) => (d.result.grids[0].scenarioPredictedLstLowerC = 20)],
    ['missing bound', (d) => delete d.result.grids[0].deltaLstLowerC],
    ['wrong selected grid', (d) => (d.result.grids[0].gridId = 'C')],
    ['duplicate grid', (d) => d.result.grids.push(d.result.grids[0])],
    [
      'old scalar response',
      (d) => {
        delete d.result.grids[0].deltaLstUpperC;
        d.result.grids[0].deltaLstC = -0.4;
      },
    ],
    ['wrong scene', (d) => (d.result.sceneId = 'other')],
    ['wrong scenario', (d) => (d.result.scenarioVersion = 'older')],
    ['unavailable must not be zero', (d) => (d.result.grids[0].qualityStatus = 'UNAVAILABLE')],
  ]) {
    fixture = response('green-roof');
    mutate(fixture);
    assert.equal(await valid(), false, name);
  }
  fixture = response('green-roof');
  assert.equal(await valid(), true);
  // Optional offline replay of actual production responses, collected separately.
  if (process.env.RANGE_LIVE_FIXTURE_DIR) {
    await page.unroute('**/simulations/green-roof');
    for (const policy of ['green-roof', 'street-trees']) {
      const live = JSON.parse(
        (
          await readFile(`${process.env.RANGE_LIVE_FIXTURE_DIR}/live-${policy}.json`, 'utf8')
        ).replace(/^\uFEFF/, ''),
      );
      await page.route(`**/simulations/${policy}{,/explain}`, (route) =>
        route.fulfill({
          json: route.request().url().endsWith('/explain') ? live.explanation : live.range,
        }),
      );
      const actual = await page.evaluate(
        async ({ policy, gridId }) => {
          const api = await import('/src/features/simulation/api/simulationApi.ts');
          const signal = new AbortController().signal;
          const [ranges, explanation] = await Promise.all([
            api.simulateRanges(1, gridId, policy, signal),
            api.simulate(1, gridId, policy, signal),
          ]);
          return {
            matched: api.matchingSimulationInputs(explanation, ranges),
            count: ranges.grids.length,
          };
        },
        { policy, gridId: live.gridId },
      );
      assert.equal(actual.matched, true, `${policy}: real production inputs must match`);
      console.log(`PASS: ${policy} real production response replay (${actual.count} grids).`);
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: roof/tree request contracts, quantile display, crossing zero/colors, responsive metrics, independent failures and retry, unavailable ranges with valid XAI, neighbor identity matching, stale request isolation, nine malformed-response cases. ${rangeCalls} range / ${xaiCalls} XAI mock calls.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
