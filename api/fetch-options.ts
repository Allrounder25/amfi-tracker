export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const url = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx";
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`AMFI server responded with status: ${response.status}`);
    }

    const html = await response.text();

    const mfMatch = html.match(/<select[^>]*?ddlMF[^>]*>([\s\S]*?)<\/select>/i);
    const tpMatch = html.match(/<select[^>]*?ddlType[^>]*>([\s\S]*?)<\/select>/i);
    const optionRegex = /<option[^>]*?value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;

    const extractOptions = (htmlBlock: string | undefined) => {
      if (!htmlBlock) return [];
      const options = [];
      let match;
      while ((match = optionRegex.exec(htmlBlock)) !== null) {
        const value = match[1].trim();
        const label = match[2].trim();
        if (value) options.push({ value, label });
      }
      return options;
    };

    // Setting cache headers for Node.js
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json({
      source: "live",
      mf: extractOptions(mfMatch?.[1]),
      tp: extractOptions(tpMatch?.[1]),
    });
  } catch (error: any) {
    return res.status(500).json({ source: "error", message: error.message });
  }
}