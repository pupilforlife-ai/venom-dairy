import { describe, expect, it } from 'vitest';
import { createPreviewStore, PREFIX } from './storage';
function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); } };
}
describe('local traceability transport', () => {
  it('persists only namespaced records and survives a new store instance', () => {
    const storage = memory(); storage.setItem('vejoy_milkLots', 'unrelated');
    createPreviewStore(storage).set('vejoy_milkLots', [], [{ id: 'test' }]);
    expect(storage.getItem('vejoy_milkLots')).toBe('unrelated');
    expect(storage.getItem(PREFIX + 'vejoy_milkLots')).toBe('[{"id":"test"}]');
    expect(createPreviewStore(storage).read('vejoy_milkLots', [])).toEqual([{ id: 'test' }]);
  });
  it('uses the latest stored value for sequential and second-store edits', () => {
    const storage = memory(), a = createPreviewStore(storage), b = createPreviewStore(storage);
    a.set('count', 0, value => value + 1); b.read('count', 0);
    a.set('count', 0, value => value + 1); b.set('count', 0, value => value + 1);
    expect(a.read('count', 0)).toBe(3);
  });
  it('signals subscribers only after successful persistence', () => {
    const storage = memory(), store = createPreviewStore(storage); let calls = 0;
    const stop = store.subscribe('key', () => { calls++; expect(storage.getItem(PREFIX + 'key')).toBe('2'); });
    store.set('key', 0, 2); expect(calls).toBe(1); stop();
    storage.setItem = () => { throw Error('Storage full'); };
    expect(() => store.set('key', 0, 3)).toThrow('Storage full');
    expect(store.read('key', 0)).toBe(2); expect(calls).toBe(1);
  });
  it('does not silently replace damaged saved data with empty records', () => {
    const storage = memory(); storage.setItem(PREFIX + 'key', '{broken');
    expect(() => createPreviewStore(storage).read('key', [])).toThrow();
  });
});

describe('atomic local multi-collection operations',()=>{
 it('commits stock and trace in one durable write and only then notifies observers',()=>{
  const storage=memory(),store=createPreviewStore(storage);store.set('stock',[],[1]);store.set('trace',{},{});
  const writes:string[]=[];const write=storage.setItem;storage.setItem=(key,value)=>{writes.push(key);write(key,value);};
  let observed=0;store.subscribe('stock',()=>{expect(store.read('trace',{})).toEqual({id:'case'});observed++;});
  store.batch(()=>{store.set('stock',[],[2]);expect(store.read('stock',[])).toEqual([2]);expect(createPreviewStore(storage).read('stock',[])).toEqual([1]);store.set('trace',{}, {id:'case'});});
  expect(writes).toEqual([PREFIX+'__atomic_values']);expect(observed).toBe(1);expect(createPreviewStore(storage).read('stock',[])).toEqual([2]);
 });
 it('aborts every staged collection on validation or persistence failure and retains old unrelated data',()=>{
  const storage=memory(),store=createPreviewStore(storage);store.set('stock',[],[1]);store.set('unrelated',[],['safe']);
  expect(()=>store.batch(()=>{store.set('stock',[],[2]);throw Error('bad allocation');})).toThrow('bad allocation');expect(store.read('stock',[])).toEqual([1]);
  const write=storage.setItem;storage.setItem=()=>{throw Error('quota');};let success=false;
  expect(()=>store.batch(()=>{store.set('stock',[],[3]);store.set('trace',{}, {id:'never'});store.defer(()=>{success=true;});})).toThrow('quota');
  storage.setItem=write;expect(store.read('stock',[])).toEqual([1]);expect(store.read('trace',{})).toEqual({});expect(store.read('unrelated',[])).toEqual(['safe']);expect(success).toBe(false);
 });
 it('reads the latest envelope in a second store and retains later edits on ordinary setters',()=>{
  const storage=memory(),a=createPreviewStore(storage),b=createPreviewStore(storage);a.batch(()=>{a.set('stock',0,1);a.set('trace',0,1);});
  b.set('stock',0,n=>n+1);a.set('trace',0,n=>n+1);b.batch(()=>{b.set('stock',0,n=>n+1);});
  expect(a.read('stock',0)).toBe(3);expect(b.read('trace',0)).toBe(2);
 });
 it('keeps nested writes in the same transaction and defers success until commit',()=>{
  const storage=memory(),store=createPreviewStore(storage);let success=false;
  store.batch(()=>{store.set('a',0,1);store.batch(()=>store.set('b',0,2));store.defer(()=>{expect(createPreviewStore(storage).read('b',0)).toBe(2);success=true;});expect(success).toBe(false);});expect(success).toBe(true);
 });
});
