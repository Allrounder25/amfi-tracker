import { useState, useEffect, useRef } from "react";
import { usePreferences } from "../store/usePreferences";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface AmfiOption { value: string; label: string; }

interface QueueJob {
  id: number;
  from_date: string;
  to_date: string;
  mf_code: string;
  type_code: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress_percent: number;
  days_processed: number;
  total_days: number;
  rows_added: number;
  current_date_str: string;
  created_at: string;
}

export default function DownloadView() {
  const { config, savePreferences } = usePreferences();
  
  const [mfOptions, setMfOptions] = useState<AmfiOption[]>([]);
  const [tpOptions, setTpOptions] = useState<AmfiOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [mfCode, setMfCode] = useState("");
  const [typeCode, setTypeCode] = useState("");

  const [scrapedDates, setScrapedDates] = useState<Set<string>>(new Set());
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  const activeProcessingIdRef = useRef<number | null>(null);

  // Helper date formatter
  const formatDateStr = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  // 1. Load preferences & saved dropdown options
  useEffect(() => {
    if (config) {
      if (!fromDate && config.sync_from_date) setFromDate(config.sync_from_date);
      if (!toDate && config.sync_to_date) setToDate(config.sync_to_date);
      if (!mfCode && config.sync_mf) setMfCode(config.sync_mf);
      if (!typeCode && config.sync_tp) setTypeCode(config.sync_tp);
    }
  }, [config]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const response = await fetch('/api/fetch-options');
        if (!response.ok) throw new Error("Failed to load options");
        const data = await response.json();
        if (data.mf) setMfOptions(data.mf);
        if (data.tp) setTpOptions(data.tp);
      } catch (err) {
        console.error("Failed loading options", err);
      } finally {
        setIsLoadingOptions(false);
      }
    };
    fetchDropdowns();
  }, []);

  // 2. Poll Scraped Dates & Global Queue every 3 seconds
  const fetchGlobalState = async () => {
    try {
      const [datesRes, queueRes] = await Promise.all([
        fetch('/api/scraped-dates'),
        fetch('/api/queue')
      ]);

      if (datesRes.ok) {
        const data = await datesRes.json();
        setScrapedDates(new Set(data.dates));
      }

      if (queueRes.ok) {
        const qData = await queueRes.json();
        setQueueJobs(qData.jobs || []);
      }
    } catch (err) {
      console.error("Error fetching queue state:", err);
    }
  };

  useEffect(() => {
    fetchGlobalState();
    const interval = setInterval(fetchGlobalState, 3000);
    return () => clearInterval(interval);
  }, []);

  // 3. Chunk Generator (30 days window)
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

  // 4. Background Job Execution Processor Loop
  useEffect(() => {
    const processQueueLoop = async () => {
      if (isProcessingLocal) return;

      try {
        const claimRes = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'claim_next' })
        });

        if (!claimRes.ok) return;
        const { job } = await claimRes.json();

        if (job && job.id) {
          setIsProcessingLocal(true);
          activeProcessingIdRef.current = job.id;
          await runJob(job);
          setIsProcessingLocal(false);
          activeProcessingIdRef.current = null;
          fetchGlobalState();
        }
      } catch (err) {
        console.error("Queue execution error:", err);
        setIsProcessingLocal(false);
      }
    };

    const runner = setInterval(processQueueLoop, 4000);
    return () => clearInterval(runner);
  }, [isProcessingLocal]);

  // Execute extraction chunks for a claimed job
  const runJob = async (job: QueueJob) => {
    const chunks = generateChunks(job.from_date, job.to_date);
    let daysProcessed = 0;
    let totalRowsAdded = 0;

    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromDate: chunk.start,
            toDate: chunk.end,
            mf: job.mf_code,
            tp: job.type_code
          })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();

        daysProcessed += chunk.days;
        totalRowsAdded += result.rows_added || 0;
        const percent = Math.min(Math.round((daysProcessed / job.total_days) * 100), 99.9);

        // Broadcast updated progress to Turso DB
        await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_progress',
            jobId: job.id,
            progress: {
              percent,
              days_processed: daysProcessed,
              rows_added: totalRowsAdded,
              current_date_str: chunk.end,
              status: 'in_progress'
            }
          })
        });
      }

      // Mark Job as Completed
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_progress',
          jobId: job.id,
          progress: {
            percent: 100,
            days_processed: job.total_days,
            rows_added: totalRowsAdded,
            current_date_str: job.to_date,
            status: 'completed'
          }
        })
      });

    } catch (err: any) {
      console.error(`Job #${job.id} failed:`, err);
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_progress',
          jobId: job.id,
          progress: {
            percent: 0,
            days_processed: daysProcessed,
            rows_added: totalRowsAdded,
            current_date_str: "Failed",
            status: 'failed'
          }
        })
      });
    }
  };

  // Add job to global queue on button click
  const handleEnqueue = async () => {
    if (!fromDate || !toDate) {
      alert("Please select both From Date and To Date.");
      return;
    }

    if (config) {
      savePreferences({ ...config, sync_from_date: fromDate, sync_to_date: toDate, sync_mf: mfCode, sync_tp: typeCode });
    }

    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enqueue',
          fromDate,
          toDate,
          mfCode,
          typeCode
        })
      });

      if (res.ok) {
        fetchGlobalState();
      } else {
        alert("Failed to enqueue job.");
      }
    } catch (err) {
      console.error("Enqueue error:", err);
    }
  };

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in flex flex-col h-[calc(100vh-4rem)] relative">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Sync Pipeline & Extraction Queue</h2>
        <p className="text-sm text-gray-500">Pull historical NAV data directly from AMFI with synchronized multi-user queueing.</p>
      </div>

      {/* Input Controls */}
      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-end gap-4">
        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">From Date</label>
          <DatePicker
            selected={fromDate ? new Date(fromDate) : null}
            onChange={(date: Date | null) => setFromDate(date ? formatDateStr(date) : "")}
            dateFormat="yyyy-MM-dd"
            className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 focus:outline-none w-full"
            dayClassName={(date) =>
              scrapedDates.has(formatDateStr(date))
                ? "bg-emerald-100 text-emerald-800 font-bold rounded-full hover:bg-emerald-200"
                : ""
            }
          />
        </div>

        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">To Date</label>
          <DatePicker
            selected={toDate ? new Date(toDate) : null}
            onChange={(date: Date | null) => setToDate(date ? formatDateStr(date) : "")}
            dateFormat="yyyy-MM-dd"
            className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 focus:outline-none w-full"
            dayClassName={(date) =>
              scrapedDates.has(formatDateStr(date))
                ? "bg-emerald-100 text-emerald-800 font-bold rounded-full hover:bg-emerald-200"
                : ""
            }
          />
        </div>
        
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-600 font-medium">Mutual Fund House</label>
          <select value={mfCode} onChange={(e) => setMfCode(e.target.value)} disabled={isLoadingOptions} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 focus:outline-none truncate">
            <option value="">All Houses</option>
            {mfOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-600 font-medium">Fund Category Type</label>
          <select value={typeCode} onChange={(e) => setTypeCode(e.target.value)} disabled={isLoadingOptions} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-gray-800 focus:outline-none">
            <option value="">All Types</option>
            {tpOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        
        <button 
          onClick={handleEnqueue} 
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded font-medium h-[38px] transition-colors shadow-sm"
        >
          Pull Data
        </button>
      </div>

      {/* Global Queue & Extraction History List */}
      <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6 flex flex-col overflow-hidden shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
            Global Extraction Queue & Activity Log
          </h3>
          <span className="text-xs text-gray-500 font-mono">
            Shared across all active users
          </span>
        </div>

        {queueJobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            No active or past extraction jobs found. Select dates and click "Pull Data".
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {queueJobs.map((job) => (
              <div key={job.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col gap-3 shadow-xs">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm text-gray-800">Job #{job.id}</span>
                    <span className="text-xs text-gray-600 font-mono">
                      {job.from_date} &rarr; {job.to_date}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {job.status === 'in_progress' && (
                      <span className="px-2.5 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded-full animate-pulse">
                        IN PROGRESS ({job.progress_percent}%)
                      </span>
                    )}
                    {job.status === 'pending' && (
                      <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                        QUEUED
                      </span>
                    )}
                    {job.status === 'completed' && (
                      <span className="px-2.5 py-1 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full">
                        COMPLETED (+{job.rows_added.toLocaleString()} rows)
                      </span>
                    )}
                    {job.status === 'failed' && (
                      <span className="px-2.5 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-full">
                        FAILED
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar for Active Jobs */}
                {(job.status === 'in_progress' || job.status === 'pending') && (
                  <div className="space-y-1">
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${job.progress_percent}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 font-mono">
                      <span>Processed: {job.days_processed} / {job.total_days} Days</span>
                      <span>Rows Added: +{job.rows_added.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}