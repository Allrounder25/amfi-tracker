import { useState, useEffect, useRef } from "react";
import { usePreferences } from "../store/usePreferences";

interface AmfiOption { value: string; label: string; }
interface SyncProgress {
  percent: number;
  days_processed: number;
  total_days: number;
  current_date: string;
  rows_added: number;
}

export default function DownloadView() {
  const { config, savePreferences } = usePreferences();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [summaryData, setSummaryData] = useState<Record<string, number>>({});
  
  const [mfOptions, setMfOptions] = useState<AmfiOption[]>([]);
  const [tpOptions, setTpOptions] = useState<AmfiOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mfCode, setMfCode] = useState("");
  const [typeCode, setTypeCode] = useState("");

  const [recoveryData, setRecoveryData] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load permanent saved inputs and summary on startup
  useEffect(() => {
    if (config) {
      if (!fromDate && config.sync_from_date) setFromDate(config.sync_from_date);
      if (!toDate && config.sync_to_date) setToDate(config.sync_to_date);
      if (!mfCode && config.sync_mf) setMfCode(config.sync_mf);
      if (!typeCode && config.sync_tp) setTypeCode(config.sync_tp);
      
      if (Object.keys(summaryData).length === 0 && config.last_summary) {
        setSummaryData(config.last_summary);
      }
    }
  }, [config]);

  // Fetch Options
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const response = await fetch('/api/fetch-options');
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        if (data.mf) setMfOptions(data.mf);
        if (data.tp) setTpOptions(data.tp);
      } catch (err) {
        console.error("Failed to load options", err);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchDropdowns();

    const savedRecovery = localStorage.getItem("amfi_sync_recovery");
    if (savedRecovery) setRecoveryData(JSON.parse(savedRecovery));
  }, []);

  // Web Browser Close Warning (Replaces Tauri window listener)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSyncing) {
        e.preventDefault();
        e.returnValue = "Extraction in progress. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSyncing]);

  // Helper: Chunk Dates for Serverless Limits (30 days max per request)
  const generateChunks = (start: string, end: string, chunkSize = 30) => {
    const chunks = [];
    let current = new Date(start);
    const endDate = new Date(end);
    
    while (current <= endDate) {
      let chunkEnd = new Date(current);
      chunkEnd.setDate(current.getDate() + chunkSize - 1);
      if (chunkEnd > endDate) chunkEnd = endDate;
      
      chunks.push({
        start: current.toISOString().split('T')[0],
        end: chunkEnd.toISOString().split('T')[0],
        days: Math.round((chunkEnd.getTime() - current.getTime()) / (1000 * 3600 * 24)) + 1
      });
      
      current = new Date(chunkEnd);
      current.setDate(current.getDate() + 1);
    }
    return chunks;
  };

  const handleSync = async (isResume = false) => {
    let start = fromDate, end = toDate, mf = mfCode, tp = typeCode;

    if (isResume && recoveryData) {
      start = recoveryData.resumeFrom; end = recoveryData.toDate;
      mf = recoveryData.mfCode; tp = recoveryData.typeCode;
      setMfCode(mf); setTypeCode(tp); setToDate(end);
    } else if (!start || !end) {
      alert("Please select dates.");
      return;
    }

    if (config) savePreferences({ ...config, sync_from_date: start, sync_to_date: end, sync_mf: mf, sync_tp: tp });
    setIsSyncing(true);
    if (!isResume) setSummaryData({});
    
    abortControllerRef.current = new AbortController();

    try {
      const chunks = generateChunks(start, end);
      const totalDays = chunks.reduce((acc, curr) => acc + curr.days, 0);
      let daysProcessed = 0;
      let totalRowsAdded = 0;
      let currentSummary = { ...summaryData };

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Ping our new Vercel serverless function for just this 30-day window
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromDate: chunk.start,
            toDate: chunk.end,
            mf, tp
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        
        const result = await response.json();
        
        daysProcessed += chunk.days;
        totalRowsAdded += result.rows_added;
        
        // Merge summary breakdown
        Object.entries(result.summary).forEach(([amc, count]) => {
          currentSummary[amc] = (currentSummary[amc] || 0) + (count as number);
        });

        const percent = Math.min((daysProcessed / totalDays) * 100, 99.9);
        
        setProgress({
          percent: Math.round(percent * 100) / 100,
          days_processed: daysProcessed,
          total_days: totalDays,
          current_date: chunk.end,
          rows_added: totalRowsAdded
        });
        
        setSummaryData({ ...currentSummary });

        // Save recovery bookmark in case browser crashes
        if (i < chunks.length - 1) {
          const nextStart = chunks[i+1].start;
          localStorage.setItem("amfi_sync_recovery", JSON.stringify({ mfCode: mf, typeCode: tp, resumeFrom: nextStart, toDate: end }));
        }
      }

      // Sync Complete
      setIsSyncing(false);
      setProgress(null);
      localStorage.removeItem("amfi_sync_recovery");
      setRecoveryData(null);
      
      if (config) {
        savePreferences({ ...config, last_summary: currentSummary });
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Sync aborted by user');
      } else {
        alert(`Sync Error: ${err.message}`);
      }
      setIsSyncing(false);
    }
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in flex flex-col h-[calc(100vh-4rem)] relative">
      
      {recoveryData && !isSyncing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex justify-between items-center shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-amber-800">Incomplete Extraction Detected</h4>
            <p className="text-xs text-amber-700 mt-1">A previous sync was interrupted. You can safely resume from <strong>{recoveryData.resumeFrom}</strong>.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { localStorage.removeItem("amfi_sync_recovery"); setRecoveryData(null); }} className="px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 rounded transition-colors">
              Discard
            </button>
            <button onClick={() => handleSync(true)} className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors shadow-sm">
              Resume Extraction
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sync Core</h2>
        <p className="text-sm text-gray-500">Pull historical NAV data directly from the AMFI portal via Edge Functions.</p>
      </div>

      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-end gap-4">
        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">From Date</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} disabled={isSyncing} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 disabled:text-gray-400 focus:outline-none" />
        </div>
        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">To Date</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} disabled={isSyncing} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 disabled:text-gray-400 focus:outline-none" />
        </div>
        
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-600 font-medium flex items-center gap-1.5">Mutual Fund House</label>
          <select value={mfCode} onChange={(e) => setMfCode(e.target.value)} disabled={isLoadingOptions || isSyncing} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 disabled:bg-gray-200 focus:outline-none truncate">
            <option value="">All Houses</option>
            {mfOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-600 font-medium flex items-center gap-1.5">Fund Category Type</label>
          <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} disabled={isLoadingOptions || isSyncing} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 disabled:bg-gray-200 focus:outline-none">
            <option value="">All Types</option>
            {tpOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        
        {!isSyncing ? (
          <button onClick={() => handleSync(false)} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-8 py-2 rounded font-medium h-[38px] transition-colors shadow-sm">
             Pull Data
          </button>
        ) : (
          <button onClick={handleAbort} className="bg-red-600 hover:bg-red-700 text-white px-8 py-2 rounded font-medium h-[38px] transition-colors shadow-sm">
             Abort Sync
          </button>
        )}
      </div>

      <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-6 flex flex-col overflow-y-auto">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Latest Extraction Summary</h3>
        
        {isSyncing && (
          <div className="mb-6 bg-white p-4 rounded-lg border border-blue-100 shadow-sm animate-fade-in">
            <div className="flex justify-between text-sm mb-2 font-medium text-gray-700">
              <span>{progress ? `Processing: ${progress.days_processed} of ${progress.total_days} Days` : "Connecting to Vercel Edge..."}</span>
              <span>{progress?.percent || 0}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden border border-gray-200">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-200 ease-linear" style={{ width: `${progress?.percent || 0}%` }}></div>
            </div>
            <p className="text-xs text-gray-500 mt-2 font-mono">
              {progress 
                 ? `Reading Record Date: ${progress.current_date} | +${progress.rows_added.toLocaleString()} total rows appended` 
                 : "Warming up Serverless Functions..."}
            </p>
          </div>
        )}

        {!isSyncing && Object.keys(summaryData).length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Run an extraction to see AMC breakdown.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pb-4">
            {Object.entries(summaryData).map(([amc, count]) => (
              <div key={amc} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-24 animate-fade-in">
                <span className="font-semibold text-gray-800 truncate" title={amc}>{amc}</span>
                <span className="text-blue-600 text-xl font-bold">+{Number(count).toLocaleString()} rows</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}