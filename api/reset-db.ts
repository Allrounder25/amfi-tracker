// api/reset-db.ts
import { getDb } from "./db.js";

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const client = getDb();

    // Drop the schema entirely to wipe tracked logs
    await client.execute("DROP TABLE IF EXISTS nav_history;");

    return new Response(JSON.stringify({ success: true, message: "Database tables dropped successfully" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}