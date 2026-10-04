import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Edit3,
  Flag,
  History,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import {
  Instruction,
  InstructionAudit,
  InstructionPriority,
  InstructionStatus,
  instructionPriorityLabel,
  instructionStatusLabel,
} from '../data/instructions';

interface InstructionForm {
  title: string;
  details: string;
  priority: InstructionPriority;
  sequenceNo: string;
  scheduledFor: string;
  dueAt: string;
  assignedUsername: string;
  assignedShiftNumber: string;
  milkLotCode: string;
  relatedRoundId: string;
}

const emptyForm: InstructionForm = {
  title: '',
  details: '',
  priority: 'normal',
  sequenceNo: '1',
  scheduledFor: '',
  dueAt: '',
  assignedUsername: '',
  assignedShiftNumber: '',
  milkLotCode: '',
  relatedRoundId: '',
};

const priorityClasses: Record<InstructionPriority, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
};

const statusClasses: Record<InstructionStatus, string> = {
  posted: 'bg-slate-100 text-slate-700',
  acknowledged: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-violet-50 text-violet-700',
  completed: 'bg-amber-50 text-amber-700',
  verified: 'bg-emerald-50 text-emerald-700',
  returned: 'bg-orange-50 text-orange-700',
  cancelled: 'bg-red-50 text-red-700',
};

function inputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sortInstructions(items: Instruction[]) {
  return [...items].sort((left, right) => {
    const leftTime = left.scheduled_for ? new Date(left.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.scheduled_for ? new Date(right.scheduled_for).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    if (left.sequence_no !== right.sequence_no) return left.sequence_no - right.sequence_no;
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Unscheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function makeLocalAudit(instructionId: string, action: string, actor: string, note?: string, before?: Instruction, after?: Instruction): InstructionAudit {
  return {
    id: `${Date.now()}-${Math.random()}`,
    instruction_id: instructionId,
    action,
    actor_username: actor,
    note,
    before_value: before ? before as unknown as Record<string, unknown> : null,
    after_value: after ? after as unknown as Record<string, unknown> : null,
    created_at: new Date().toISOString(),
  };
}

export default function Instructions() {
  const { showToast } = useToast();
  const isLocalDemo = import.meta.env.VITE_LOCAL_DEMO_MODE === 'true';
  const currentRole = typeof window === 'undefined' ? 'staff' : window.localStorage.getItem('vejoy_user_role')?.toLowerCase() || 'staff';
  const currentUsername = typeof window === 'undefined' ? 'User' : window.localStorage.getItem('vejoy_user_username') || 'User';
  const canManage = currentRole === 'admin' || currentRole === 'owner';
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [audits, setAudits] = useState<InstructionAudit[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'completed' | 'verified' | 'overdue'>('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | InstructionPriority>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<Instruction | null>(null);
  const [form, setForm] = useState<InstructionForm>(emptyForm);
  const [action, setAction] = useState<{ instruction: Instruction; nextStatus: InstructionStatus } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [historyInstruction, setHistoryInstruction] = useState<Instruction | null>(null);

  const loadInstructions = async () => {
    setLoading(true);
    setError('');
    if (isLocalDemo || !supabase) {
      try {
        const stored = window.localStorage.getItem('vejoy_instructions');
        setInstructions(stored ? JSON.parse(stored) as Instruction[] : []);
      } catch {
        setError('The local instruction list could not be read.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const { data, error: loadError } = await supabase
      .from('instructions')
      .select('*')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .order('sequence_no', { ascending: true })
      .order('created_at', { ascending: true });
    if (loadError) {
      setError(loadError.message);
      showToast('error', `Could not load instructions: ${loadError.message}`);
    } else {
      setInstructions((data || []) as Instruction[]);
    }
    setLoading(false);
  };

  useEffect(() => { void loadInstructions(); }, []);

  const persistLocal = (next: Instruction[], nextAudits?: InstructionAudit[]) => {
    setInstructions(next);
    window.localStorage.setItem('vejoy_instructions', JSON.stringify(next));
    if (nextAudits) window.localStorage.setItem('vejoy_instruction_audit', JSON.stringify(nextAudits));
  };

  const visibleInstructions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();
    return sortInstructions(instructions).filter(item => {
      const matchesSearch = !query || [item.title, item.details, item.assigned_username, item.milk_lot_code, item.related_round_id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
      const overdue = Boolean(item.due_at && new Date(item.due_at).getTime() < now && !['completed', 'verified', 'cancelled'].includes(item.status));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'open' && !['completed', 'verified', 'cancelled'].includes(item.status))
        || (statusFilter === 'completed' && item.status === 'completed')
        || (statusFilter === 'verified' && item.status === 'verified')
        || (statusFilter === 'overdue' && overdue);
      return matchesSearch && matchesStatus && (priorityFilter === 'all' || item.priority === priorityFilter);
    });
  }, [instructions, search, statusFilter, priorityFilter]);

  const openCreate = () => {
    setEditingInstruction(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (instruction: Instruction) => {
    setEditingInstruction(instruction);
    setForm({
      title: instruction.title,
      details: instruction.details,
      priority: instruction.priority,
      sequenceNo: String(instruction.sequence_no),
      scheduledFor: inputDateTime(instruction.scheduled_for),
      dueAt: inputDateTime(instruction.due_at),
      assignedUsername: instruction.assigned_username || '',
      assignedShiftNumber: instruction.assigned_shift_number ? String(instruction.assigned_shift_number) : '',
      milkLotCode: instruction.milk_lot_code || '',
      relatedRoundId: instruction.related_round_id || '',
    });
    setShowForm(true);
  };

  const saveInstruction = async () => {
    if (!canManage) return;
    if (!form.title.trim() || !form.details.trim()) {
      showToast('error', 'Add a title and clear instruction details');
      return;
    }
    const sequenceNo = Number(form.sequenceNo);
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      showToast('error', 'Sequence must be a positive whole number');
      return;
    }
    const payload = {
      title: form.title.trim(),
      details: form.details.trim(),
      priority: form.priority,
      sequence_no: sequenceNo,
      scheduled_for: isoDateTime(form.scheduledFor),
      due_at: isoDateTime(form.dueAt),
      assigned_username: form.assignedUsername.trim() || null,
      assigned_shift_number: form.assignedShiftNumber ? Number(form.assignedShiftNumber) : null,
      milk_lot_code: form.milkLotCode.trim() || null,
      related_round_id: form.relatedRoundId.trim() || null,
    };

    if (!supabase || isLocalDemo) {
      const now = new Date().toISOString();
      const auditRows = (() => {
        try { return JSON.parse(window.localStorage.getItem('vejoy_instruction_audit') || '[]') as InstructionAudit[]; } catch { return []; }
      })();
      if (editingInstruction) {
        const updated: Instruction = { ...editingInstruction, ...payload, updated_at: now };
        const next = instructions.map(item => item.id === editingInstruction.id ? updated : item);
        persistLocal(next, [...auditRows, makeLocalAudit(updated.id, 'updated', currentUsername, undefined, editingInstruction, updated)]);
        showToast('success', 'Instruction updated');
      } else {
        const created: Instruction = { ...payload, id: `instruction-${Date.now()}`, status: 'posted', created_by: currentUsername, created_at: now, updated_at: now };
        persistLocal([...instructions, created], [...auditRows, makeLocalAudit(created.id, 'created', currentUsername, undefined, undefined, created)]);
        showToast('success', 'Instruction posted');
      }
      setShowForm(false);
      return;
    }

    if (editingInstruction) {
      const { data, error: updateError } = await supabase.from('instructions').update(payload).eq('id', editingInstruction.id).select().single();
      if (updateError) showToast('error', updateError.message);
      else { setInstructions(current => current.map(item => item.id === editingInstruction.id ? data as Instruction : item)); showToast('success', 'Instruction updated'); setShowForm(false); }
      return;
    }

    const user = (await supabase.auth.getUser()).data.user;
    const { data, error: insertError } = await supabase.from('instructions').insert({ ...payload, created_by: user?.id }).select().single();
    if (insertError) showToast('error', insertError.message);
    else { setInstructions(current => [...current, data as Instruction]); showToast('success', 'Instruction posted'); setShowForm(false); }
  };

  const openStatusAction = (instruction: Instruction, nextStatus: InstructionStatus) => {
    setAction({ instruction, nextStatus });
    setActionNote('');
  };

  const updateStatus = async () => {
    if (!action) return;
    const { instruction, nextStatus } = action;
    if ((nextStatus === 'completed' || nextStatus === 'returned') && actionNote.trim().length < 3) {
      showToast('error', nextStatus === 'completed' ? 'Add a short completion note' : 'Add a reason for returning the task');
      return;
    }
    if (!supabase || isLocalDemo) {
      const now = new Date().toISOString();
      const updated: Instruction = {
        ...instruction,
        status: nextStatus,
        updated_at: now,
        acknowledged_by: nextStatus === 'acknowledged' ? currentUsername : instruction.acknowledged_by,
        acknowledged_at: nextStatus === 'acknowledged' ? now : instruction.acknowledged_at,
        completed_by: nextStatus === 'completed' ? currentUsername : instruction.completed_by,
        completed_at: nextStatus === 'completed' ? now : instruction.completed_at,
        verified_by: nextStatus === 'verified' ? currentUsername : instruction.verified_by,
        verified_at: nextStatus === 'verified' ? now : instruction.verified_at,
        completion_note: nextStatus === 'completed' ? actionNote.trim() : instruction.completion_note,
        verification_note: ['verified', 'returned'].includes(nextStatus) ? actionNote.trim() : instruction.verification_note,
      };
      const auditRows = (() => {
        try { return JSON.parse(window.localStorage.getItem('vejoy_instruction_audit') || '[]') as InstructionAudit[]; } catch { return []; }
      })();
      persistLocal(instructions.map(item => item.id === instruction.id ? updated : item), [...auditRows, makeLocalAudit(instruction.id, nextStatus, currentUsername, actionNote.trim(), instruction, updated)]);
      showToast('success', `Instruction marked ${instructionStatusLabel(nextStatus).toLowerCase()}`);
      setAction(null);
      return;
    }

    const { data, error: updateError } = await supabase.rpc('update_instruction_status', {
      instruction_id: instruction.id,
      next_status: nextStatus,
      status_note: actionNote.trim() || null,
    });
    if (updateError) showToast('error', updateError.message);
    else { setInstructions(current => current.map(item => item.id === instruction.id ? data as Instruction : item)); showToast('success', `Instruction marked ${instructionStatusLabel(nextStatus).toLowerCase()}`); setAction(null); }
  };

  const loadAudit = async (instruction: Instruction) => {
    setHistoryInstruction(instruction);
    if (!supabase || isLocalDemo) {
      try {
        const rows = JSON.parse(window.localStorage.getItem('vejoy_instruction_audit') || '[]') as InstructionAudit[];
        setAudits(rows.filter(item => item.instruction_id === instruction.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      } catch { setAudits([]); }
      return;
    }
    const { data, error: auditError } = await supabase.from('instruction_audit').select('*').eq('instruction_id', instruction.id).order('created_at', { ascending: false });
    if (auditError) showToast('error', auditError.message);
    else setAudits((data || []) as InstructionAudit[]);
  };

  const overdueCount = instructions.filter(item => item.due_at && new Date(item.due_at).getTime() < Date.now() && !['completed', 'verified', 'cancelled'].includes(item.status)).length;
  const openCount = instructions.filter(item => !['completed', 'verified', 'cancelled'].includes(item.status)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Instructions Board</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Chronological operational instructions with accountable completion records.</p>
        </div>
        {canManage && <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> Post instruction</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open</p><p className="mt-1 text-2xl font-bold text-slate-900">{openCount}</p></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-red-700">Overdue</p><p className="mt-1 text-2xl font-bold text-red-900">{overdueCount}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-amber-700">Completed</p><p className="mt-1 text-2xl font-bold text-amber-900">{instructions.filter(item => item.status === 'completed').length}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Verified</p><p className="mt-1 text-2xl font-bold text-emerald-900">{instructions.filter(item => item.status === 'verified').length}</p></div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row">
        <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search instructions, lots, or people" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm" /></label>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="open">Open tasks</option><option value="all">All statuses</option><option value="overdue">Overdue</option><option value="completed">Completed</option><option value="verified">Verified</option></select>
        <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value as typeof priorityFilter)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Instructions could not be loaded</p><p className="mt-1">{error}</p></div></div>}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading instructions…</div> : visibleInstructions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No instructions match this view.</p><p className="mt-1 text-xs text-slate-500">{canManage ? 'Post the first task for the team.' : 'Your open tasks will appear here.'}</p></div> : (
        <div className="space-y-3">
          {visibleInstructions.map((item, index) => {
            const isOverdue = Boolean(item.due_at && new Date(item.due_at).getTime() < Date.now() && !['completed', 'verified', 'cancelled'].includes(item.status));
            return <div key={item.id} className={`rounded-xl border bg-white p-4 shadow-sm ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClasses[item.priority]}`}><Flag className="mr-1 inline h-3 w-3" />{instructionPriorityLabel(item.priority)}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClasses[item.status]}`}>{instructionStatusLabel(item.status)}</span></div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.details}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(item.scheduled_for)}{item.due_at ? ` · due ${formatDateTime(item.due_at)}` : ''}</span>
                      {item.assigned_username && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{item.assigned_username}{item.assigned_shift_number ? ` · Shift ${item.assigned_shift_number}` : ''}</span>}
                      {item.milk_lot_code && <span>Milk lot {item.milk_lot_code}</span>}
                      {item.related_round_id && <span>Round {item.related_round_id}</span>}
                    </div>
                    {isOverdue && <p className="mt-2 text-xs font-semibold text-red-700">Overdue — follow up with the assigned person.</p>}
                    {item.completion_note && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">Completion note:</span> {item.completion_note}</p>}
                    {item.verification_note && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><span className="font-semibold">Review note:</span> {item.verification_note}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:max-w-xs lg:justify-end">
                  {item.status === 'posted' && <button type="button" onClick={() => openStatusAction(item, 'acknowledged')} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"><Check className="h-3.5 w-3.5" /> Acknowledge</button>}
                  {['acknowledged', 'returned'].includes(item.status) && <button type="button" onClick={() => openStatusAction(item, 'in_progress')} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700"><Play className="h-3.5 w-3.5" /> Start</button>}
                  {['acknowledged', 'in_progress'].includes(item.status) && <button type="button" onClick={() => openStatusAction(item, 'completed')} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700"><CheckCircle2 className="h-3.5 w-3.5" /> Complete</button>}
                  {canManage && item.status === 'completed' && <><button type="button" onClick={() => openStatusAction(item, 'verified')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Verify</button><button type="button" onClick={() => openStatusAction(item, 'returned')} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700"><RotateCcw className="h-3.5 w-3.5" /> Return</button></>}
                  {canManage && !['verified', 'cancelled'].includes(item.status) && <button type="button" onClick={() => openEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Edit</button>}
                  <button type="button" onClick={() => void loadAudit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><History className="h-3.5 w-3.5" /> History</button>
                </div>
              </div>
            </div>;
          })}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingInstruction ? 'Edit instruction' : 'Post instruction'} size="lg">
        <div className="space-y-4">
          <div><label className="text-xs font-semibold text-slate-700">Task title *</label><input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Verify vat 1 and vat 2 are clean" /></div>
          <div><label className="text-xs font-semibold text-slate-700">Instruction details *</label><textarea value={form.details} onChange={event => setForm(current => ({ ...current, details: event.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Write the task clearly enough that completion can be checked later." /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">Priority<select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as InstructionPriority }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label><label className="text-xs font-semibold text-slate-700">Sequence no.<input type="number" min="1" value={form.sequenceNo} onChange={event => setForm(current => ({ ...current, sequenceNo: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">Assigned person<input value={form.assignedUsername} onChange={event => setForm(current => ({ ...current, assignedUsername: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Username (optional)" /></label></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Scheduled for<input type="datetime-local" value={form.scheduledFor} onChange={event => setForm(current => ({ ...current, scheduledFor: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold text-slate-700">Due by<input type="datetime-local" value={form.dueAt} onChange={event => setForm(current => ({ ...current, dueAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">Shift<input type="number" min="1" value={form.assignedShiftNumber} onChange={event => setForm(current => ({ ...current, assignedShiftNumber: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional" /></label><label className="text-xs font-semibold text-slate-700">Milk lot<input value={form.milkLotCode} onChange={event => setForm(current => ({ ...current, milkLotCode: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional" /></label><label className="text-xs font-semibold text-slate-700">Related round<input value={form.relatedRoundId} onChange={event => setForm(current => ({ ...current, relatedRoundId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Optional" /></label></div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button><button type="button" onClick={() => void saveInstruction()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">{editingInstruction ? 'Save changes' : 'Post instruction'}</button></div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(action)} onClose={() => setAction(null)} title={action ? `${instructionStatusLabel(action.nextStatus)} instruction` : 'Update instruction'} size="sm">
        {action && <div className="space-y-4"><p className="text-sm text-slate-600">Record this action for <span className="font-semibold text-slate-900">{action.instruction.title}</span>.</p>{['completed', 'verified', 'returned'].includes(action.nextStatus) && <div><label className="text-xs font-semibold text-slate-700">{action.nextStatus === 'returned' ? 'Reason' : 'Note'} {action.nextStatus !== 'verified' && '*'}</label><textarea value={actionNote} onChange={event => setActionNote(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={action.nextStatus === 'returned' ? 'Explain what needs to be corrected.' : 'What was done or checked?'} /></div>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setAction(null)} className="rounded-lg px-3 py-2 text-sm text-slate-600">Cancel</button><button type="button" onClick={() => void updateStatus()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Confirm</button></div></div>}
      </Modal>

      <Modal isOpen={Boolean(historyInstruction)} onClose={() => setHistoryInstruction(null)} title={historyInstruction ? `History · ${historyInstruction.title}` : 'Instruction history'} size="lg">
        <div className="space-y-3">{audits.length === 0 ? <p className="text-sm text-slate-500">No history recorded.</p> : audits.map(entry => <div key={String(entry.id)} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-800">{instructionStatusLabel(entry.action as InstructionStatus) || entry.action}</span><span className="text-xs text-slate-500">{entry.actor_username || 'System'} · {formatDateTime(entry.created_at)}</span></div>{entry.note && <p className="mt-1 text-sm text-slate-600">{entry.note}</p>}</div>)}</div>
      </Modal>
    </div>
  );
}

