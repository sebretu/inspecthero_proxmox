import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const photoId = '55be61b8-05f6-4424-8d71-a036c6ab2fe5';

async function run() {
  console.log("1. Checking in aufmass_photos...");
  const { data: photo, error: fetchErr } = await supabase
    .from("aufmass_photos")
    .select("session_id")
    .eq("id", photoId)
    .single();

  console.log("aufmass_photos result:", { photo, fetchErr });

  console.log("2. Checking in task_photos...");
  const { data: taskPhoto, error: taskPhotoErr } = await supabase
    .from("task_photos")
    .select("task_id, uploaded_by")
    .eq("id", photoId)
    .single();

  console.log("task_photos result:", { taskPhoto, taskPhotoErr });

  if (taskPhoto) {
    console.log("3. Fetching task details...");
    const { data: taskDetails, error: taskDetailsErr } = await supabase
      .from("tasks")
      .select("assigned_user_id, is_question, created_by")
      .eq("id", taskPhoto.task_id)
      .single();

    console.log("tasks result:", { taskDetails, taskDetailsErr });
  }
}

run().catch(console.error);
