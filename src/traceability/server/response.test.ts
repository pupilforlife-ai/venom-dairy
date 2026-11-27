import {it,expect} from 'vitest';
import {compactCommittedReply} from './response';
const before=[{key:'rounds',version:5},{key:'stock',version:2},{key:'milk',version:8}];
it('returns changed, indirectly updated and newly created rows without changing the source reply',()=>{
 const rows=[{key:'rounds',version:6,value:['saved']},{key:'stock',version:2,value:['unchanged']},{key:'milk',version:9,value:['pool update']},{key:'new',version:1}];
 const reply={ok:true,replayed:false,rows,result:{saved:true}},original=JSON.stringify(reply),next=compactCommittedReply(reply,before);
 expect(next.rows.map(r=>r.key)).toEqual(['rounds','milk','new']);expect((next as any).versions).toEqual(rows.map(({key,version})=>({key,version})));expect(next.result).toBe(reply.result);expect(JSON.stringify(reply)).toBe(original);
});
it('keeps full replay and older-server replies to recover lost responses, including racing requests',()=>{
 for(const replayed of [true,undefined]){const r={ok:true,replayed,rows:[{key:'rounds',version:5}]};expect(compactCommittedReply(r,before)).toBe(r)}
});
it('keeps unexpected versions and errors; only known unchanged committed versions are suppressed',()=>{
 const error={ok:false,rows:before};expect(compactCommittedReply(error,before)).toBe(error);
 expect(compactCommittedReply({ok:true,replayed:false,rows:[{key:'rounds',version:null},{key:'stock',version:1}]},before).rows).toHaveLength(2);
 expect(compactCommittedReply({ok:true,replayed:false,rows:before},before).rows).toEqual([]);
});
