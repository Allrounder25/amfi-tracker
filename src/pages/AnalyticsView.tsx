import { useState, useEffect } from "react";
import { usePreferences } from "../store/usePreferences";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface FundPerformance {
  scheme_code: number; scheme_name: string; current_nav: number;
  return_1w: string; return_1m: string; return_3m: string; 
  return_6m: string; return_1y: string; return_3y: string; return_5y: string;
}

interface DropdownOption { value: string; label: string; }

export default function AnalyticsView() {
  const { config } = usePreferences();

  // Inputs
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  
  // MULTI-SELECT STATES
  const [selectedMfs, setSelectedMfs] = useState<string[]>([]);
  const [selectedTps, setSelectedTps] = useState<string[]>([]);
  
  // Dropdown UI Toggles
  const [showMfDropdown, setShowMfDropdown] = useState(false);
  const [showTpDropdown, setShowTpDropdown] = useState(false);

  const [exportPath, setExportPath] = useState("");
  
  // Toggles & Modal
  const [showTable, setShowTable] = useState(true);
  const [showBarChart, setShowBarChart] = useState(true);
  const [showLineChart, setShowLineChart] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [visibleCols, setVisibleCols] = useState({ w1: false, m1: false, m3: false, m6: false, y1: false, y3: false, y5: false });

  const [mfOptions, setMfOptions] = useState<DropdownOption[]>([]);
  const [tpOptions, setTpOptions] = useState<DropdownOption[]>([]);
  const [data, setData] = useState<FundPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isSyncActive = localStorage.getItem("amfi_sync_recovery") !== null;

  // Helper: Auto-detect available return data and toggle columns
  const autoDetectColumns = (fundData: FundPerformance[]) => {
    const newCols = { w1: false, m1: false, m3: false, m6: false, y1: false, y3: false, y5: false };
    fundData.forEach(fund => {
      if (fund.return_1w && fund.return_1w !== "N/A") newCols.w1 = true;
      if (fund.return_1m && fund.return_1m !== "N/A") newCols.m1 = true;
      if (fund.return_3m && fund.return_3m !== "N/A") newCols.m3 = true;
      if (fund.return_6m && fund.return_6m !== "N/A") newCols.m6 = true;
      if (fund.return_1y && fund.return_1y !== "N/A") newCols.y1 = true;
      if (fund.return_3y && fund.return_3y !== "N/A") newCols.y3 = true;
      if (fund.return_5y && fund.return_5y !== "N/A") newCols.y5 = true;
    });
    setVisibleCols(newCols);
  };

  useEffect(() => {
    async function initFilters() {
      try {
        const response = await fetch('/api/fetch-options');
        if (!response.ok) throw new Error("Network response was not ok");
        const parsed = await response.json();
        if (parsed.mf) setMfOptions(parsed.mf);
        if (parsed.tp) setTpOptions(parsed.tp);

        if (config && config.analytics_filters) {
          setFromDate(config.analytics_filters.from || "");
          setToDate(config.analytics_filters.to || "");
          if (config.analytics_cache && config.analytics_cache.length > 0) {
            setData(config.analytics_cache);
            autoDetectColumns(config.analytics_cache);
            setHasSearched(true);
          }
        }
      } catch (err) {}
    }
    initFilters();
  }, [config]);

  const handleApplyFilters = async () => {
    if (!fromDate || !toDate) { alert("Please select a From and To date."); return; }
    setIsLoading(true);
    setHasSearched(true);
    
    try {
      const response = await fetch('/api/get_analytics_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate, mf: selectedMfs, tp: selectedTps })
      });
      if (!response.ok) throw new Error("Failed to fetch analytical data");
      const results = await response.json();
      setData(results);
      autoDetectColumns(results);
    } catch (error) {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setData([]); setHasSearched(false);
    setSelectedMfs([]); setSelectedTps([]);
    setFromDate(""); setToDate("");
  };

  const openExportModal = () => {
    setExportPath(`amfi_export_${new Date().toISOString().split('T')[0]}.csv`);
    setIsExportModalOpen(true);
  };
  
  const handleExportCSV = () => {
    if (data.length === 0) return;
    
    const headers = ["Scheme Code", "Fund Name", "Current NAV"];
    if (visibleCols.w1) headers.push("1W Return");
    if (visibleCols.m1) headers.push("1M Return");
    if (visibleCols.m3) headers.push("3M Return");
    if (visibleCols.m6) headers.push("6M Return");
    if (visibleCols.y1) headers.push("1Y Return");
    if (visibleCols.y3) headers.push("3Y Return");
    if (visibleCols.y5) headers.push("5Y Return");

    const csvRows = [headers.join(",")];

    data.forEach(fund => {
      const row = [fund.scheme_code, `"${fund.scheme_name}"`, fund.current_nav];
      if (visibleCols.w1) row.push(fund.return_1w);
      if (visibleCols.m1) row.push(fund.return_1m);
      if (visibleCols.m3) row.push(fund.return_3m);
      if (visibleCols.m6) row.push(fund.return_6m);
      if (visibleCols.y1) row.push(fund.return_1y);
      if (visibleCols.y3) row.push(fund.return_3y);
      if (visibleCols.y5) row.push(fund.return_5y);
      csvRows.push(row.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `amfi_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExportModalOpen(false);
  };

  const toggleMfSelection = (val: string) => {
    setSelectedMfs(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
  };

  const toggleTpSelection = (val: string) => {
    setSelectedTps(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
  };

  // HELPER: Dynamic Return Parsing (Fallback chain if 1Y is N/A)
  const getFundBestReturn = (fund: FundPerformance) => {
    const metrics = [
      { key: fund.return_1y, label: "1Y" },
      { key: fund.return_6m, label: "6M" },
      { key: fund.return_3m, label: "3M" },
      { key: fund.return_1m, label: "1M" },
      { key: fund.return_1w, label: "1W" }
    ];
    for (const m of metrics) {
      if (m.key && m.key !== "N/A") {
        const parsed = parseFloat(m.key.replace(/[^\d.-]/g, ""));
        if (!isNaN(parsed)) return { val: parsed, label: m.label };
      }
    }
    return { val: 0, label: "1Y" };
  };

  const activeMetricLabel = data.length > 0 ? getFundBestReturn(data[0]).label : "1Y";

  const barChartData = [...data]
    .map(fund => ({
      fullName: fund.scheme_name,
      name: fund.scheme_name.length > 16 ? fund.scheme_name.substring(0, 16) + "..." : fund.scheme_name,
      returnVal: getFundBestReturn(fund).val
    }))
    .sort((a, b) => b.returnVal - a.returnVal)
    .slice(0, 10);
 
  const lineChartData = [...data]
    .sort((a, b) => b.current_nav - a.current_nav)
    .slice(0, 10)
    .map(fund => ({
      fullName: fund.scheme_name,
      name: fund.scheme_name.length > 16 ? fund.scheme_name.substring(0, 16) + "..." : fund.scheme_name,
      nav: fund.current_nav
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const isReturn = payload[0].name === "returnVal";
      const label = isReturn ? `${activeMetricLabel} Return` : "Current NAV";
      const formattedValue = isReturn ? `${payload[0].value}%` : `\u20B9${payload[0].value}`;

      return (
        <div className="bg-white p-2.5 border border-gray-200 shadow-md rounded text-xs z-50">
          <p className="font-bold text-gray-800 mb-1">{payload[0].payload.fullName}</p>
          <p className={isReturn ? "text-emerald-600 font-semibold" : "text-blue-600 font-semibold"}>
            {`${label} : ${formattedValue}`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden px-2 py-3 bg-gray-50/50 gap-2">
      
      {isSyncActive && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200 text-center max-w-sm">
            <h3 className="text-lg font-bold text-gray-900">Database Locked</h3>
            <p className="text-sm text-gray-500 mt-2">The AMFI engine is extracting data. Analytics paused to prevent locking conflicts.</p>
          </div>
        </div>
      )}

      {/* COMPACT TOP TOOLBAR */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight">Analytics</h2>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-gray-50 border border-gray-300 px-2 py-1 rounded text-xs outline-none" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-gray-50 border border-gray-300 px-2 py-1 rounded text-xs outline-none" />
          </div>

          {/* Mutual Fund Dropdown */}
          <div className="relative">
            <button onClick={() => setShowMfDropdown(!showMfDropdown)} className="bg-gray-50 border border-gray-300 px-2.5 py-1 rounded text-xs text-left text-gray-700 truncate max-w-[130px]">
              {selectedMfs.length === 0 ? "All Houses" : `${selectedMfs.length} Houses`}
            </button>
            {showMfDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-xl rounded-lg z-50 max-h-48 overflow-y-auto p-1.5 w-48 text-xs">
                <label className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedMfs.length === 0} onChange={() => setSelectedMfs([])} />
                  <span className="font-medium">Select All</span>
                </label>
                {mfOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" checked={selectedMfs.includes(opt.value)} onChange={() => toggleMfSelection(opt.value)} />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <button onClick={() => setShowTpDropdown(!showTpDropdown)} className="bg-gray-50 border border-gray-300 px-2.5 py-1 rounded text-xs text-left text-gray-700 truncate max-w-[120px]">
              {selectedTps.length === 0 ? "All Types" : `${selectedTps.length} Types`}
            </button>
            {showTpDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 shadow-xl rounded-lg z-50 max-h-48 overflow-y-auto p-1.5 w-48 text-xs">
                <label className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedTps.length === 0} onChange={() => setSelectedTps([])} />
                  <span className="font-medium">Select All</span>
                </label>
                {tpOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" checked={selectedTps.includes(opt.value)} onChange={() => toggleTpSelection(opt.value)} />
                    <span className="truncate">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleApplyFilters} disabled={isLoading || isSyncActive} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-1 rounded text-xs font-semibold transition-colors">
            {isLoading ? "..." : "Apply"}
          </button>
          <button onClick={handleClear} disabled={!hasSearched} className="text-gray-400 hover:text-red-600 text-xs font-medium uppercase transition-colors disabled:opacity-30">Clear</button>
        </div>

        {/* DISPLAY VIEWS TOGGLES & EXPORT */}
        <div className="flex items-center gap-3">
          <div className="flex gap-2 bg-gray-100 p-1 rounded border border-gray-200 text-xs">
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} /> Table</label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showBarChart} onChange={(e) => setShowBarChart(e.target.checked)} /> Bar</label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={showLineChart} onChange={(e) => setShowLineChart(e.target.checked)} /> Line</label>
          </div>
          <button onClick={openExportModal} disabled={!hasSearched || data.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white px-3 py-1 rounded text-xs font-medium transition-colors">
            Export
          </button>
        </div>
      </div>

      {/* COLUMN SELECTOR STRIP */}
      {showTable && hasSearched && !isLoading && (
        <div className="flex gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-lg items-center shadow-2xs shrink-0 text-xs text-gray-600">
          <span className="font-bold uppercase text-[10px] text-gray-400">Columns:</span>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.w1} onChange={e => setVisibleCols({...visibleCols, w1: e.target.checked})}/> 1W</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.m1} onChange={e => setVisibleCols({...visibleCols, m1: e.target.checked})}/> 1M</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.m3} onChange={e => setVisibleCols({...visibleCols, m3: e.target.checked})}/> 3M</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.m6} onChange={e => setVisibleCols({...visibleCols, m6: e.target.checked})}/> 6M</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.y1} onChange={e => setVisibleCols({...visibleCols, y1: e.target.checked})}/> 1Y</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.y3} onChange={e => setVisibleCols({...visibleCols, y3: e.target.checked})}/> 3Y</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={visibleCols.y5} onChange={e => setVisibleCols({...visibleCols, y5: e.target.checked})}/> 5Y</label>
        </div>
      )}

      {/* MAIN WORKSPACE SPLIT (Zero Page Overflow) */}
      <div className="flex-1 flex flex-col xl:flex-row gap-3 min-h-0 overflow-hidden pr-1">
        
        {/* TABLE VIEW */}
        {showTable && (
          <div className={`bg-white rounded-lg border border-gray-200 shadow-2xs overflow-hidden flex flex-col ${showBarChart || showLineChart ? 'xl:w-1/2 min-h-0' : 'w-full'}`}>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="text-[11px] text-gray-500 uppercase bg-gray-50 border-b border-gray-200 sticky top-0 z-10 font-semibold">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Fund Name</th>
                    <th className="px-3 py-2">NAV</th>
                    {visibleCols.w1 && <th className="px-3 py-2 text-right">1W</th>}
                    {visibleCols.m1 && <th className="px-3 py-2 text-right">1M</th>}
                    {visibleCols.m3 && <th className="px-3 py-2 text-right">3M</th>}
                    {visibleCols.m6 && <th className="px-3 py-2 text-right">6M</th>}
                    {visibleCols.y1 && <th className="px-3 py-2 text-right">1Y</th>}
                    {visibleCols.y3 && <th className="px-3 py-2 text-right">3Y</th>}
                    {visibleCols.y5 && <th className="px-3 py-2 text-right">5Y</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {!hasSearched ? (<tr><td colSpan={10} className="p-8 text-center italic text-gray-400 font-sans">Apply filters to view dataset</td></tr>) 
                  : isLoading ? (<tr><td colSpan={10} className="p-8 text-center animate-pulse text-gray-400 font-sans">Fetching results...</td></tr>) 
                  : data.map(fund => (
                    <tr key={fund.scheme_code} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2 text-gray-400">{fund.scheme_code}</td>
                      <td className="px-3 py-2 font-sans font-medium text-gray-900 whitespace-normal min-w-[200px]">{fund.scheme_name}</td>
                      <td className="px-3 py-2 font-semibold text-gray-800">{"\u20B9"}{fund.current_nav.toFixed(2)}</td>
                      {visibleCols.w1 && <td className={`px-3 py-2 text-right ${fund.return_1w.startsWith("-") ? "text-red-600" : fund.return_1w === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_1w}</td>}
                      {visibleCols.m1 && <td className={`px-3 py-2 text-right ${fund.return_1m.startsWith("-") ? "text-red-600" : fund.return_1m === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_1m}</td>}
                      {visibleCols.m3 && <td className={`px-3 py-2 text-right ${fund.return_3m.startsWith("-") ? "text-red-600" : fund.return_3m === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_3m}</td>}
                      {visibleCols.m6 && <td className={`px-3 py-2 text-right ${fund.return_6m.startsWith("-") ? "text-red-600" : fund.return_6m === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_6m}</td>}
                      {visibleCols.y1 && <td className={`px-3 py-2 text-right ${fund.return_1y.startsWith("-") ? "text-red-600" : fund.return_1y === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_1y}</td>}
                      {visibleCols.y3 && <td className={`px-3 py-2 text-right ${fund.return_3y.startsWith("-") ? "text-red-600" : fund.return_3y === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_3y}</td>}
                      {visibleCols.y5 && <td className={`px-3 py-2 text-right ${fund.return_5y.startsWith("-") ? "text-red-600" : fund.return_5y === "N/A" ? "text-gray-300" : "text-emerald-600"}`}>{fund.return_5y}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CHARTS CONTAINER */}
        {hasSearched && !isLoading && data.length > 0 && (showBarChart || showLineChart) && (
          <div className={`flex flex-col gap-3 overflow-y-auto ${showTable ? 'xl:w-1/2' : 'w-full'}`}>
            
            {/* BAR CHART */}
            {showBarChart && (
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-2xs flex flex-col shrink-0 h-56">
                <h3 className="text-xs font-bold text-gray-800 mb-2">{activeMetricLabel} Return Comparison (Top 10)</h3>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{fontSize: 9}} interval={0} angle={-20} textAnchor="end" />
                      <YAxis tickFormatter={(val) => `${val}%`} tick={{fontSize: 10}} />
                      <Tooltip content={<CustomTooltip />} cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="returnVal" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* LINE CHART */}
            {showLineChart && (
              <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-2xs flex flex-col shrink-0 h-56">
                <h3 className="text-xs font-bold text-gray-800 mb-2">Current NAV Snapshot</h3>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineChartData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{fontSize: 9}} interval={0} angle={-20} textAnchor="end" />
                      <YAxis tickFormatter={(val) => `\u20B9${val}`} tick={{fontSize: 10}} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="nav" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* EXPORT MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden text-xs">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="font-bold text-gray-900">Export Raw Metrics</h3>
            </div>
            <div className="p-5">
              <p className="text-gray-600 mb-3">Compile currently visible columns into a standard data file.</p>
              <label className="font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Destination File Name</label>
              <input type="text" readOnly value={exportPath} className="w-full bg-gray-50 border border-gray-200 px-3 py-1.5 rounded font-mono text-gray-500 outline-none" />
            </div>
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setIsExportModalOpen(false)} className="px-3 py-1 text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1 rounded font-medium">Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
