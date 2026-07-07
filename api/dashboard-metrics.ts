import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const client = getDb();

    const results = await client.batch([
      { sql: "SELECT COUNT(*) as count FROM nav_history", args: [] },
      { sql: "SELECT COUNT(DISTINCT scheme_code) as count FROM nav_history", args: [] },
      { sql: "SELECT MAX(date) as max_date FROM nav_history", args: [] },
      { sql: "SELECT COUNT(*) as count FROM nav_history WHERE date >= date((SELECT MAX(date) FROM nav_history), '-7 days')", args: [] }
    ], "read");

    const totalRecords = results[0].rows[0]?.count as number || 0;
    const trackedFunds = results[1].rows[0]?.count as number || 0;
    const lastSyncedRaw = results[2].rows[0]?.max_date as string || "";
    const recordsThisWeek = results[3].rows[0]?.count as number || 0;

    let lastSynced = "Never";
    if (lastSyncedRaw) {
      const parts = lastSyncedRaw.split("-");
      if (parts.length === 3) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        lastSynced = `${parts[2]}-${months[parseInt(parts[1], 10) - 1]}-${parts[0]}`;
      }
    }

    return res.status(200).json({
      total_records: totalRecords,
      tracked_funds: trackedFunds,
      last_synced: lastSynced,
      records_this_week: recordsThisWeek,
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}