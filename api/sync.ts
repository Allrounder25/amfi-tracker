import { getDb } from "./db";

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { fromDate, toDate, mf, tp } = await req.json();

    // Helper: Convert ISO 'YYYY-MM-DD' to AMFI 'DD-MMM-YYYY'
    const formatToAmfiDate = (isoString: string) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const [year, month, day] = isoString.split("-");
      return `${day}-${months[parseInt(month, 10) - 1]}-${year}`;
    };

    const amfiFrom = formatToAmfiDate(fromDate);
    const amfiTo = formatToAmfiDate(toDate);

    // Call AMFI Endpoint
    const amfiUrl = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=${mf || ''}&tp=${tp || ''}&frmdt=${amfiFrom}&todt=${amfiTo}`;
    
    const response = await fetch(amfiUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) throw new Error(`AMFI Portal down: ${response.status}`);
    const text = await response.text();
    const lines = text.split(/\r?\n/);

    const client = getDb();
    
    // Ensure table structure exists in Turso
    await client.execute(`
      CREATE TABLE IF NOT EXISTS nav_history (
        scheme_code INTEGER,
        scheme_name TEXT,
        nav REAL,
        date TEXT,
        UNIQUE(scheme_code, date)
      );
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_date ON nav_history(date);`);

    let rowsAdded = 0;
    const summary: Record<string, number> = {};
    const insertStatements: any[] = [];

    // Parse incoming data lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(";");
      if (parts.length === 8 && /^\d+$/.test(parts[0])) {
        const schemeCode = parseInt(parts[0], 10);
        const schemeName = parts[1];
        const rawNav = parts[4];
        const rawDate = parts[7];

        if (rawNav && rawNav !== "N.A.") {
          const navValue = parseFloat(rawNav);
          
          // Re-parse 'DD-MMM-YYYY' text from AMFI file to ISO 'YYYY-MM-DD'
          const monthsMap: Record<string, string> = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06", Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
          const dateParts = rawDate.split("-");
          if (dateParts.length === 3) {
            const isoDate = `${dateParts[2]}-${monthsMap[dateParts[1]]}-${dateParts[0].padStart(2, '0')}`;
            
            // Queue up statements for an optimized batch transaction
            insertStatements.push({
              sql: "INSERT OR IGNORE INTO nav_history (scheme_code, scheme_name, nav, date) VALUES (?, ?, ?, ?)",
              args: [schemeCode, schemeName, navValue, isoDate]
            });

            // Increment micro summaries
            const amc = schemeName.split(" ")[0] || schemeName;
            summary[amc] = (summary[amc] || 0) + 1;
            rowsAdded++;
          }
        }
      }
    }

    // Execute batch inside a transaction in cloud memory
    if (insertStatements.length > 0) {
      await client.batch(insertStatements, "write");
    }

    return new Response(JSON.stringify({ rows_added: rowsAdded, summary }), {
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