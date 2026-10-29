import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DistributionTab, DistributionTabs } from './DistributionTabs';

describe('Distribution layout-only tabs', () => {
  it.each(['ready', 'history', 'production'] as DistributionTab[])('only displays the %s panel while retaining all content', activeTab => {
    const html = renderToStaticMarkup(<DistributionTabs activeTab={activeTab} onChange={() => { throw new Error('Rendering must not change state'); }}>
      {{ ready: <p>Original ready entries</p>, history: <p>Original handover history</p>, production: <p>Original remaining balances</p> }}
    </DistributionTabs>);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/hidden=""/g)).toHaveLength(2);
    expect(html).toContain(`id="distribution-panel-${activeTab}" aria-labelledby="distribution-tab-${activeTab}" tabindex="0"`);
    expect(html).toContain('Original ready entries');
    expect(html).toContain('Original handover history');
    expect(html).toContain('Original remaining balances');
    expect(html.match(/type="button"/g)).toHaveLength(3);
  });
});
