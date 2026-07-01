import type { Team, User, EventKey, AdminUser } from './types';
import { supabase } from './supabase';

export const MAX_TEAM_MEMBERS = 4;

function directWriteBlocked(): never {
  throw new Error('Direct Supabase writes are blocked by RLS. Use the matching server-side API route instead.');
}

// Admin functions
export async function getAdmin(username: string) {
  const { data, error } = await supabase
    .from('admin')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error) throw error;
  return data as AdminUser;
}

// User functions
export async function getUser(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as User;
}

// Team functions
export async function getTeam(id: string) {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as Team;
}

export async function createTeam(team: Omit<Team, 'id'>) {
  directWriteBlocked();
}

export async function updateTeam(id: string, updates: Partial<Team>) {
  directWriteBlocked();
}

// Event registration functions


export async function getEventRegistrations(eventKey: EventKey) {
  const { data, error } = await supabase
    .from('event_registration')
    .select('user_email')
    .eq('event_key', eventKey);
  if (error) throw error;
  return new Set(data.map(r => r.user_email));
}

export async function registerForEvent(eventKey: EventKey, userEmail: string, regNo: string) {
  directWriteBlocked();
}
