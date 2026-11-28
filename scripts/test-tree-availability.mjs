import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const port = 5196;
const server = await createServer({
  server: { port, strictPort: true, open: false },
  plugins: [
    {
      name: 'tree-availability-test',
      resolveId(id) {
        if (id === '/__trees-entry.js') return '\0trees-entry';
      },
      load(id) {
        if (id === '\0trees-entry')
          return `import React from 'react';import {createRoot} from 'react-dom/client';import VworldMap from '/src/features/map/components/VworldMap.tsx';import '/src/styles/typography.css';createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(VworldMap)));`;
      },
      configureServer(dev) {
        dev.middlewares.use('/__trees', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await dev.transformIndexHtml(
              '/__trees',
              '<!doctype html><html lang="ko"><meta charset="utf-8"><div id="root"></div><script type="module" src="/__trees-entry.js"></script></html>',
            ),
          );
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/vworld-preview.html?embedded=1', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><script>window.commands=[];addEventListener('message',event=>{if(event.data?.command)window.commands.push(event.data.command)});</script>`,
    }),
  );
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 503, json: { success: false } }),
  );
  await page.goto(`http://localhost:${port}/__trees`);
  const unit = await page.evaluate(async () => {
    const { treeAvailabilityGrids, createTreeAvailabilityLayer } =
      await import('/src/features/map/layers/createTreeAvailabilityLayer.ts');
    const { getAvailability } = await import('/src/features/simulation/api/simulationApi.ts');
    const availability = await getAvailability(new AbortController().signal);
    const dataset = {
      datasetId: 1,
      code: availability.datasetCode,
      gridVersion: { code: availability.gridVersion },
      referenceTime: `${availability.date}T02:10:00Z`,
    };
    const ids = Object.keys(availability.trees);
    const grids = ids.map((gridId, i) => ({
      gridId,
      areaM2: 900,
      lstC: 40,
      boundary: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [126.65 + i * 0.0003, 37.45],
              [126.6502 + i * 0.0003, 37.45],
              [126.6502 + i * 0.0003, 37.4502],
              [126.65 + i * 0.0003, 37.45],
            ],
          ],
        ],
      },
    }));
    const data = { datasetId: 1, count: grids.length, grids };
    const original = JSON.stringify(data);
    const check = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const available = treeAvailabilityGrids(dataset, data, availability);
    check(available.length === ids.length, 'All available grids must be joined');
    for (const [d, g] of [
      [{ ...dataset, referenceTime: '2025-01-01' }, data],
      [{ ...dataset, code: 'other' }, data],
      [dataset, { ...data, datasetId: 2 }],
      [dataset, { ...data, grids: grids.slice(1) }],
      [dataset, { ...data, grids: [...grids, grids[0]] }],
    ]) {
      let rejected = false;
      try {
        treeAvailabilityGrids(d, g, availability);
      } catch {
        rejected = true;
      }
      check(rejected, 'Mixed versions, missing and duplicate grids must fail');
    }
    let source,
      picked,
      focusCalls = 0,
      removed = 0,
      renderCalls = 0;
    const C = {
      CustomDataSource: class {
        constructor() {
          this.show = false;
          this.entities = {
            values: [],
            add(value) {
              this.values.push(value);
            },
          };
        }
      },
      Color: { fromCssColorString: (value) => value, WHITE: 'white' },
      Cartesian3: { fromDegrees: (x, y) => ({ x, y }), fromDegreesArray: (values) => values },
      HeightReference: { CLAMP_TO_GROUND: 1 },
      BoundingSphere: { fromPoints: () => ({ radius: 500 }) },
      HeadingPitchRange: class {
        constructor(h, p, r) {
          this.range = r;
        }
      },
    };
    const viewer = {
      dataSources: {
        add(value) {
          source = value;
          return Promise.resolve(value);
        },
        remove(value, destroy) {
          check(value === source && destroy, 'Only own data source must be removed');
          removed++;
        },
      },
      scene: {
        requestRender() {
          renderCalls++;
        },
        pick() {
          return picked;
        },
      },
      camera: {
        cancelFlight() {},
        flyToBoundingSphere(_sphere, options) {
          check(options.offset.range >= 1000, 'Focus must retain useful viewing distance');
          focusCalls++;
        },
      },
    };
    const layer = createTreeAvailabilityLayer(C, viewer, available);
    check(
      source.entities.values.filter((entity) => entity.point).length === ids.length,
      'One marker per available grid',
    );
    check(
      source.entities.values.every((entity) => !entity.polygon),
      'Do not recolor temperature surfaces',
    );
    check(
      source.entities.values.filter((entity) => entity.polyline).length === ids.length,
      'Every grid must have a boundary',
    );
    picked = { id: { id: `tree-available:${ids[0]}` } };
    check(!layer.pickGrid({}), 'Hidden markers must not select');
    layer.focus();
    check(focusCalls === 0, 'Hidden markers must not move camera');
    layer.setVisible(true);
    check(layer.pickGrid({})?.gridId === ids[0], 'Marker clicks must select matching grid');
    picked = { id: { id: `tree-available:${ids[1]}:0:0` } };
    check(layer.pickGrid({})?.gridId === ids[1], 'Boundary clicks must select matching grid');
    picked = { id: { id: 'selected-grid' } };
    check(!layer.pickGrid({}), 'Unrelated clicks must fall through');
    layer.focus();
    check(focusCalls === 1, 'Focus must be explicit');
    layer.setVisible(false);
    check(!source.show, 'Toggle must hide source');
    layer.destroy();
    check(removed === 1, 'Layer must release its source');
    check(JSON.stringify(data) === original, 'Original grid data must remain unchanged');
    return { count: ids.length, renderCalls };
  });
  assert.equal(unit.count, 26, 'Current supplied availability has 26 eligible grids');
  const frame = page.frames().find((frame) => frame.url().includes('vworld-preview.html'));
  assert.ok(frame);
  const emit = (event) =>
    frame.evaluate(
      (event) =>
        window.parent.postMessage({ channel: 'urban-heat-vworld', event }, location.origin),
      event,
    );
  const checkbox = page.getByRole('switch', { name: '가로수 식재 가능 격자', exact: false });
  assert.equal(await checkbox.isDisabled(), true);
  const dataset = {
    datasetId: 1,
    code: 'mch30_platform_fixed_v2',
    referenceTime: '2026-06-16T02:10:00Z',
    gridVersion: { code: 'mch30_v1' },
    region: { regionId: 1, name: '미추홀구' },
  };
  await emit({ type: 'ready', dataset, colorStops: [], count: 28258, missing: 47 });
  await emit({ type: 'tree-availability', count: 26, error: null });
  await page.getByText('26개', { exact: true }).waitFor();
  assert.equal(await checkbox.isChecked(), false);
  const waitCommand = (command) =>
    frame.waitForFunction(
      (command) => window.commands.some((c) => JSON.stringify(c) === JSON.stringify(command)),
      command,
    );
  await waitCommand({ type: 'tree-availability', visible: false });
  await page.locator('.tree-toggle-track').click();
  assert.equal(await checkbox.isChecked(), true);
  await waitCommand({ type: 'tree-availability', visible: true });
  await page.locator('.tree-toggle-track').click();
  assert.equal(await checkbox.isChecked(), false);
  await waitCommand({ type: 'tree-availability', visible: false });
  await page.getByRole('button', { name: '가능 격자 모아보기', exact: false }).click();
  await waitCommand({ type: 'focus-tree-availability' });
  assert.equal(await checkbox.isChecked(), true);
  await frame.evaluate(() => {
    window.commands = [];
  });
  await page.getByRole('button', { name: '고령 인구와 시설', exact: true }).click();
  await waitCommand({ type: 'tree-availability', visible: false });
  assert.equal(await checkbox.count(), 0);
  await page.getByRole('button', { name: '열환경 조회', exact: true }).click();
  await waitCommand({ type: 'tree-availability', visible: true });
  // Parent-window spoofing cannot change a frame-owned marker count.
  await page.evaluate(() =>
    window.postMessage(
      {
        channel: 'urban-heat-vworld',
        event: { type: 'tree-availability', count: 999, error: null },
      },
      location.origin,
    ),
  );
  await page.waitForTimeout(50);
  assert.equal(await page.getByText('999개', { exact: true }).count(), 0);
  await emit({ type: 'tree-availability', count: 0, error: '위치 자료 조회 실패' });
  await page.getByText('위치 자료 조회 실패', { exact: true }).waitFor();
  assert.equal(await checkbox.isDisabled(), true);
  assert.equal(
    await page.getByRole('button', { name: '가능 격자 모아보기', exact: false }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole('checkbox', { name: '관측 지표면온도', exact: false }).isEnabled(),
    true,
    'Optional marker failure must not disable heatmap',
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: ${unit.count} supplied eligible IDs, version/missing/duplicate rejection, marker and boundary picks, visibility/focus/cleanup, original grid preservation, default-off controls, mode isolation, message-source validation, independent failure.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
