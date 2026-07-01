import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: teamId } = await params;
  const { memberId } = await request.json();
  if (!teamId || !memberId) {
    return NextResponse.json({ message: 'Missing teamId or memberId.' }, { status: 400 });
  }
  // Fetch team
  const client = supabaseAdmin || supabase;
  const { data: team, error: teamError } = await client
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();
  if (teamError || !team) {
    return NextResponse.json({ message: 'Team not found.' }, { status: 404 });
  }

  const removedMember = (team.members || []).find((m: any) => m.id === memberId);
  if (!removedMember) {
    return NextResponse.json({ message: 'Member not found in this team.' }, { status: 404 });
  }

  const addRemovedMemberToPool = async () => {
    await client
      .from('random_pool')
      .upsert({
        user_id: memberId,
        user_name: removedMember.name,
        user_email: removedMember.email,
        event: team.event,
        event_date: team.event_date,
      }, { onConflict: 'user_id,event' as any });
  };

  // Remove member
  const updatedMembers = (team.members || []).filter((m: any) => m.id !== memberId);
  // If leader is removed, assign new leader if possible
  let newLeaderId = team.leader_id;
  if (team.leader_id === memberId && updatedMembers.length > 0) {
    newLeaderId = updatedMembers[0].id;
  }
  // If no members left, delete team
  if (updatedMembers.length === 0) {
    await client.from('teams').delete().eq('id', teamId);
    await addRemovedMemberToPool();
    return NextResponse.json({ message: 'Team disbanded (no members left).' });
  }
  // Update team
  const { error: updateError } = await client
    .from('teams')
    .update({ members: updatedMembers, leader_id: newLeaderId })
    .eq('id', teamId);
  if (updateError) {
    return NextResponse.json({ message: 'Error updating team.' }, { status: 500 });
  }
  await addRemovedMemberToPool();
  return NextResponse.json({ message: 'Member removed successfully.' });
}
