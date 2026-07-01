export interface User {
  id: string; // uuid
  name: string;
  email: string;
  username?: string;
  password?: string; // hashed server-side only; do not expose to clients
  hasPassword?: boolean;
}

export interface AdminUser {
  id: string;
  username: string;
  password?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface Team {
  id: string;
  name: string;
  leader_id: string;
  members: TeamMember[];
  score: number;
  event: EventKey;
  event_date?: string; // ISO date (YYYY-MM-DD)
  slot_time?: string;  // HH:MM:SS
  slot_end?: string;   // HH:MM:SS
}

export type EventKey = 'escape-exe-ii';
export const DEFAULT_EVENT: EventKey = 'escape-exe-ii';
export const EVENTS: { key: EventKey; name: string }[] = [
  { key: 'escape-exe-ii', name: 'ESCAPE.EXE II' },
];
