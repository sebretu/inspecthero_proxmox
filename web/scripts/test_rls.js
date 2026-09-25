import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://188.245.42.178:54321';
const supabaseKey = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRLS() {
  try {
    // Test INSERT do task_photos
    const { data: insertPhoto, error: insertPhotoError } = await supabase.from('task_photos').insert({
      id: crypto.randomUUID(),
      task_id: '29999999-9999-9999-9999-999999999999',
      url: 'https://example.com/test.jpg',
      uploaded_by: '44444444-4444-4444-4444-444444444444',
      storage_bucket: 'task-photos',
      storage_path: 'test.jpg'
    });
    if (insertPhotoError) {
      console.log('RLS test: task_photos INSERT error:', insertPhotoError.message);
    } else {
      console.log('RLS test: task_photos INSERT OK');
    }

    // Test DELETE task (status OPEN)
    const { error: deleteTaskError } = await supabase.from('tasks').delete().eq('id', '25b1a7e5-7618-40fb-8585-d3a08a550f12');
    if (deleteTaskError) {
      console.log('RLS test: tasks DELETE error:', deleteTaskError.message);
    } else {
      console.log('RLS test: tasks DELETE OK');
    }
  } catch (e) {
    console.error('RLS test: unexpected error', e);
  }
}

testRLS();
