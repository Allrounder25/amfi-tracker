export const config = {
  runtime: 'edge', // Edge functions are ultra-fast and perfect for simple fetch/regex tasks
};

export default async function handler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
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

    // Regex to extract dropdown blocks
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

    const mfOptions = extractOptions(mfMatch?.[1]);
    const tpOptions = extractOptions(tpMatch?.[1]);

    return new Response(
      JSON.stringify({
        source: "live",
        mf: mfOptions,
        tp: tpOptions,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=3600, stale-while-revalidate', // Cache for 1 hour to save Vercel usage
        },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ source: "error", message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}