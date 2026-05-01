import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Returns the full state needed by the client to render the review screen
// (status, transcript, summary observations, AND the structured tile columns
// Claude populated). RLS on daily_logs ensures cross-caregiver reads are
// rejected — the auth check below is for clean error messaging only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('daily_logs')
    .select(
      [
        'processing_status',
        'transcribed_text',
        'processing_error',
        'structured_observations',
        // Primary-tile columns
        'weight_lb',
        'systolic_bp',
        'diastolic_bp',
        'resting_hr',
        'spo2',
        'dyspnea_level',
        'pillow_count',
        'pnd_episode',
        'cough_present',
        'cough_nocturnal',
        'sputum_color',
        'swelling_severity',
        'cyanosis',
        'chest_pain',
        'syncope',
        'appetite_change',
        'early_satiety',
        'fatigue_level',
        'cognition_change',
        // Background-only columns surfaced in the "more notes" expand
        'feeling_score',
        'extremities_cold_clammy',
        'urine_output_change',
        'chest_pain_character',
        'activity_tolerance_change',
      ].join(', ')
    )
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: { 'cache-control': 'no-store' },
  });
}
