import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres'
  });
  
  const planId = '633c788d-fe28-4f0d-97f1-87d2affe9021';
  
  try {
    await client.connect();
    
    console.log("--- TASKS WITH COORDINATES ---");
    const tasks = await client.query('SELECT id, x_norm, y_norm, title, updated_at FROM tasks WHERE plan_id = $1', [planId]);
    console.log(`Found ${tasks.rows.length} tasks:`);
    console.log(tasks.rows.slice(0, 10));

    console.log("--- TASK HISTORY FOR PLAN ---");
    // Since task_history might reference task_id, let's join with tasks
    const taskHist = await client.query(`
      SELECT th.id, th.task_id, th.changed_by, th.change_type, th.old_value, th.new_value, th.created_at, t.title
      FROM task_history th
      JOIN tasks t ON th.task_id = t.id
      WHERE t.plan_id = $1
      ORDER BY th.created_at DESC
      LIMIT 30
    `, [planId]);
    console.log(JSON.stringify(taskHist.rows, null, 2));

    console.log("--- FEHLER HISTORY ---");
    const fehlerHist = await client.query(`
      SELECT fh.id, fh.fehler_id, fh.changed_by, fh.change_type, fh.old_value, fh.new_value, fh.created_at
      FROM fehler_history fh
      JOIN fehler f ON fh.fehler_id = f.id
      WHERE f.plan_id = $1
      ORDER BY fh.created_at DESC
      LIMIT 10
    `, [planId]);
    console.log(JSON.stringify(fehlerHist.rows, null, 2));

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
