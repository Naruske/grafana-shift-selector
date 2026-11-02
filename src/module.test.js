import { PanelPlugin } from '@grafana/data';
import { plugin } from './module';

describe('plugin module', () => {
  it('should be an instance of PanelPlugin', () => {
    expect(plugin).toBeInstanceOf(PanelPlugin);
  });
});
