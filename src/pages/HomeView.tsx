import { useState, useEffect } from "react";
import { usePreferences } from "../store/usePreferences";

interface DashboardMetrics {
  total_records: number; 
  tracked_funds: number; 
  last_synced: string;
  records_this_week: number;
}

export default function HomeView() {
  const { config, savePreferences } = usePreferences();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Instantly load from cache to ensure no loading layout flickering on route changes!
  useEffect(() => {
    if (config?.dashboard_cache && config.dashboard_cache.total_records > 0) {
      setMetrics(config.dashboard_cache);
    }
  }, [config]);

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/dashboard-metrics');
      if (!response.ok) throw new Error("Failed to reach serverless route");
      
      const data: DashboardMetrics = await response.json();
      setMetrics(data);

      // Cache metrics in LocalStorage preferences to persist layouts instantly
      if (config) {
        savePreferences({
          ...config,
          dashboard_cache: data
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard metrics", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Run on initial mounting structure
  useEffect(() => {
    fetchMetrics();
  }, []);

  return (
    <div className="max-w-6xl space-y-8 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">System Dashboard</h2>
          <p className="text-sm text-gray-500">Overview of your cloud AMFI Turso database and pipeline health.</p>
        </div>
        <button 
          onClick={fetchMetrics}
          disabled={isLoading}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded transition-colors disabled:opacity-50"
        >
          {isLoading ? "Refreshing Data..." : "Refresh Metrics"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Metric 1: Tracked Funds */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-32">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Unique Tracked Funds</h3>
          <div className="mt-2">
            <p className="text-3xl font-bold text-gray-900">{metrics?.tracked_funds.toLocaleString() ?? "..."}</p>
            <p className="text-xs text-gray-400 mt-1">Active schemes synced in cloud cluster</p>
          </div>
        </div>

        {/* Metric 2: Total Records */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-32">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Total Stored Records</h3>
          <div className="mt-2">
            <p className="text-3xl font-bold text-gray-900">{metrics?.total_records.toLocaleString() ?? "..."}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">+{metrics?.records_this_week.toLocaleString() ?? "0"} this week</p>
          </div>
        </div>

        {/* Metric 3: Sync Status */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-32">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Last Pipeline Sync</h3>
          <div className="mt-2">
            <p className="text-3xl font-bold text-gray-900">{metrics?.last_synced === "Never" ? "No Data" : (metrics?.last_synced ?? "...")}</p>
            <p className="text-xs text-blue-600 font-medium mt-1">Edge pipeline sync snapshot</p>
          </div>
        </div>

         {/* Metric 4: System Status */}
         <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between h-32 col-span-1 md:col-span-2 lg:col-span-3">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider">System Status</h3>
          <div className="mt-2 flex items-center gap-4">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
            </span>
            <p className="text-sm font-medium text-gray-700">All backend services operational. Cloud API nodes connected seamlessly.</p>
          </div>
        </div>
      </div>
    </div>
  );
}