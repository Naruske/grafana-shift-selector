import {
  buttonTypes,
  dateTimeFormat,
  getBreweryUUID,
  getHasNextDayShift,
  getInitGroupUUID,
  getRelativeDates,
  getShifts,
  parseShiftData,
  setTypeChangeHandler,
  shiftSelectHandler,
  startHourIsGreater,
  transformShiftData,
} from './utils';
import { locationService } from '@grafana/runtime';

describe('utils (Grafana 13 compatibility)', () => {
  const sampleValues = [
    {
      selected: false,
      text: 'Summer|group-1|shift-1|06:00:00|14:00:00|1',
      value: 'shift-1',
    },
    {
      selected: false,
      text: 'Summer|group-1|shift-2|14:00:00|22:00:00|2',
      value: 'shift-2',
    },
    {
      selected: false,
      text: 'Winter|group-2|shift-3|22:00:00|06:00:00|1',
      value: 'shift-3',
    },
  ];

  const sampleOptions = [
    { selected: false, text: 'Summer Morning', value: 'shift-1' },
    { selected: false, text: 'Summer Afternoon', value: 'shift-2' },
    { selected: false, text: 'Winter Night', value: 'shift-3' },
  ];

  describe('parseShiftData', () => {
    it('parses pipe-delimited shift values into structured fields', () => {
      const parsed = parseShiftData('shift-1', sampleValues);
      expect(parsed).toEqual({
        shiftGroupName: 'Summer',
        shiftGroupUUID: 'group-1',
        start: '06:00:00',
        end: '14:00:00',
        order: 1,
      });
    });

    it('returns null when shift uuid does not exist', () => {
      expect(parseShiftData('non-existent', sampleValues)).toBeNull();
    });
  });

  describe('startHourIsGreater & getHasNextDayShift', () => {
    it('detects overnight shifts where start hour > end hour', () => {
      expect(startHourIsGreater('22:00:00', '06:00:00')).toBe(true);
      expect(startHourIsGreater('06:00:00', '14:00:00')).toBe(false);
    });

    it('detects whether option list contains an overnight shift', () => {
      expect(getHasNextDayShift(sampleOptions, sampleValues)).toBe(true);
      expect(getHasNextDayShift(sampleOptions.slice(0, 2), sampleValues)).toBe(false);
    });
  });

  describe('transformShiftData & getShifts', () => {
    const fixedProductionDate = Date.UTC(2025, 4, 15, 10, 0, 0); // 2025-05-15T10:00:00Z

    it('transforms same-day shift dates using Grafana 13 DateTime wrapper', () => {
      const transformed = transformShiftData(
        {
          uuid: 'shift-1',
          label: 'Morning',
          shiftGroupName: 'Summer',
          shiftGroupUUID: 'group-1',
          start: '06:00:00',
          end: '14:00:00',
          order: 1,
          index: 0,
        },
        false,
        fixedProductionDate
      );

      expect(transformed.startDate.format(dateTimeFormat)).toBe('2025-05-15 06:00:00');
      expect(transformed.endDate.format(dateTimeFormat)).toBe('2025-05-15 14:00:00');
      expect(transformed._.timeStamps).toEqual([
        Date.UTC(2025, 4, 15, 6, 0, 0),
        Date.UTC(2025, 4, 15, 14, 0, 0),
      ]);
    });

    it('adjusts overnight shift end date to next day when current hour > end hour', () => {
      const transformed = transformShiftData(
        {
          uuid: 'shift-3',
          label: 'Night',
          shiftGroupName: 'Winter',
          shiftGroupUUID: 'group-2',
          start: '22:00:00',
          end: '06:00:00',
          order: 1,
          index: 2,
        },
        true,
        fixedProductionDate
      );

      expect(transformed.startDate.format(dateTimeFormat)).toBe('2025-05-15 22:00:00');
      expect(transformed.endDate.format(dateTimeFormat)).toBe('2025-05-16 06:00:00');
    });

    it('groups shifts by shiftGroupUUID and trims group name when isOptionGroupLabelTrimmed is enabled', () => {
      const grouped = getShifts(sampleOptions, sampleValues, fixedProductionDate, true);
      expect(Object.keys(grouped)).toEqual(['group-1', 'group-2']);
      expect(grouped['group-1'][0].label).toBe('Morning');
      expect(grouped['group-1'][1].label).toBe('Afternoon');
      expect(grouped['group-2'][0].label).toBe('Night');
    });

    it('returns initial group UUID from options and values', () => {
      expect(getInitGroupUUID(sampleOptions, sampleValues)).toBe('group-1');
    });
  });

  describe('getBreweryUUID & buttonTypes', () => {
    it('extracts UUID inside parentheses from name', () => {
      expect(getBreweryUUID('Plant Alpha (site_42)')).toBe('site_42');
      expect(getBreweryUUID('Plant Alpha')).toBeNull();
    });

    it('maps localized shift labels to weather icons', () => {
      const mappings = {
        sunny: ['morning', 'sabah'],
        'sunset-down': ['afternoon', 'ikindi'],
        night: ['night', 'akşam'],
      };
      expect(buttonTypes('Sabah Shift', mappings)).toBe('sunny');
      expect(buttonTypes('Ikindi Shift', mappings)).toBe('sunset-down');
      expect(buttonTypes('Night Shift', mappings)).toBe('night');
    });
  });

  describe('setTypeChangeHandler, shiftSelectHandler & getRelativeDates', () => {
    it('updates type and clears uuid when updateType changes', () => {
      const setUpdateType = jest.fn();
      const setCustomTimeRange = jest.fn();

      setTypeChangeHandler('from', 'both', setUpdateType, setCustomTimeRange);
      expect(setUpdateType).toHaveBeenCalledWith('from');
      expect(setCustomTimeRange).toHaveBeenCalledTimes(1);
      const updater = setCustomTimeRange.mock.calls[0][0];
      expect(updater({ from: 100, to: 200, uuid: 'shift-1' })).toEqual({
        from: 100,
        to: 200,
        uuid: null,
      });
    });

    it('does not update state when updateType is unchanged', () => {
      const setUpdateType = jest.fn();
      const setCustomTimeRange = jest.fn();

      setTypeChangeHandler('both', 'both', setUpdateType, setCustomTimeRange);
      expect(setUpdateType).not.toHaveBeenCalled();
      expect(setCustomTimeRange).not.toHaveBeenCalled();
    });

    it('invokes setShiftParams with shift and productionDate in shiftSelectHandler', () => {
      const setShiftParams = jest.fn();
      const shift = {
        uuid: 'shift-1',
        label: 'Morning',
        shiftGroupName: 'Summer',
        shiftGroupUUID: 'group-1',
        start: '06:00:00',
        end: '14:00:00',
      };
      shiftSelectHandler(shift, setShiftParams, 1700000000000);
      expect(setShiftParams).toHaveBeenCalledWith(shift, 1700000000000);
    });

    it('reads relative date flags from locationService search params', () => {
      jest
        .spyOn(locationService, 'getSearch')
        .mockReturnValue(new URLSearchParams('from=now-6h&to=2025-05-15T14:00:00.000Z'));
      expect(getRelativeDates()).toEqual({
        relativeFrom: true,
        relativeTo: false,
      });
    });
  });
});
