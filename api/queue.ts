// api/queue.ts
import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  const client = getDb();

  // Ensure table structure exists
  await client.execute(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      mf_code TEXT,
      type_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      progress_percent REAL DEFAULT 0,
      days_processed INTEGER DEFAULT 0,
      total_days INTEGER DEFAULT 0,
      rows_added INTEGER DEFAULT 0,
      current_date_str TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (req.method === 'GET') {
    try {
      // Fetch all historical and active jobs (newest first)
      const result = await client.execute(
        "SELECT * FROM sync_queue ORDER BY id DESC LIMIT 50;"
      );
      return res.status(200).json({ jobs: result.rows });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    const { action, fromDate, toDate, mfCode, typeCode, jobId, progress } = req.body;

    try {
      // Action: Add new job to queue
      if (action === 'enqueue') {
        const totalDays = Math.round(
          (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 3600 * 24)
        ) + 1;

        const result = await client.execute({
          sql: `INSERT INTO sync_queue (from_date, to_date, mf_code, type_code, total_days, status) 
                VALUES (?, ?, ?, ?, ?, 'pending') 
                RETURNING id;`,
          args: [fromDate, toDate, mfCode || "", typeCode || "", totalDays]
        });

        const newId = result.rows[0]?.id;
        return res.status(200).json({ success: true, jobId: newId });
      }

      // Action: Claim next pending job atomically
      if (action === 'claim_next') {
        const pending = await client.execute(
          "SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 1;"
        );

        if (pending.rows.length === 0) {
          return res.status(200).json({ job: null });
        }

        const job = pending.rows[0];
        
        // Claim job
        await client.execute({
          sql: "UPDATE sync_queue SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending';",
          args: [job.id]
        });

        return res.status(200).json({ job });
      }

      // Action: Update live progress for a job
      if (action === 'update_progress') {
        await client.execute({
          sql: `UPDATE sync_queue 
                SET progress_percent = ?, 
                    days_processed = ?, 
                    rows_added = ?, 
                    current_date_str = ?, 
                    status = ?, 
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?;`,
          args: [
            progress.percent,
            progress.days_processed,
            progress.rows_added,
            progress.current_date_str || "",
            progress.status || 'in_progress',
            jobId
          ]
        });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: "Invalid action" });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}