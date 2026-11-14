import type { ProductionRound } from '../data/mockData';

export interface TrayPackingEntry {
 id:string;assignmentKey:string;assignedNumbers:number[];beforePacked:number[];packedNumbers:number[];
 recordedAt:string;recordedBy:string;reason:string;requestKey:string;
}
export interface TrayPackingRequest {id:string;roundId:string;expectedFingerprint:string;packedNumbers:number[];reason:string}

export function trayAssignment(round:ProductionRound) {
 const numbers=round.paneerCuttingDetails?.trayNumbers||[],history=round.paneerCuttingHistory||[];
 let last:typeof history[number]|undefined,previous='';
 for(const entry of history){const key=JSON.stringify(entry.details.trayNumbers||[]);if(key!==previous){if(key===JSON.stringify(numbers))last=entry;previous=key;}}
 return {numbers,sequence:last?.sequence||0,at:last?.recordedAt||'',key:JSON.stringify({numbers,eventId:last?.id||'legacy'})};
}
export function trayPackingProgress(round:ProductionRound) {
 const assignment=trayAssignment(round),history=round.paneerTrayPackingHistory||[],matching=history.filter(e=>e.assignmentKey===assignment.key),last=matching[matching.length-1];
 const inferred=!history.length&&['packed','handed_over'].includes(round.status);
 const packed=last?assignment.numbers.filter(n=>last.packedNumbers.includes(n)):inferred?[...assignment.numbers]:[];
 return {assignment,packed,pending:assignment.numbers.filter(n=>!packed.includes(n)),explicit:Boolean(last),inferred,assignmentChanged:history.length>0&&!last};
}
export function trayIsReleased(round:ProductionRound,number:number) {return trayPackingProgress(round).packed.includes(number);}
export function trayPackingFingerprint(round:ProductionRound) {return JSON.stringify({assignment:trayAssignment(round).key,history:round.paneerTrayPackingHistory||[]});}
export function saveTrayPacking(rounds:ProductionRound[],request:TrayPackingRequest,actor:string,role:string,at:string):ProductionRound[] {
 if(!request.id||!actor.trim())throw Error('A save reference and recorder are required.');
 const requestKey=JSON.stringify(request),prior=rounds.find(r=>r.paneerTrayPackingHistory?.some(h=>h.id===request.id));
 if(prior){const entry=prior.paneerTrayPackingHistory!.find(h=>h.id===request.id)!;if(prior.id!==request.roundId||entry.requestKey!==requestKey||entry.recordedBy!==actor)throw Error('This save reference belongs to a different tray packing record.');return rounds;}
 const round=rounds.find(r=>r.id===request.roundId);if(!round)throw Error('Round not found.');
 const progress=trayPackingProgress(round),assigned=progress.assignment.numbers;
 if(!['D','C/S'].includes(round.type)||!assigned.length)throw Error('Record this paneer round’s physical tray numbers first.');
 if(['scheduled','in_production','coagulation','pressing','cooling','resting','ready_cutting','clingwrapped','cancelled'].includes(round.status))throw Error('Record cutting before tray packing.');
 if(trayPackingFingerprint(round)!==request.expectedFingerprint)throw Error('Tray details changed. Reopen tray packing before saving.');
 const selected=request.packedNumbers;
 if(selected.some(n=>!Number.isSafeInteger(n)||n<1||n>20||!assigned.includes(n))||new Set(selected).size!==selected.length)throw Error('Select each assigned tray once, from 1 to 20.');
 const packed=[...selected].sort((a,b)=>a-b),before=progress.explicit?progress.packed:[],reopened=before.filter(n=>!packed.includes(n));
 if(reopened.length){if(!['owner','admin'].includes(role.toLowerCase()))throw Error('Only Owner/Admin can reopen trays already recorded packed.');if(request.reason.trim().length<5)throw Error('Enter a reason for reopening packed trays.');}
 if(!progress.explicit&&!packed.length)throw Error('Select at least one tray that has been fully packed and emptied.');
 if(progress.explicit&&JSON.stringify(before)===JSON.stringify(packed))return rounds;
 const entry:TrayPackingEntry={id:request.id,assignmentKey:progress.assignment.key,assignedNumbers:[...assigned],beforePacked:[...before],packedNumbers:packed,recordedAt:at,recordedBy:actor,reason:request.reason.trim(),requestKey};
 const pending=assigned.filter(n=>!packed.includes(n));
 return rounds.map(r=>r.id===round.id?{...r,paneerTrayPackingHistory:[...(r.paneerTrayPackingHistory||[]),entry],historyEvents:[...(r.historyEvents||[]),{id:request.id,type:'tray_packing_recorded',stage:'Tray packing',occurredAt:at,recordedBy:actor,source:reopened.length?'correction' as const:'workflow' as const,details:`Fully packed trays: ${packed.join(', ')||'none'} · Still waiting: ${pending.join(', ')||'none'}${reopened.length?` · Reopened ${reopened.join(', ')}: ${entry.reason}`:''} · Case and packet quantities recorded separately`}]}:r);
}
