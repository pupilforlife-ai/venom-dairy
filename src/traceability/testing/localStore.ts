export const PREFIX = 'vejoy_paneer_test:20261114:v1:';
export const ATOMIC_KEY=PREFIX+'__atomic_values';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
type Listener = () => void;

// Storage adapter only. Business rules must remain independent of storage.
export function createPreviewStore(storage: StoragePort) {
  const snapshots = new Map<string, { raw: string | null; value: unknown }>();
  const listeners = new Map<string, Set<Listener>>();
  let pending:Record<string,string>|undefined;
  let afterCommit:(()=>void)[]=[];
  const overlay=():Record<string,string>=>JSON.parse(storage.getItem(ATOMIC_KEY)||'{}');
  function read<T>(key: string, fallback: T): T {
    const values=overlay();
    const raw = pending&&Object.prototype.hasOwnProperty.call(pending,key)?pending[key]:Object.prototype.hasOwnProperty.call(values,key)?values[key]:storage.getItem(PREFIX + key);
    const cached = snapshots.get(key);
    if (cached && cached.raw === raw) return cached.value as T;
    const value = raw === null ? fallback : JSON.parse(raw) as T;
    snapshots.set(key, { raw, value });
    return value;
  }
  function publish(key: string) { listeners.get(key)?.forEach(listener => listener()); }
  function set<T>(key: string, fallback: T, next: T | ((current: T) => T)) {
    const current = read(key, fallback);
    const value = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
    const raw = JSON.stringify(value);
    if(pending){pending[key]=raw;return;}
    // A single envelope commit makes multi-collection local operations atomic.
    // Untouched old keys remain readable and are never copied over newer values.
    const values=overlay();
    if(Object.prototype.hasOwnProperty.call(values,key))storage.setItem(ATOMIC_KEY,JSON.stringify({...values,[key]:raw}));
    else storage.setItem(PREFIX + key, raw);
    snapshots.set(key, { raw, value }); publish(key);
  }
  function batch<T>(action:()=>T):T {
    if(pending)return action();
    pending={};afterCommit=[];
    let result:T,changed:string[],callbacks:(()=>void)[];
    try {result=action();changed=Object.keys(pending);if(changed.length)storage.setItem(ATOMIC_KEY,JSON.stringify({...overlay(),...pending}));callbacks=afterCommit;}
    catch(error){pending=undefined;afterCommit=[];snapshots.clear();throw error;}
    pending=undefined;afterCommit=[];snapshots.clear();changed.forEach(publish);callbacks.forEach(fn=>fn());return result;
  }
  function defer(action:()=>void){if(pending)afterCommit.push(action);else action();}
  function publishAll(){snapshots.clear();listeners.forEach((_,key)=>publish(key));}
  return { read, set, batch, defer, publish, publishAll, subscribe(key: string, listener: Listener) {
    const group = listeners.get(key) ?? new Set<Listener>();
    group.add(listener); listeners.set(key, group);
    return () => { group.delete(listener); };
  } };
}
