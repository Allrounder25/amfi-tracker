import { getDb } from "./db.js";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fromDate, toDate, mf, tp } = req.body;
    const client = getDb();

    let filterClauses = "";
    const args: any[] = [toDate, fromDate];

    if (mf && mf.length > 0) {
      const condition = mf.map(() => "scheme_name LIKE ?").join(" OR ");
      filterClauses += ` AND (${condition})`;
      mf.forEach((val: string) => args.push(`%${val}%`));
    }

    const query = `
      WITH TargetDates AS (
          SELECT scheme_code, scheme_name, nav as current_nav, date
          FROM nav_history
          WHERE date <= ? AND date >= ? ${filterClauses}
          GROUP BY scheme_code
          HAVING date = MAX(date)
      )
      SELECT 
          t.scheme_code, t.scheme_name, t.current_nav,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-7 days') ORDER BY n.date DESC LIMIT 1) as nav_1w,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-1 month') ORDER BY n.date DESC LIMIT 1) as nav_1m,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-3 months') ORDER BY n.date DESC LIMIT 1) as nav_3m,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-6 months') ORDER BY n.date DESC LIMIT 1) as nav_6m,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-1 year') ORDER BY n.date DESC LIMIT 1) as nav_1y,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-3 years') ORDER BY n.date DESC LIMIT 1) as nav_3y,
          (SELECT nav FROM nav_history n WHERE n.scheme_code = t.scheme_code AND n.date <= date(t.date, '-5 years') ORDER BY n.date DESC LIMIT 1) as nav_5y
      FROM TargetDates t
      ORDER BY t.scheme_name ASC LIMIT 100;
    `;

    const records = await client.execute({ sql: query, args });

    const calcReturn = (current: number, old: number | null) => {
      if (!old || old === 0) return "N/A";
      const ret = ((current - old) / old) * 100;
      return `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`;
    };

    const results = records.rows.map((row: any) => {
      const currentNav = row.current_nav as number;
      return {
        scheme_code: row.scheme_code,
        scheme_name: row.scheme_name,
        current_nav: currentNav,
        return_1w: calcReturn(currentNav, row.nav_1w as number),
        return_1m: calcReturn(currentNav, row.nav_1m as number),
        return_3m: calcReturn(currentNav, row.nav_3m as number),
        return_6m: calcReturn(currentNav, row.nav_6m as number),
        return_1y: calcReturn(currentNav, row.nav_1y as number),
        return_3y: calcReturn(currentNav, row.nav_3y as number),
        return_5y: calcReturn(currentNav, row.nav_5y as number),
      };
    });

    return res.status(200).json(results);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}