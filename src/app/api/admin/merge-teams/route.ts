import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { MAX_TEAM_MEMBERS } from '@/lib/db';

// POST /api/admin/merge-teams
// Body: { sourceTeamId: string, targetTeamId: string, maxTransfer?: number }
// Flexibly merges source team members into target team, enforcing same event and date, and capacity
export async function POST(request: NextRequest) {
  try {
    const { sourceTeamId, targetTeamId, maxTransfer } = await request.json();
    if (!sourceTeamId || !targetTeamId) {
      return NextResponse.json({ message: 'Missing sourceTeamId or targetTeamId.' }, { status: 400 });
    }
    if (sourceTeamId === targetTeamId) {
      return NextResponse.json({ message: 'Source and target teams must be different.' }, { status: 400 });
    }

    // Fetch both teams
    const client = supabaseAdmin || supabase;
    const { data: sourceTeam, error: srcErr } = await client
      .from('teams')
      .select('*')
      .eq('id', sourceTeamId)
      .single();
    if (srcErr || !sourceTeam) {
      return NextResponse.json({ message: 'Source team not found.' }, { status: 404 });
    }

    const { data: targetTeam, error: tgtErr } = await client
      .from('teams')
      .select('*')
      .eq('id', targetTeamId)
      .single();
    if (tgtErr || !targetTeam) {
      return NextResponse.json({ message: 'Target team not found.' }, { status: 404 });
    }

    // Enforce same event and same event_date
    if (sourceTeam.event !== targetTeam.event) {
      return NextResponse.json({ message: 'Teams must be for the same event.' }, { status: 400 });
    }
    if ((sourceTeam as any).event_date !== (targetTeam as any).event_date) {
      return NextResponse.json({ message: 'Teams must have the same event date.' }, { status: 400 });
    }

    const sourceMembers = sourceTeam.members || [];
    const targetMembers = targetTeam.members || [];

    // Ensure no duplicate users
    const targetMemberIds = new Set<string>(targetMembers.map((m: any) => m.id));
    const uniqueSourceMembers = sourceMembers.filter((m: any) => !targetMemberIds.has(m.id));

    if (uniqueSourceMembers.length === 0) {
      return NextResponse.json({ message: 'No unique members to transfer from source team.' }, { status: 400 });
    }

    // Calculate how many members can be transferred
    const availableSlots = MAX_TEAM_MEMBERS - targetMembers.length;
    const transferLimit = maxTransfer ? Math.min(maxTransfer, availableSlots) : availableSlots;
    const membersToTransfer = uniqueSourceMembers.slice(0, transferLimit);
    const remainingSourceMembers = uniqueSourceMembers.slice(transferLimit);

    if (membersToTransfer.length === 0) {
      return NextResponse.json({ 
        message: `Target team is full. Cannot transfer any members.` 
      }, { status: 400 });
    }

    // Update target team with transferred members
    const mergedMembers = [...targetMembers, ...membersToTransfer];
    const { error: updateErr } = await client
      .from('teams')
      .update({ members: mergedMembers })
      .eq('id', targetTeam.id);
    if (updateErr) {
      return NextResponse.json({ message: 'Failed to update target team.' }, { status: 500 });
    }

    // Handle source team based on remaining members
    let sourceTeamAction = '';
    if (remainingSourceMembers.length === 0) {
      // All members transferred, delete source team
      const { error: deleteErr } = await client
        .from('teams')
        .delete()
        .eq('id', sourceTeam.id);
      if (deleteErr) {
        return NextResponse.json({ message: 'Failed to delete source team after merge.' }, { status: 500 });
      }
      sourceTeamAction = 'deleted';
    } else {
      // Some members remain, update source team with remaining members
      const nextSourceLeaderId = remainingSourceMembers.some((m: any) => m.id === sourceTeam.leader_id)
        ? sourceTeam.leader_id
        : remainingSourceMembers[0].id;

      const { error: updateSourceErr } = await client
        .from('teams')
        .update({ members: remainingSourceMembers, leader_id: nextSourceLeaderId })
        .eq('id', sourceTeam.id);
      if (updateSourceErr) {
        return NextResponse.json({ message: 'Failed to update source team after partial merge.' }, { status: 500 });
      }
      sourceTeamAction = 'updated';
    }

    return NextResponse.json({ 
      message: 'Teams merged successfully.', 
      targetTeamId: targetTeam.id,
      sourceTeamId: sourceTeam.id,
      transferredCount: membersToTransfer.length,
      remainingInSource: remainingSourceMembers.length,
      sourceTeamAction,
      transferredMembers: membersToTransfer.map((m: any) => ({ id: m.id, name: m.name, email: m.email }))
    });
  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}


