export type InstructionPriority = 'low' | 'normal' | 'high' | 'urgent';
export type InstructionStatus = 'posted' | 'acknowledged' | 'in_progress' | 'completed' | 'verified' | 'returned' | 'cancelled';

export interface Instruction {
  id: string;
  title: string;
  details: string;
  priority: InstructionPriority;
  sequence_no: number;
  scheduled_for?: string | null;
  due_at?: string | null;
  assigned_username?: string | null;
  assigned_shift_number?: number | null;
  milk_lot_code?: string | null;
  related_round_id?: string | null;
  status: InstructionStatus;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  completion_note?: string | null;
  verification_note?: string | null;
}

export interface InstructionAudit {
  id: number | string;
  instruction_id: string;
  action: string;
  actor_id?: string | null;
  actor_username?: string | null;
  note?: string | null;
  before_value?: Record<string, unknown> | null;
  after_value?: Record<string, unknown> | null;
  created_at: string;
}

export const instructionStatuses: InstructionStatus[] = [
  'posted',
  'acknowledged',
  'in_progress',
  'completed',
  'verified',
  'returned',
  'cancelled',
];

export function instructionStatusLabel(status: InstructionStatus) {
  return status.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function instructionPriorityLabel(priority: InstructionPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

