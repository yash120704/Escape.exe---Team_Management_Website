import { NextResponse, type NextRequest } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import type { Team } from '@/lib/types';

interface Context {
  params: Promise<{ id: string }>;
}

// PATCH to update a team's attributes
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id: teamId } = await context.params;
    const { score, name } = await request.json() as Partial<Pick<Team, 'score' | 'name'>>;

    // First check if the team exists
    const client = supabaseAdmin || supabase;
    const { data: team, error: fetchError } = await client
      .from('teams')
      .select('name')
      .eq('id', teamId)
      .single();

    if (fetchError || !team) {
      return NextResponse.json({ message: 'Team not found.' }, { status: 404 });
    }

    const updates: Partial<Team> = {};
    const updatedFields: string[] = [];

    if (score !== undefined) {
      if (typeof score !== 'number') {
        return NextResponse.json({ message: 'Score must be a number.' }, { status: 400 });
      }
      updates.score = score;
      updatedFields.push('score');
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return NextResponse.json({ message: 'Team name must be at least 2 characters.' }, { status: 400 });
      }
      updates.name = name.trim();
      updatedFields.push('name');
    }
    
    if (updatedFields.length === 0) {
      return NextResponse.json({ message: 'No fields to update.' }, { status: 400 });
    }

    const { error: updateError } = await client
      .from('teams')
      .update(updates)
      .eq('id', teamId);

    if (updateError) {
      return NextResponse.json({ message: 'Error updating team.' }, { status: 500 });
    }

    return NextResponse.json({ 
      message: `Team ${updates.name || team.name} updated successfully (${updatedFields.join(', ')}).` 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ message: 'An internal server error occurred.' }, { status: 500 });
  }
}
