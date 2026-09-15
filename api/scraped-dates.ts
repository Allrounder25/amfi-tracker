import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const client = getDb();
    
    // Fetch unique dates that already exist in the database
    const result = await client.execute("SELECT DISTINCT date FROM nav_history ORDER BY date DESC;");
    const dates = result.rows.map((row: any) => row.date as string);
    
    return res.status(200).json({ dates });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}