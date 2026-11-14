import { useState } from 'react';
import { PREFIX,ATOMIC_KEY } from './storage';
export default function PreviewBanner() {
  const [expanded, setExpanded] = useState(false);
  function backup() {
    const data = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith(PREFIX)&&key!==ATOMIC_KEY)
      .map(key => [key, localStorage.getItem(key)]));
    for(const [key,value] of Object.entries(JSON.parse(localStorage.getItem(ATOMIC_KEY)||'{}')))data[PREFIX+key]=value as string;
    const blob = new Blob([JSON.stringify({ format: 'vejoy-traceability-local-v1', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = href; link.download = `traceability-local-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <section className="trace-preview-banner" aria-label="Isolated paneer test environment">
    <div className="trace-preview-heading"><strong>PANEER TRACEABILITY TEST</strong>
      <span>Browser storage · Supabase disconnected · Sample data</span>
      <button onClick={backup}>Download test backup</button>
      <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>Test scope</button>
    </div>
    {expanded && <div className="trace-preview-scope">
      <p><strong>Paneer test build:</strong> receiving/production dates, ingredient forecasts, actual consumption, paneer packet/case labels and the traceability register are available. Mixed-case assembly and stock allocation are available for local testing. Complete pooled derivative allocations and production server integration remain pending.</p>
      <ul><li>Keep Shift 1, Shift 2, etc. on the board. Letters belong only in batch codes and labels.</li>
        <li>Ingredients: consumption records and printable milk-based forecasts, without inventory management.</li>
        <li>Allow SPP packing with missing earlier details; keep gaps visible for later review.</li>
        <li>Preserve owner corrections, with recorded reasons and audit history.</li></ul>
      <p>Use this same address and browser to retain test entries. Test entries do not appear on other devices or in the live app. Download a backup before clearing browser data. Local roles are simulated; server permissions and concurrency require later testing.</p>
    </div>}
  </section>;
}
