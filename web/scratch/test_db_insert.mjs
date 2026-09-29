import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/inspecthero-web.env' });

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@100.88.160.117:54322/postgres' 
  });
  
  try {
    await client.connect();
    
    // Check columns
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'pdf_sessions';
    `);
    console.log("Columns:", res.rows);
    
    // Test a dummy insert
    // We'll use a dummy UUID
    const dummyId = '00000000-0000-0000-0000-000000000000';
    try {
      await client.query(`
        INSERT INTO public.pdf_sessions (user_id, name, pdf_url, symbols, texts, cutouts, zoom, page_number)
        VALUES ($1, $2, $3, '[]', '[]', '[]', 1.0, 1)
      `, [dummyId, "test.pdf", "http://test.com/test.pdf"]);
      console.log("Insert successful!");
    } catch(err) {
      console.error("Insert error:", err.message);
    }

  } catch(e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}
main();
