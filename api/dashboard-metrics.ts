// api/dashboard-metrics.ts
import { getDb } from "./db.js";

export default async function handler(req: Request) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const client = getDb();

    // 1. Core aggregations run inside a parallel batch request to save round-trips
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

    // Format ISO date (YYYY-MM-DD) safely to a cleaner presentation layout
    let lastSynced = "Never";
    if (lastSyncedRaw) {
      const parts = lastSyncedRaw.split("-");
      if (parts.length === 3) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        lastSynced = `${parts[2]}-${months[parseInt(parts[1], 10) - 1]}-${parts[0]}`;
      }
    }

    return new Response(
      JSON.stringify({
        total_records: totalRecords,
        tracked_funds: trackedFunds,
        last_synced: lastSynced,
        records_this_week: recordsThisWeek,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}