import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fromDate, toDate, mf, tp } = req.body || {};
    
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: "Missing required date fields in request body." });
    }

    const formatToAmfiDate = (isoString: string) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const [year, month, day] = isoString.split("-");
      return `${day}-${months[parseInt(month, 10) - 1]}-${year}`;
    };

    const amfiFrom = formatToAmfiDate(fromDate);
    const amfiTo = formatToAmfiDate(toDate);

    const amfiUrl = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=${mf || ''}&tp=${tp || ''}&frmdt=${amfiFrom}&todt=${amfiTo}`;
    
    console.log(`[Sync Debug] Initiating request to: ${amfiUrl}`);
    const fetchStart = Date.now();
    
    const response = await fetch(amfiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[Sync Debug] Received status ${response.status} in ${fetchDuration}ms`);

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `AMFI Portal rejected the request (Status ${response.status})`,
        debug: {
          url: amfiUrl,
          durationMs: fetchDuration,
          responsePreview: text.substring(0, 500)
        }
      });
    }

    if (text.toLowerCase().includes("<html") && !text.includes(";")) {
      return res.status(500).json({
        error: "AMFI returned an HTML page instead of CSV data. The request was likely blocked.",
        debug: {
          url: amfiUrl,
          durationMs: fetchDuration,
          responsePreview: text.substring(0, 500)
        }
      });
    }

    const lines = text.split(/\r?\n/);
    console.log(`[Sync Debug] Successfully downloaded ${lines.length} lines of NAV data.`);

    const client = getDb();
    
    await client.execute(`
      CREATE TABLE IF NOT EXISTS nav_history (
        scheme_code INTEGER, scheme_name TEXT, nav REAL, date TEXT,
        UNIQUE(scheme_code, date)
      );
    `);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_date ON nav_history(date);`);

    let rowsAdded = 0;
    const summary: Record<string, number> = {};
    const insertStatements: any[] = [];

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
          
          const monthsMap: Record<string, string> = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06", Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };
          const dateParts = rawDate.split("-");
          if (dateParts.length === 3) {
            const isoDate = `${dateParts[2]}-${monthsMap[dateParts[1]]}-${dateParts[0].padStart(2, '0')}`;
            
            insertStatements.push({
              sql: "INSERT OR IGNORE INTO nav_history (scheme_code, scheme_name, nav, date) VALUES (?, ?, ?, ?)",
              args: [schemeCode, schemeName, navValue, isoDate]
            });

            const amc = schemeName.split(" ")[0] || schemeName;
            summary[amc] = (summary[amc] || 0) + 1;
            rowsAdded++;
          }
        }
      }
    }

    if (insertStatements.length > 0) {
      await client.batch(insertStatements, "write");
    }

    return res.status(200).json({ rows_added: rowsAdded, summary });

  } catch (error: any) {
    return res.status(500).json({ 
      error: error.message,
      debug: { stack: error.stack }
    });
  }
}
