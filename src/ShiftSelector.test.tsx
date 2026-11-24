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
          from: '2025-05-15T06:00:00.000Z',
          to: '2025-05-15T14:00:00.000Z',
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
          from: '2025-05-15T06:00:00.000Z',
          to: '2025-05-15T22:00:00.000Z',
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

  it('does not re-trigger locationService.partial in a loop when SceneTimeRange or 5s refresh emits new timeRange instances', async () => {
    const props = createMockProps();
    const { rerender } = render(<ShiftSelector {...props} />);

    const morningButton = await screen.findByText('Morning Custom');
    fireEvent.click(morningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenCalledTimes(1);
    });

    // Simulate SceneTimeRange updating props.timeRange with fresh DateTime instances and 5s refresh ticks
    for (let tick = 1; tick <= 3; tick++) {
      const refreshedFrom = dateTime('2025-05-15T06:00:00Z');
      const refreshedTo = dateTime('2025-05-15T14:00:00Z');
      const nextProps = {
        ...createMockProps(),
        renderCounter: tick,
        timeRange: {
          from: refreshedFrom,
          to: refreshedTo,
          raw: { from: '2025-05-15T06:00:00.000Z', to: '2025-05-15T14:00:00.000Z' },
        },
      };
      rerender(<ShiftSelector {...nextProps} />);
    }

    expect(partialSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves a user-selected date in DatePicker across 5s dashboard refresh re-renders and applies that date on shift click', async () => {
    const props = createMockProps();
    const { container, rerender } = render(<ShiftSelector {...props} />);

    await screen.findByText('Morning Custom');

    const dateInput = container.querySelector('input.production-day-selector') as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
    expect(dateInput.value).toBe('2025-05-15');

    // Change the date in the DatePicker to 2025-06-24
    fireEvent.change(dateInput, { target: { value: '2025-06-24' } });
    expect(dateInput.value).toBe('2025-06-24');

    // Simulate a 5s auto-refresh re-render where props and timeRange are freshly instantiated at the old date
    const refreshedProps = {
      ...createMockProps(),
      renderCounter: 2,
      timeRange: {
        from: dateTime('2025-05-15T06:00:00Z'),
        to: dateTime('2025-05-15T14:00:00Z'),
        raw: { from: '2025-05-15T06:00:00.000Z', to: '2025-05-15T14:00:00.000Z' },
      },
    };
    rerender(<ShiftSelector {...refreshedProps} />);

    // The user's chosen date must not be reset back to 2025-05-15 by the refresh tick
    expect(dateInput.value).toBe('2025-06-24');

    // Clicking a shift button must use the newly selected date (2025-06-24)
    const morningButton = await screen.findByText('Morning Custom');
    fireEvent.click(morningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenCalledTimes(1);
      expect(partialSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2025-06-24T06:00:00.000Z',
          to: '2025-06-24T14:00:00.000Z',
          [vars.queryShiftsOptions]: 'shift_uuid_1',
        }),
        false
      );
    });
  });

  it('does not step the production date backwards when switching from a morning shift to an overnight shift', async () => {
    const props = createMockProps({
      var_query_map_static: JSON.stringify({
        static: {
          shifts: [
            {
              group: 'Blikkenlijn',
              group_uuid: 'uuid_2',
              uuid: 'shift_uuid_2',
              label: 'Ochtend',
              startTime: '05:00:00',
              endTime: '17:00:00',
              order: 1,
            },
            {
              group: 'Blikkenlijn',
              group_uuid: 'uuid_2',
              uuid: 'shift_uuid_1',
              label: 'Avond',
              startTime: '17:00:00',
              endTime: '05:00:00',
              order: 2,
            },
          ],
        },
      }),
    });
    const { rerender } = render(<ShiftSelector {...props} />);

    // Click Ochtend shift (05:00 - 17:00) on 2025-05-15 (where startHour 5 matches Avond endHour 5)
    const morningButton = await screen.findByText('Ochtend');
    fireEvent.click(morningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2025-05-15T05:00:00.000Z',
          to: '2025-05-15T17:00:00.000Z',
          [vars.queryShiftsOptions]: 'shift_uuid_2',
        }),
        false
      );
    });

    // Simulate Grafana updating props.timeRange.from to 2025-05-15T05:00:00.000Z (hour = 5)
    const afterMorningProps = {
      ...props,
      timeRange: {
        from: dateTime('2025-05-15T05:00:00Z'),
        to: dateTime('2025-05-15T17:00:00Z'),
        raw: { from: '2025-05-15T05:00:00.000Z', to: '2025-05-15T17:00:00.000Z' },
      },
    };
    rerender(<ShiftSelector {...afterMorningProps} />);

    // Now click Avond shift (17:00 - 05:00) on the same production day 2025-05-15
    const eveningButton = await screen.findByText('Avond');
    fireEvent.click(eveningButton);

    await waitFor(() => {
      expect(partialSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: '2025-05-15T17:00:00.000Z',
          to: '2025-05-16T05:00:00.000Z',
          [vars.queryShiftsOptions]: 'shift_uuid_1',
        }),
        false
      );
    });
  });

  it('defaults DatePicker to today (timeRange.to) instead of yesterday when dashboard opens on Last 24 hours (now-24h to now)', async () => {
    const yesterday = dateTime('2026-11-23T10:30:00Z');
    const today = dateTime('2026-11-24T10:30:00Z');
    const props = {
      ...createMockProps(),
      timeRange: {
        from: yesterday,
        to: today,
        raw: { from: 'now-24h', to: 'now' },
      },
    };

    const { container, rerender } = render(<ShiftSelector {...props} />);
    await screen.findByText('Morning Custom');

    const dateInput = container.querySelector('input.production-day-selector') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-11-24');

    // A 5s refresh tick under the same 'now-24h' to 'now' range must preserve a manually chosen date
    fireEvent.change(dateInput, { target: { value: '2026-11-20' } });
    rerender(
      <ShiftSelector
        {...props}
        renderCounter={1}
        timeRange={{
          from: dateTime('2026-11-23T10:30:05Z'),
          to: dateTime('2026-11-24T10:30:05Z'),
          raw: { from: 'now-24h', to: 'now' },
        }}
      />
    );
    expect(dateInput.value).toBe('2026-11-20');
  });
});
