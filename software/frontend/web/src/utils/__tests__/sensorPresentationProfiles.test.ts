import {
  buildPresentationAlertSettings,
  getPresentationProfileDefinitions,
  getSupportedProfilesForDerivedMetric,
} from '../sensorConfig';

describe('metric presentation profile suitability', () => {
  it('offers gauge monitoring for fill rate', () => {
    expect(getSupportedProfilesForDerivedMetric('vl53l0x', 'fill_rate')).toEqual(
      expect.arrayContaining(['single_trend', 'gauge_status', 'event_timeline'])
    );
    expect(
      getPresentationProfileDefinitions('vl53l0x', 'fill_rate').map((profile) => profile.value)
    ).toContain('gauge_status');
  });

  it('offers level and gauge views for capacity percentages', () => {
    expect(getSupportedProfilesForDerivedMetric('ultrasonic', 'fill_level')).toEqual(
      expect.arrayContaining(['level_monitoring', 'gauge_status', 'single_trend'])
    );
    expect(getSupportedProfilesForDerivedMetric('ultrasonic', 'remaining_capacity_percent')).toEqual(
      expect.arrayContaining(['gauge_status', 'level_monitoring', 'single_trend'])
    );
  });

  it('offers trend, gauge, and event views for operational rates', () => {
    for (const metric of ['load_change_rate', 'depletion_rate']) {
      expect(getSupportedProfilesForDerivedMetric('load', metric)).toEqual(
        expect.arrayContaining(['single_trend', 'gauge_status', 'event_timeline'])
      );
    }
  });

  it('keeps spike-only metrics focused on event and trend views', () => {
    expect(getSupportedProfilesForDerivedMetric('gas_sensor', 'gas_spike')).not.toContain('gauge_status');
    expect(getSupportedProfilesForDerivedMetric('ultrasonic', 'occupancy_spike')).not.toContain('gauge_status');
  });

  it.each([
    ['fill_level', 'gauge_status', 'Level Capacity Alert', 'above'],
    ['remaining_capacity_percent', 'gauge_status', 'Low Remaining Capacity Alert', 'below'],
    ['fill_rate', 'event_timeline', 'Rapid Fill Event', 'above'],
    ['occupancy_spike', 'event_timeline', 'Sudden Occupancy Increase', 'above'],
    ['peak_occupancy', 'counter_status', 'Peak Occupancy Alert', 'above'],
  ] as const)(
    'builds category-specific alerts for %s',
    (metric, profile, label, condition) => {
      const alerts = buildPresentationAlertSettings('ultrasonic', metric, profile);

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        label,
        metric_key: metric,
        condition,
      });
    }
  );
});
