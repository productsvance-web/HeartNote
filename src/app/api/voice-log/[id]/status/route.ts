import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('daily_logs')
    .select('processing_status, transcribed_text, processing_error')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'not found' }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: { 'cache-control': 'no-store' },
  });
}
