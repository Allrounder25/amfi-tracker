import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const client = getDb();
    await client.execute("DROP TABLE IF EXISTS nav_history;");
    
    return res.status(200).json({ success: true, message: "Database tables dropped successfully" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}