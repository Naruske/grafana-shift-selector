import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { dateTime, EventBusSrv, LoadingState, PanelProps } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { of, throwError } from 'rxjs';
import ShiftSelector from './ShiftSelector';
import { TPropOptions, vars } from './types';
import { plugin } from './module';

const createMockProps = (overrides: Partial<TPropOptions> = {}): PanelProps<TPropOptions> => {
  const from = dateTime('2025-05-15T06:00:00Z');
  const to = dateTime('2025-05-15T14:00:00Z');
  const timeRange = {
    from,
    to,
    raw: { from, to },
  };

  const defaultOptions: TPropOptions = {
    refreshInterval: '60000',
    _refreshInterval: '',
    isDataSourceShifts: false,
    isOptionGroupLabelTrimmed: false,
    isAutoSelectShift: false,
    autoSelectShiftGroup: '',
    isShowDayLabel: true,
    isShowTimeLabel: true,
    dayLabel: 'Select day',
    rangeLabelType: 'text-and-icon',
    shiftOptionsLabelType: 'text-and-icon',
    rangeOptionLabelStartEnd: 'Start-End',
    rangeOptionLabelStart: 'Start',
    rangeOptionLabelEnd: 'End',
    var_query_map_dynamic: JSON.stringify({
      project: {
        shift_groups: {
          name: 'name',
          uuid: 'uuid',
          site_uuid: 'site_uuid',
        },
        shifts: {
          uuid: 'uuid',
          start_time: 'start_time',
          end_time: 'end_time',
          order: 'shift_order',
          group_uuid: 'shift_group_uuid',
        },
      },
      lookup: {
        shifts: 'shifts',
        shift_groups: 'shift_groups',
      },
      schema: {
        shifts: 'shifts_schema',
        shift_groups: 'groups_schema',
      },
      values: {
        site_uuid: 'site-1',
      },
    }),
    var_query_map_static: JSON.stringify({
      static: {
        shifts: [
          {
            group: 'Group 1 Summer',
            group_uuid: 'uuid_1',
            uuid: 'shift_uuid_1',
            label: 'Morning Custom',
            startTime: '06:00:00',
            endTime: '14:00:00',
            order: '1',
          },
          {
            group: 'Group 2 Winter',
            group_uuid: 'uuid_2',
            uuid: 'shift_uuid_2',
            label: 'Afternoon Custom',
            startTime: '14:00:00',
            endTime: '22:00:00',
            order: '1',
          },
        ],
      },
    }),
    var_label_mapping: JSON.stringify({
      sunny: ['sabah', 'spät'],
      sunset: ['ikindi', 'früh'],
      night: ['akşam', 'nacht'],
    }),
    shiftSelectorPluginPanel: document.querySelectorAll('#nonexistent') as NodeListOf<HTMLDivElement>,
    isShowRangeButtons: true,
    isShowProductionDateSelector: true,
    isProgressbarVisible: true,
    isBlockedRender: false,
    ...overrides,
  };

  return {
    id: 1,
    data: {
      state: LoadingState.Done,
      series: [],
      timeRange,
    },
    timeRange,
    timeZone: 'utc',
    options: defaultOptions,
    onOptionsChange: jest.fn(),
    fieldConfig: { defaults: {}, overrides: [] },
    onFieldConfigChange: jest.fn(),
    replaceVariables: (str: string) => str,
    onChangeTimeRange: jest.fn(),
    eventBus: new EventBusSrv(),
    width: 800,
    height: 200,
    title: 'Shift Selector',
    transparent: false,
    renderCounter: 0,
  };
};

describe('ShiftSelector Panel (Grafana 13 & React 19)', () => {
  const from = dateTime('2025-05-15T06:00:00Z');
  const to = dateTime('2025-05-15T14:00:00Z');
  let partialSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    partialSpy = jest.spyOn(grafanaRuntime.locationService, 'partial').mockImplementation(jest.fn());
    jest.spyOn(grafanaRuntime.locationService, 'getSearch').mockReturnValue(new URLSearchParams());
    jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockReturnValue({
      getVariables: () => [],
      replace: (target?: string) => target || '',
      containsTemplate: () => false,
      updateTimeRange: jest.fn(),
      timeRange: { from, to, raw: { from, to } },
    } as any);
  });

  it('exports a valid Grafana 13 PanelPlugin instance from module.ts', () => {
    expect(plugin).toBeDefined();
    expect(plugin.panel).toBe(ShiftSelector);
  });

  it('renders static shifts, datepicker, and range buttons in React 19 without findDOMNode errors', async () => {
    const props = createMockProps();
    render(<ShiftSelector {...props} />);

    expect(await screen.findByText('Morning Custom')).toBeInTheDocument();
    expect(screen.getByText('Afternoon Custom')).toBeInTheDocument();
    expect(screen.getByText('Group 1 Summer')).toBeInTheDocument();
    expect(screen.getByText('Group 2 Winter')).toBeInTheDocument();
    expect(screen.getByText('Select day')).toBeInTheDocument();
    expect(screen.getByText('Start-End')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('updates dashboard time range via locationService.partial when a shift button is clicked', async () => {
    const props = createMockProps();
    render(<ShiftSelector {...props} />);

    const morningButton = await screen.findByText('Morning Custom');
    fireEvent.click(morningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: Date.UTC(2025, 4, 15, 6, 0, 0),
          to: Date.UTC(2025, 4, 15, 14, 0, 0),
          [vars.queryShiftsOptions]: 'shift_uuid_1',
        }),
        false
      );
    });
  });

  it('supports partial range updates when Start or End range buttons are selected', async () => {
    const existingEndMs = Date.UTC(2025, 4, 15, 22, 0, 0);
    jest
      .spyOn(grafanaRuntime.locationService, 'getSearch')
      .mockReturnValue(new URLSearchParams(`to=${existingEndMs}`));

    const props = createMockProps();
    render(<ShiftSelector {...props} />);

    const startRangeButton = await screen.findByText('Start');
    fireEvent.click(startRangeButton);

    const morningButton = await screen.findByText('Morning Custom');
    fireEvent.click(morningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: Date.UTC(2025, 4, 15, 6, 0, 0),
          to: existingEndMs,
          [vars.queryShiftsOptions]: undefined,
        }),
        false
      );
    });
  });

  it('fetches dynamic shifts using Grafana 13 UID-only datasource and array-backed Field.values', async () => {
    jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockReturnValue({
      getVariables: () => [
        {
          name: vars.varDataModel,
          current: { value: 'pg-shifts-uid' },
          options: [],
          query: '',
        },
        {
          name: vars.queryShiftsOptions,
          options: [
            { text: 'Plant A Morning', value: 'ds-shift-1', selected: false },
            { text: 'Plant A Evening', value: 'ds-shift-2', selected: false },
          ],
          current: { value: 'ds-shift-1' },
          query: '',
        },
      ],
      replace: (target?: string) => target || '',
      containsTemplate: () => false,
      updateTimeRange: jest.fn(),
      timeRange: { from, to, raw: { from, to } },
    } as any);

    // Grafana 13 DataSourceInstanceSettings with uid and type, without deprecated numeric id
    jest.spyOn(grafanaRuntime, 'getDataSourceSrv').mockReturnValue({
      getList: () => [
        {
          name: 'Postgres Shifts',
          uid: 'pg-shifts-uid',
          type: 'postgres',
        },
      ],
      get: jest.fn(),
      getInstanceSettings: jest.fn(),
      reload: jest.fn(),
    } as any);

    const fetchMock = jest.fn().mockReturnValue(of({ data: { results: {} } }));
    jest.spyOn(grafanaRuntime, 'getBackendSrv').mockReturnValue({
      fetch: fetchMock,
    } as any);

    // Grafana 13 DataFrame fields use standard JS arrays (no Vector.toArray method)
    jest.spyOn(grafanaRuntime, 'toDataQueryResponse').mockReturnValue({
      state: LoadingState.Done,
      data: [
        {
          refId: vars.varShiftsValuesName,
          fields: [
            { name: 'name', values: ['Plant A', 'Plant A'] },
            { name: 'group_uuid', values: ['grp-a', 'grp-a'] },
            { name: 'uuid', values: ['ds-shift-1', 'ds-shift-2'] },
            { name: 'start_time', values: ['06:00:00', '14:00:00'] },
            { name: 'end_time', values: ['14:00:00', '22:00:00'] },
            { name: 'shift_order', values: [1, 2] },
          ],
          length: 2,
        },
      ],
    });

    const props = createMockProps({
      isDataSourceShifts: true,
      isOptionGroupLabelTrimmed: true,
    });

    render(<ShiftSelector {...props} />);

    expect(await screen.findByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/ds/query',
        method: 'post',
        data: expect.objectContaining({
          queries: [
            expect.objectContaining({
              refId: vars.varShiftsValuesName,
              datasource: {
                uid: 'pg-shifts-uid',
                type: 'postgres',
              },
              rawSql: expect.stringContaining('FROM `shifts_schema`.`shifts` s'),
            }),
          ],
        }),
      })
    );
  });

  it('handles backend fetch failure gracefully with Alert 4 and no unhandled promise rejection', async () => {
    jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockReturnValue({
      getVariables: () => [
        {
          name: vars.varDataModel,
          current: { value: 'pg-shifts-uid' },
          options: [],
          query: '',
        },
        {
          name: vars.queryShiftsOptions,
          options: [{ text: 'Plant A Morning', value: 'ds-shift-1', selected: false }],
          current: { value: 'ds-shift-1' },
          query: '',
        },
      ],
      replace: (target?: string) => target || '',
      containsTemplate: () => false,
      updateTimeRange: jest.fn(),
      timeRange: { from, to, raw: { from, to } },
    } as any);

    jest.spyOn(grafanaRuntime, 'getDataSourceSrv').mockReturnValue({
      getList: () => [{ name: 'Postgres Shifts', uid: 'pg-shifts-uid', type: 'postgres' }],
      get: jest.fn(),
      getInstanceSettings: jest.fn(),
      reload: jest.fn(),
    } as any);

    jest.spyOn(grafanaRuntime, 'getBackendSrv').mockReturnValue({
      fetch: jest.fn().mockReturnValue(throwError(() => new Error('Database timeout'))),
    } as any);

    const props = createMockProps({ isDataSourceShifts: true });
    render(<ShiftSelector {...props} />);

    expect(await screen.findByText(/Service error: Database timeout/i)).toBeInTheDocument();
  });

  it('displays an error alert when shift mapping JSON is invalid and clears it when fixed', async () => {
    const invalidProps = createMockProps({
      var_query_map_static: '{invalid-json',
    });

    const { rerender } = render(<ShiftSelector {...invalidProps} />);

    expect(
      await screen.findByText(/Error! Invalid shift mapping\. Please checkout your "Data Mapper" panel/i)
    ).toBeInTheDocument();

    const validProps = createMockProps();
    rerender(<ShiftSelector {...validProps} />);

    expect(await screen.findByText('Morning Custom')).toBeInTheDocument();
    expect(
      screen.queryByText(/Error! Invalid shift mapping\. Please checkout your "Data Mapper" panel/i)
    ).not.toBeInTheDocument();
  });

  it('renders ProgressBar and hides manual datepicker when isAutoSelectShift (realtime mode) is enabled', async () => {
    const props = createMockProps({
      isAutoSelectShift: true,
      autoSelectShiftGroup: 'uuid_1',
      isProgressbarVisible: true,
      _refreshInterval: '5000',
    });

    const { container } = render(<ShiftSelector {...props} />);

    expect(await screen.findByText('Morning Custom')).toBeInTheDocument();
    expect(container.querySelector('[data-count]')).toBeInTheDocument();
    expect(screen.queryByText('Select day')).not.toBeInTheDocument();
  });
});
