interface VersionedRow {key:string;version:number|null;[key:string]:unknown}
interface CommittedReply {ok?:boolean;replayed?:boolean;rows?:VersionedRow[];[key:string]:unknown}
// Only shrink a confirmed first commit. Replay/older server responses retain the
// full snapshot so a lost reply (including a racing duplicate request) recovers.
export function compactCommittedReply<T extends CommittedReply>(reply:T,before:VersionedRow[]):T {
 if(!reply?.ok||reply.replayed!==false||!Array.isArray(reply.rows))return reply;
 const versions=new Map(before.map(row=>[row.key,row.version]));
 return {...reply,rows:reply.rows.filter(row=>!versions.has(row.key)||typeof row.version!=='number'||row.version!==versions.get(row.key))};
}
