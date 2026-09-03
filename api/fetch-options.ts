export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const url = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx";
    console.log(`[AMFI Fetch] Requesting URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      },
    });

    console.log(`[AMFI Fetch] Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`AMFI server responded with status: ${response.status}`);
    }

    const html = await response.text();
    
    // Log the payload size and the first 500 characters to instantly spot Cloudflare blocks or 403 pages
    console.log(`[AMFI Scraper] HTML payload size: ${html.length} characters`);
    console.log(`[AMFI Scraper] HTML preview (first 500 chars):\n`, html.substring(0, 500));

    const mfMatch = html.match(/<select[^>]*?ddlMF[^>]*>([\s\S]*?)<\/select>/i);
    const tpMatch = html.match(/<select[^>]*?ddlType[^>]*>([\s\S]*?)<\/select>/i);

    // Verify if the regex successfully located the target <select> IDs
    console.log(`[AMFI Scraper] Matched ddlMF selector?`, !!mfMatch);
    console.log(`[AMFI Scraper] Matched ddlType selector?`, !!tpMatch);

    const optionRegex = /<option[^>]*?value="([^"]*)"[^>]*>([^<]+)<\/option>/gi;

    const extractOptions = (htmlBlock: string | undefined, blockName: string) => {
      if (!htmlBlock) {
         console.warn(`[AMFI Scraper] Warning: No HTML block found for ${blockName}`);
         return [];
      }
      const options = [];
      let match;
      while ((match = optionRegex.exec(htmlBlock)) !== null) {
        const value = match[1].trim();
        const label = match[2].trim();
        if (value) options.push({ value, label });
      }
      console.log(`[AMFI Scraper] Extracted ${options.length} options from ${blockName}`);
      return options;
    };

    const mfOptions = extractOptions(mfMatch?.[1], "ddlMF");
    const tpOptions = extractOptions(tpMatch?.[1], "ddlType");

    const isScraperFailing = mfOptions.length === 0 || tpOptions.length === 0;
    
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json({
      source: "live",
      mf: mfOptions,
      tp: tpOptions,
      // Pass the scraped DOM directly into the browser JSON response if it fails, saving you a trip to the server logs
      debug: isScraperFailing ? {
        status: response.status,
        htmlPreview: html.substring(0, 1500), 
        mfMatchFound: !!mfMatch,
        tpMatchFound: !!tpMatch
      } : undefined
    });
  } catch (error: any) {
    console.error(`[AMFI Error]`, error.message);
    return res.status(500).json({ 
      source: "error", 
      message: error.message,
      debugTrace: error.stack
    });
  }
}
