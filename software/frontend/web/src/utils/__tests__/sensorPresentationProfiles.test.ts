import {
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
});
