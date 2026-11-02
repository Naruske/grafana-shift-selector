import fs from 'fs';
import path from 'path';
import * as grafanaData from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { getShifts, parseShiftData, startHourIsGreater, transformShiftData } from './utils';

describe('Grafana 13 Contract & Generalization Eval Suite', () => {
  const repoRoot = path.resolve(__dirname, '..');

  describe('Manifest & Dependency Contract', () => {
    it('enforces Grafana 13 and React 19 in package.json and removes discontinued @grafana/toolkit', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

      expect(pkg.dependencies['@grafana/data']).toMatch(/^\^?13\./);
      expect(pkg.dependencies['@grafana/runtime']).toMatch(/^\^?13\./);
      expect(pkg.dependencies['@grafana/ui']).toMatch(/^\^?13\./);
      expect(pkg.dependencies['react']).toMatch(/^\^?19\./);
      expect(pkg.dependencies['react-dom']).toMatch(/^\^?19\./);
      expect(pkg.dependencies['@grafana/toolkit']).toBeUndefined();
      expect(pkg.devDependencies['@grafana/e2e-selectors']).toMatch(/^\^?13\./);
    });

    it('enforces Grafana 13 dependency in src/plugin.json and docker-compose.yaml', () => {
      const pluginJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'plugin.json'), 'utf8'));
      expect(pluginJson.dependencies.grafanaDependency).toBe('>=13.0.0');
      expect(pluginJson.dependencies.grafanaVersion).toBeUndefined();

      const dockerCompose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yaml'), 'utf8');
      expect(dockerCompose).toContain('${GRAFANA_VERSION:-13.3.0}');
    });

    it('externalizes react/jsx-runtime in webpack.config.ts for Grafana 13 shared runtime', () => {
      const webpackConfig = fs.readFileSync(
        path.join(repoRoot, '.config', 'webpack', 'webpack.config.ts'),
        'utf8'
      );
      expect(webpackConfig).toContain("'react/jsx-runtime'");
      expect(webpackConfig).toContain("'react/jsx-dev-runtime'");
    });

    it('verifies react-datepicker v8 and built dist/module.js have no React 19 incompatible findDOMNode calls', () => {
      const datepickerEntry = path.join(repoRoot, 'node_modules', 'react-datepicker', 'dist', 'index.js');
      expect(fs.existsSync(datepickerEntry)).toBe(true);
      const datepickerSource = fs.readFileSync(datepickerEntry, 'utf8');
      expect(datepickerSource).not.toContain('findDOMNode');

      const bundlePath = path.join(repoRoot, 'dist', 'module.js');
      if (fs.existsSync(bundlePath)) {
        const bundleContent = fs.readFileSync(bundlePath, 'utf8');
        expect(bundleContent).not.toContain('findDOMNode');
        expect(bundleContent).toContain('"@grafana/data"');
        expect(bundleContent).toContain('"@grafana/runtime"');
        expect(bundleContent).toContain('"react"');
        expect(bundleContent).toContain('"react/jsx-runtime"');
      }
    });
  });

  describe('Grafana 13 Upstream SDK Symbol Contract', () => {
    it('verifies all @grafana/data and @grafana/runtime runtime symbols used by the plugin exist in v13', () => {
      expect(typeof grafanaData.PanelPlugin).toBe('function');
      expect(typeof grafanaData.dateTime).toBe('function');
      expect(typeof grafanaData.dateTimeAsMoment).toBe('function');
      expect( grafanaData.LoadingState).toBeDefined();

      expect(typeof grafanaRuntime.getBackendSrv).toBe('function');
      expect(typeof grafanaRuntime.getDataSourceSrv).toBe('function');
      expect(typeof grafanaRuntime.toDataQueryResponse).toBe('function');
      expect(typeof grafanaRuntime.getTemplateSrv).toBe('function');
      expect(grafanaRuntime.locationService).toBeDefined();
      expect(grafanaRuntime.RefreshEvent).toBeDefined();
      expect(grafanaRuntime.config).toBeDefined();
    });
  });

  describe('Shift Calculation Generalization Across Time & Group Permutations', () => {
    const shiftCases = [
      {
        name: 'standard morning shift (06:00-14:00) at 08:30 UTC',
        prodIso: '2025-07-10T08:30:00Z',
        start: '06:00:00',
        end: '14:00:00',
        expectedStart: '2025-07-10 06:00:00',
        expectedEnd: '2025-07-10 14:00:00',
      },
      {
        name: 'overnight night shift (22:00-06:00) selected during evening (23:00 UTC)',
        prodIso: '2025-07-10T23:00:00Z',
        start: '22:00:00',
        end: '06:00:00',
        expectedStart: '2025-07-10 22:00:00',
        expectedEnd: '2025-07-11 06:00:00',
      },
      {
        name: 'overnight night shift (22:00-06:00) selected during early morning (03:00 UTC)',
        prodIso: '2025-07-10T03:00:00Z',
        start: '22:00:00',
        end: '06:00:00',
        expectedStart: '2025-07-09 22:00:00',
        expectedEnd: '2025-07-10 06:00:00',
      },
    ];

    it.each(shiftCases)('computes accurate shift bounds for $name', ({ prodIso, start, end, expectedStart, expectedEnd }) => {
      const prodMs = grafanaData.dateTime(prodIso).valueOf();
      const hasNextDay = startHourIsGreater(start, end);
      const result = transformShiftData(
        {
          uuid: 'eval-shift',
          label: 'Eval Shift',
          shiftGroupName: 'EvalGroup',
          shiftGroupUUID: 'eval-group',
          start,
          end,
          order: 1,
          index: 0,
        },
        hasNextDay,
        prodMs
      );

      expect(result._.startDate).toBe(expectedStart);
      expect(result._.endDate).toBe(expectedEnd);
      expect(result._.timeStamps[1]).toBeGreaterThan(result._.timeStamps[0]);
      expect(result._.timeStamps[1] - result._.timeStamps[0]).toBe(8 * 3600 * 1000);
    });

    it('handles multi-group shift matrices with label trimming and ordering', () => {
      const options = [
        { selected: false, text: 'Line 1 Shift B', value: 'u-2' },
        { selected: false, text: 'Line 1 Shift A', value: 'u-1' },
        { selected: false, text: 'Line 2 Shift C', value: 'u-3' },
      ];
      const values = [
        { selected: false, text: 'Line 1|g-1|u-1|06:00:00|14:00:00|1', value: 'u-1' },
        { selected: false, text: 'Line 1|g-1|u-2|14:00:00|22:00:00|2', value: 'u-2' },
        { selected: false, text: 'Line 2|g-2|u-3|22:00:00|06:00:00|1', value: 'u-3' },
      ];

      const prodMs = grafanaData.dateTime('2025-07-10T12:00:00Z').valueOf();
      const grouped = getShifts(options, values, prodMs, true);

      expect(Object.keys(grouped)).toEqual(['g-1', 'g-2']);
      expect(grouped['g-1'].map((s) => s.label)).toEqual(['Shift B', 'Shift A']);
      expect(grouped['g-2'].map((s) => s.label)).toEqual(['Shift C']);
      expect(parseShiftData('u-2', values)?.order).toBe(2);
    });
  });
});
