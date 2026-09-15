// SettingsView.tsx
import { useState, useEffect } from "react";
import { usePreferences } from "../store/usePreferences";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function SettingsView() {
  const { config, setConfig, savePreferences, isLoading } = usePreferences();
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // New states for overlap calculation
  const [scrapedDates, setScrapedDates] = useState<Set<string>>(new Set());
  const [queueJobs, setQueueJobs] = useState<any[]>([]);

  const isSyncActive = localStorage.getItem("amfi_sync_recovery") !== null;

  // Helper date formatter
  const formatDateStr = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
  };

  // Fetch current database and queue status
  useEffect(() => {
    Promise.all([fetch('/api/scraped-dates'), fetch('/api/queue')])
      .then(async ([datesRes, queueRes]) => {
        if (datesRes.ok) {
          const data = await datesRes.json();
          setScrapedDates(new Set(data.dates));
        }
        if (queueRes.ok) {
          const qData = await queueRes.json();
          setQueueJobs(qData.jobs || []);
        }
      })
      .catch(err => console.error("Failed to load global state", err));
  }, []);

  const processAutomation = async (currentConfig: any) => {
    if (!currentConfig.auto_sync_start_date) return;

    // 1. Calculate Target Date (Today - buffer_days)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - currentConfig.buffer_days);
    
    // 2. Map all currently queued/active dates from other users
    const activeDates = new Set<string>();
    queueJobs.filter(j => j.status === 'pending' || j.status === 'in_progress').forEach(job => {
      let curr = new Date(job.from_date);
      const end = new Date(job.to_date);
      while(curr <= end) {
        activeDates.add(formatDateStr(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });

    // 3. Find missing dates in the local database
    const missingDates: string[] = [];
    let checkDate = new Date(currentConfig.auto_sync_start_date);
    
    while(checkDate <= targetDate) {
      const dStr = formatDateStr(checkDate);
      if (!scrapedDates.has(dStr)) {
        missingDates.push(dStr);
      }
      checkDate.setDate(checkDate.getDate() + 1);
    }

    if (missingDates.length === 0) return; // Database is fully caught up

    // 4. Multi-user Overlap Check
    const strictlyMissing = missingDates.filter(d => !activeDates.has(d));

    if (strictlyMissing.length === 0) {
      alert("All missing data is already currently in the global queue. Please wait for the process to finish.");
      return;
    } 

    if (strictlyMissing.length < missingDates.length) {
      const proceed = window.confirm(`Part of this timeframe is already executing in the queue. Recommend fetching only the remaining ${strictlyMissing.length} days. Proceed?`);
      if (!proceed) return;
    }

    // 5. Convert missing dates into ranges and enqueue
    await enqueueMissingRanges(strictlyMissing);
  };

  const enqueueMissingRanges = async (dates: string[]) => {
    // Group adjacent days into contiguous chunks to avoid spamming the queue
    dates.sort();
    let rangeStart = dates[0];
    let prevDate = new Date(dates[0]);

    const postJob = async (start: string, end: string) => {
      await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enqueue', fromDate: start, toDate: end, mfCode: "", typeCode: "" })
      });
    };

    for (let i = 1; i < dates.length; i++) {
      const currDate = new Date(dates[i]);
      const diffTime = Math.abs(currDate.getTime() - prevDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        await postJob(rangeStart, formatDateStr(prevDate));
        rangeStart = dates[i];
      }
      prevDate = currDate;
    }
    await postJob(rangeStart, formatDateStr(prevDate)); // Push final chunk
    
    alert("Missing data has been added to the Activity Log for background extraction.");
  };

  const handleSaveSettings = async () => {
    if (!config) return;
    setIsSaving(true);
    const success = await savePreferences(config);
    
    if (success) {
      await processAutomation(config);
    }

    setSaveMessage(success ? "Settings saved successfully." : "Error saving settings.");
    setIsSaving(false);
    setTimeout(() => setSaveMessage(""), 3000);
  };
 
  
  const handleDeleteDatabase = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch('/api/reset-db', { method: 'POST' });
      if (!response.ok) throw new Error("Failed to reset tables on server nodes.");
      
      // Wipe the frontend caching states
      if (config) {
        const freshConfig = {
          ...config,
          last_summary: {},
          dashboard_cache: { total_records: 0, tracked_funds: 0, last_synced: "Never", records_this_week: 0 },
          analytics_cache: []
        };
        await savePreferences(freshConfig);
      }
      
      setShowDeleteWarning(false);
      alert("Cloud database tables wiped and reset successfully!");
    } catch (e: any) {
      alert(`Error deleting database: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading || !config) return <div className="p-4 text-gray-500">Loading configurations...</div>;

  return (
    <div className="max-w-6xl relative h-full flex flex-col pb-10">
      
      {/* 1. Global Lockout Overlay during Active Sync processing */}
      {isSyncActive && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200 text-center max-w-sm">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">!</div>
            <h3 className="text-lg font-bold text-gray-900">Settings Locked</h3>
            <p className="text-sm text-gray-500 mt-2">The AMFI engine is currently running an active background extraction. Settings are locked until the process complete nodes wrap up.</p>
          </div>
        </div>
      )}

      {/* Settings Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Settings</h2>
        <p className="text-sm text-gray-500">Configure your data extraction behaviors and cloud storage pipeline options.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Configurations Column */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Sync Pipeline Configurations</h3>
            
            <div>
              <p className="text-xs text-gray-500">Set background lookback days for holiday coverage overlapping calculations.</p>
              <div className="flex items-center gap-4 mt-2">
                <input 
                  type="number" 
                  value={config.buffer_days} 
                  onChange={e => setConfig({...config, buffer_days: parseInt(e.target.value, 10) || 0})} 
                  className="w-24 px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-blue-500 shadow-inner" 
                />
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Recommended: 3 Days</span>
              </div>
            </div>

            {/* New Automated Starting Date - Placed INSIDE the card container */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500">Define the starting threshold date. Saving will automatically queue extraction for missing dates up to today.</p>
              <div className="flex items-center gap-4 mt-2">
                <DatePicker
                  selected={config.auto_sync_start_date ? new Date(config.auto_sync_start_date) : null}
                  onChange={(date: Date | null) => setConfig({...config, auto_sync_start_date: date ? formatDateStr(date) : ""})}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Select start date"
                  className="w-32 px-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-blue-500 shadow-inner"
                  dayClassName={(date) =>
                    scrapedDates.has(formatDateStr(date))
                      ? "bg-emerald-100 text-emerald-800 font-bold rounded-full hover:bg-emerald-200"
                      : ""
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Danger Zone Column */}
        <div className="space-y-6 flex flex-col h-full">
          <div className="bg-red-50 p-6 rounded-lg border border-red-200 shadow-sm lg:mt-0">
            <div>
              <h3 className="font-bold text-red-800">Danger Zone: Cloud Factory Reset</h3>
              <p className="text-xs text-red-700 mt-1">Permanently drop the records tables from your Turso cloud cluster, clear all local summaries, and wipe browser metrics caches. This action cannot be reversed.</p>
            </div>
            <div className="mt-4">
              <button onClick={() => setShowDeleteWarning(true)} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded text-sm font-bold shadow-sm transition-colors">
                Drop Cloud Data Tables
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Save Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 flex items-center gap-4">
        <button onClick={handleSaveSettings} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded text-sm font-medium transition-colors shadow-sm">
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
        {saveMessage && <span className="text-sm text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded">{saveMessage}</span>}
      </div>

      {/* Factory Reset Modal Overlay */}
      {showDeleteWarning && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-red-100 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-red-50/50">
              <h3 className="font-bold text-red-700 text-lg">Confirm Factory Reset</h3>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-800 font-bold">You are about to permanently clear remote storage data tables.</p>
              <p className="text-sm text-gray-600">
                This will drop the `nav_history` table inside your Turso infrastructure. All tracked records across your dashboard metrics will be initialized to blank data maps.
              </p>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowDeleteWarning(false)} className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteDatabase} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded text-sm font-bold transition-colors shadow-sm disabled:opacity-50">
                {isDeleting ? "Dropping Tables..." : "Yes, Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}