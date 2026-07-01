import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

// POST to leave a team
export async function POST(request: NextRequest) {
  try {
    const { userId, teamId } = await request.json();

    if (!userId || !teamId) {
      return NextResponse.json({ message: 'Missing userId or teamId.' }, { status: 400 });
    }

    // Fetch the team from Supabase
    const client = supabaseAdmin || supabase;
    const { data: team, error: fetchError } = await client
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (fetchError || !team) {
      return NextResponse.json({ message: 'Team not found.' }, { status: 404 });
    }

    const members = team.members || [];
    const memberIndex = members.findIndex((m: any) => m.id === userId);
    if (memberIndex === -1) {
      return NextResponse.json({ message: 'You are not a member of this team.' }, { status: 403 });
    }

    const addUserBackToPool = async () => {
      const { data: userRow } = await client
        .from('users')
        .select('name, email')
        .eq('id', userId)
        .single();

      await client
        .from('random_pool')
        .upsert({
          user_id: userId,
          user_name: userRow?.name || '',
          user_email: userRow?.email || '',
          event: team.event,
          event_date: (team as any).event_date
        }, { onConflict: 'user_id,event' as any });
    };

    // If the user is the leader
    if (team.leader_id === userId) {
      const updatedMembers = members.filter((m: any) => m.id !== userId);
      if (updatedMembers.length === 0) {
        // Last member, disband team
        const { error: deleteError } = await client
          .from('teams')
          .delete()
          .eq('id', teamId);
        if (deleteError) {
          return NextResponse.json({ message: 'Error disbanding team.' }, { status: 500 });
        }
        // Add user back to random pool with date context
        await addUserBackToPool();
        return NextResponse.json({ message: 'You have left the team, and the team has been disbanded.' }, { status: 200 });
      } else {
        // Assign new leader (first member in the list)
        const newLeaderId = updatedMembers[0].id;
        const { error: updateError } = await client
          .from('teams')
          .update({ members: updatedMembers, leader_id: newLeaderId })
          .eq('id', teamId);
        if (updateError) {
          return NextResponse.json({ message: 'Error updating team.' }, { status: 500 });
        }
        // Add user back to random pool with date context
        await addUserBackToPool();
        return NextResponse.json({ message: 'You have left the team. Leadership has been transferred to the next member.' }, { status: 200 });
      }
    }

    // If the user is a regular member
    const updatedMembers = members.filter((m: any) => m.id !== userId);
    const { error: updateError } = await client
      .from('teams')
      .update({ members: updatedMembers })
      .eq('id', teamId);
    if (updateError) {
      return NextResponse.json({ message: 'Error updating team.' }, { status: 500 });
    }
    // Add user back to random pool with date context
    await addUserBackToPool();
    return NextResponse.json({ message: 'You have successfully left the team.' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
