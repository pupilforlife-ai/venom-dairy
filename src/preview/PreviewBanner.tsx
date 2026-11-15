import { useState } from 'react';
import { parseTestBackup,assertFreshTestBrowser } from './backupImport';
import { PREFIX,ATOMIC_KEY,readPreviewState,writePreviewState,batchPreviewWrites } from './storage';
export default function PreviewBanner() {
  const [expanded, setExpanded] = useState(false);
  const [pending,setPending]=useState<Record<string,unknown>>(),[message,setMessage]=useState('');
  function importBackup(){try{if(!pending)return;assertFreshTestBrowser(readPreviewState);batchPreviewWrites(()=>{for(const [key,value] of Object.entries(pending))writePreviewState(key,null,value);});setPending(undefined);setMessage('Test backup loaded. Your original test address remains unchanged.');}catch(e){setMessage((e as Error).message);}}
  function backup() {
    const data = Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith(PREFIX)&&!key.startsWith(PREFIX+'__'))
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
      <details><summary>Move test entries from an earlier preview address</summary><p>On the earlier test address, download its test backup. Select that JSON file here. Import is allowed only into a fresh test browser; existing test work will never be replaced.</p><label>Choose paneer test backup<input type="file" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setPending(parseTestBackup(await file.text()));setMessage('Backup ready for review.');}catch(error){setPending(undefined);setMessage((error as Error).message);}}}/></label>{pending&&<p>{(pending.vejoy_milkLots as unknown[]).length} lots · {(pending.vejoy_productionRounds as unknown[]).length} rounds <button onClick={importBackup}>Load backup into this fresh test browser</button></p>}{message&&<p role="status">{message}</p>}</details>
      <p><strong>Paneer test build:</strong> receiving/production dates, ingredient forecasts, actual consumption, paneer packet/case labels and the traceability register are available. Mixed-case assembly and stock allocation are available for local testing. Complete pooled derivative allocations and production server integration remain pending.</p>
      <ul><li>Keep Shift 1, Shift 2, etc. on the board. Letters belong only in batch codes and labels.</li>
        <li>Ingredients: consumption records and printable milk-based forecasts, without inventory management.</li>
        <li>Allow SPP packing with missing earlier details; keep gaps visible for later review.</li>
        <li>Preserve owner corrections, with recorded reasons and audit history.</li></ul>
      <p>Use this same address and browser to retain test entries. Test entries do not appear on other devices or in the live app. Download a backup before clearing browser data. Local roles are simulated; server permissions and concurrency require later testing.</p>
    </div>}
  </section>;
}
