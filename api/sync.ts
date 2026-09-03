import { getDb } from "./db.js";

export const maxDuration = 60;

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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[Sync Debug] Download finished in ${fetchDuration}ms with status ${response.status}`);

    const text = await response.text();

    if (!response.ok || (text.toLowerCase().includes("<html") && !text.includes(";"))) {
      return res.status(500).json({
        error: "AMFI returned invalid or HTML error content.",
        debug: { preview: text.substring(0, 300) }
      });
    }

    const lines = text.split(/\r?\n/);
    console.log(`[Sync Debug] Total raw lines to process: ${lines.length}`);

    const rawSampleLines = lines.map(l => l.trim()).filter(l => l.length > 0).slice(0, 5);
    console.log(`[Sync Debug] First 5 raw lines received from AMFI:\n`, JSON.stringify(rawSampleLines, null, 2));

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

    const monthsMap: Record<string, string> = { 
      jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06", 
      jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12"
    };

    let skippedLinesCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(";");
      // Validate line has schema code as first element and at least 8 semicolon columns
      if (parts.length >= 8 && /^\d+$/.test(parts[0].trim())) {
        const schemeCode = parseInt(parts[0].trim(), 10);
        const schemeName = parts[1]?.trim() || "Unknown Scheme";
        const rawNav = parts[6]?.trim();  // Index 6 is Net Asset Value
        const rawDate = parts[7]?.trim(); // Index 7 is Date

        if (rawNav && rawNav !== "N.A." && rawNav !== "-") {
          const sanitizedNav = rawNav.replace(/,/g, '').trim();
          const navValue = parseFloat(sanitizedNav);
          
          if (!Number.isFinite(navValue)) {
            skippedLinesCount++;
            continue;
          }

          if (rawDate) {
            const dateParts = rawDate.split("-");
            if (dateParts.length === 3) {
              const monthKey = dateParts[1].trim().toLowerCase();
              const isoMonth = monthsMap[monthKey];

              if (isoMonth) {
                const day = dateParts[0].trim().padStart(2, '0');
                const year = dateParts[2].trim();
                const isoDate = `${year}-${isoMonth}-${day}`;

                insertStatements.push({
                  sql: "INSERT OR IGNORE INTO nav_history (scheme_code, scheme_name, nav, date) VALUES (?, ?, ?, ?)",
                  args: [schemeCode, schemeName, navValue, isoDate]
                });

                const amc = schemeName.split(" ")[0] || schemeName;
                summary[amc] = (summary[amc] || 0) + 1;
                rowsAdded++;
                continue;
              }
            }
          }
        }
        skippedLinesCount++;
      }
    }

    console.log(`[Sync Debug] Skipped numeric lines (invalid date/NAV): ${skippedLinesCount}`);

    if (insertStatements.length > 0) {
      console.log(`[Sync Debug] First 3 parsed statements for Turso:\n`, JSON.stringify(insertStatements.slice(0, 3), null, 2));
    } else {
      console.warn(`[Sync Debug] Warning: 0 statements parsed from raw data.`);
    }

    console.log(`[Turso Sync] Inserting ${insertStatements.length} valid statements in chunked batches...`);

    const BATCH_SIZE = 1000;
    for (let i = 0; i < insertStatements.length; i += BATCH_SIZE) {
      const chunk = insertStatements.slice(i, i + BATCH_SIZE);
      await client.batch(chunk, "write");
      console.log(`[Turso Sync] Processed batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(insertStatements.length / BATCH_SIZE)}`);
    }

    return res.status(200).json({ rows_added: rowsAdded, summary });

  } catch (error: any) {
    console.error(`[Sync Database Error]`, error.message);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}
