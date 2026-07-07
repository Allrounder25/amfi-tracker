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
  const [showBarChart, setShowBarChart] = useState(false);
  const [showLineChart, setShowLineChart] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [visibleCols, setVisibleCols] = useState({ w1: false, m1: true, m3: false, m6: true, y1: true, y3: false, y5: false });

  const [mfOptions, setMfOptions] = useState<DropdownOption[]>([]);
  const [tpOptions, setTpOptions] = useState<DropdownOption[]>([]);
  const [data, setData] = useState<FundPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const isSyncActive = localStorage.getItem("amfi_sync_recovery") !== null;

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
      // Adjusted fetch or API simulation since Tauri backend commands are being phased out
      const response = await fetch('/api/get_analytics_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate, mf: selectedMfs, tp: selectedTps })
      });
      if (!response.ok) throw new Error("Failed to fetch analytical data");
      const results = await response.json();
      setData(results);
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
    
    // NEW WEB DOWNLOAD LOGIC
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `amfi_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setIsExportModalOpen(false);
    alert("File Exported Successfully!");
  };

  const toggleMfSelection = (val: string) => {
    setSelectedMfs(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
  };

  const toggleTpSelection = (val: string) => {
    setSelectedTps(prev => prev.includes(val) ? prev.filter(i => i !== val) : [...prev, val]);
  };
 
  const barChartData = [...data]
    .filter(fund => fund.return_1y !== "N/A")
    .map(fund => ({
      fullName: fund.scheme_name,
      name: fund.scheme_name.substring(0, 15) + "...",
      return1Y: parseFloat(fund.return_1y.replace(/[^\d.-]/g, "")) || 0
    }))
    .sort((a, b) => b.return1Y - a.return1Y)
    .slice(0, 10);
 
  const lineChartData = [...data]
    .sort((a, b) => b.current_nav - a.current_nav)
    .slice(0, 10)
    .map(fund => ({
      fullName: fund.scheme_name,
      name: fund.scheme_name.substring(0, 15) + "...",
      nav: fund.current_nav
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const isReturn = payload[0].name === "return1Y";
      const label = isReturn ? "1Y Return" : "Current NAV";
      const formattedValue = isReturn ? `${payload[0].value}%` : `\u20B9${payload[0].value}`;

      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded text-sm z-50">
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
    <div className="space-y-6 animate-fade-in flex flex-col h-full relative pb-10">
      
      {isSyncActive && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="bg-white p-6 rounded-xl shadow-xl border border-gray-200 text-center max-w-sm">
            <h3 className="text-lg font-bold text-gray-900">Database Locked</h3>
            <p className="text-sm text-gray-500 mt-2">The AMFI engine is extracting data. Analytics paused to prevent locking conflicts.</p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Performance Analytics</h2>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500">Analyze rolling return historical points.</p>
            <button onClick={handleClear} disabled={!hasSearched} className="text-gray-400 hover:text-red-600 text-xs font-bold uppercase transition-colors disabled:opacity-50">Clear Data</button>
          </div>
        </div>
        <button onClick={openExportModal} disabled={!hasSearched || data.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          Export Data
        </button>
      </div>

      <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">From Date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none" />
        </div>
        <div className="flex flex-col gap-2 w-36">
          <label className="text-xs text-gray-600 font-medium">To Date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none" />
        </div>
        
        {/* MULTI-SELECT: Mutual Funds */}
        <div className="flex flex-col gap-2 flex-1 min-w-[200px] relative">
          <label className="text-xs text-gray-600 font-medium">Mutual Fund House</label>
          <button onClick={() => setShowMfDropdown(!showMfDropdown)} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-left text-gray-800 focus:outline-none truncate">
            {selectedMfs.length === 0 ? "All Houses" : `${selectedMfs.length} Houses Selected`}
          </button>
          {showMfDropdown && (
            <div className="absolute top-[100%] left-0 right-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 max-h-48 overflow-y-auto p-2">
              <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" checked={selectedMfs.length === 0} onChange={() => setSelectedMfs([])} className="text-blue-600 rounded" />
                <span className="text-sm font-medium">Select All</span>
              </label>
              {mfOptions.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedMfs.includes(opt.value)} onChange={() => toggleMfSelection(opt.value)} className="text-blue-600 rounded" />
                  <span className="text-sm truncate">{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* MULTI-SELECT: Categories */}
        <div className="flex flex-col gap-2 flex-1 min-w-[200px] relative">
          <label className="text-xs text-gray-600 font-medium">Category Type</label>
          <button onClick={() => setShowTpDropdown(!showTpDropdown)} className="bg-gray-50 border border-gray-300 px-3 py-2 rounded text-sm text-left text-gray-800 focus:outline-none truncate">
            {selectedTps.length === 0 ? "All Types" : `${selectedTps.length} Types Selected`}
          </button>
          {showTpDropdown && (
            <div className="absolute top-[100%] left-0 right-0 mt-1 bg-white border border-gray-200 shadow-lg rounded-lg z-50 max-h-48 overflow-y-auto p-2">
              <label className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                <input type="checkbox" checked={selectedTps.length === 0} onChange={() => setSelectedTps([])} className="text-blue-600 rounded" />
                <span className="text-sm font-medium">Select All</span>
              </label>
              {tpOptions.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input type="checkbox" checked={selectedTps.includes(opt.value)} onChange={() => toggleTpSelection(opt.value)} className="text-blue-600 rounded" />
                  <span className="text-sm truncate">{opt.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-600 font-medium">Display Views</label>
          <div className="flex gap-3 bg-gray-50 border border-gray-200 p-2 rounded">
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} /> Table</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showBarChart} onChange={(e) => setShowBarChart(e.target.checked)} /> Bar</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={showLineChart} onChange={(e) => setShowLineChart(e.target.checked)} /> Line</label>
          </div>
        </div>
        
        <button onClick={handleApplyFilters} disabled={isLoading || isSyncActive} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded font-medium h-[38px]">
          {isLoading ? "..." : "Apply"}
        </button>
      </div>

      {showTable && hasSearched && !isLoading && (
        <div className="flex gap-4 p-3 bg-white border border-gray-200 rounded-lg items-center shadow-sm">
          <span className="text-xs font-bold text-gray-500 uppercase">Visible Columns:</span>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.w1} onChange={e => setVisibleCols({...visibleCols, w1: e.target.checked})}/> 1W</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.m1} onChange={e => setVisibleCols({...visibleCols, m1: e.target.checked})}/> 1M</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.m3} onChange={e => setVisibleCols({...visibleCols, m3: e.target.checked})}/> 3M</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.m6} onChange={e => setVisibleCols({...visibleCols, m6: e.target.checked})}/> 6M</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.y1} onChange={e => setVisibleCols({...visibleCols, y1: e.target.checked})}/> 1Y</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.y3} onChange={e => setVisibleCols({...visibleCols, y3: e.target.checked})}/> 3Y</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={visibleCols.y5} onChange={e => setVisibleCols({...visibleCols, y5: e.target.checked})}/> 5Y</label>
        </div>
      )}

      <div className="space-y-6 flex-1 overflow-y-auto pr-2">
        {showTable && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left text-sm text-gray-700">
                <thead className="text-xs text-gray-600 uppercase bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Fund Name</th>
                    <th className="px-4 py-3">NAV</th>
                    {visibleCols.w1 && <th className="px-4 py-3 text-right">1W Ret</th>}
                    {visibleCols.m1 && <th className="px-4 py-3 text-right">1M Ret</th>}
                    {visibleCols.m3 && <th className="px-4 py-3 text-right">3M Ret</th>}
                    {visibleCols.m6 && <th className="px-4 py-3 text-right">6M Ret</th>}
                    {visibleCols.y1 && <th className="px-4 py-3 text-right">1Y Ret</th>}
                    {visibleCols.y3 && <th className="px-4 py-3 text-right">3Y Ret</th>}
                    {visibleCols.y5 && <th className="px-4 py-3 text-right">5Y Ret</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {!hasSearched ? (<tr><td colSpan={10} className="p-8 text-center italic text-gray-400">Apply filters to view data</td></tr>) 
                  : isLoading ? (<tr><td colSpan={10} className="p-8 text-center animate-pulse text-gray-400">Please wait...</td></tr>) 
                  : data.map(fund => (
                    <tr key={fund.scheme_code} className="hover:bg-gray-50/80">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{fund.scheme_code}</td>
                      <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-xs" title={fund.scheme_name}>{fund.scheme_name}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{"\u20B9"}{fund.current_nav.toFixed(2)}</td>
                      {visibleCols.w1 && <td className={`px-4 py-2 text-right ${fund.return_1w.startsWith("-") ? "text-red-600" : fund.return_1w === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_1w}</td>}
                      {visibleCols.m1 && <td className={`px-4 py-2 text-right ${fund.return_1m.startsWith("-") ? "text-red-600" : fund.return_1m === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_1m}</td>}
                      {visibleCols.m3 && <td className={`px-4 py-2 text-right ${fund.return_3m.startsWith("-") ? "text-red-600" : fund.return_3m === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_3m}</td>}
                      {visibleCols.m6 && <td className={`px-4 py-2 text-right ${fund.return_6m.startsWith("-") ? "text-red-600" : fund.return_6m === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_6m}</td>}
                      {visibleCols.y1 && <td className={`px-4 py-2 text-right ${fund.return_1y.startsWith("-") ? "text-red-600" : fund.return_1y === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_1y}</td>}
                      {visibleCols.y3 && <td className={`px-4 py-2 text-right ${fund.return_3y.startsWith("-") ? "text-red-600" : fund.return_3y === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_3y}</td>}
                      {visibleCols.y5 && <td className={`px-4 py-2 text-right ${fund.return_5y.startsWith("-") ? "text-red-600" : fund.return_5y === "N/A" ? "text-gray-400" : "text-emerald-600"}`}>{fund.return_5y}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VERTICAL CHARTS */}
        {hasSearched && !isLoading && data.length > 0 && (
          <div className="flex flex-col gap-6">
            
            {showBarChart && (
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4">1-Year Return Comparison (Top 10)</h3>
                <div className="h-64">
                  {barChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={{ top: 5, right: 20, left: 0, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-15} textAnchor="end" />
                        <YAxis tickFormatter={(val) => `${val}%`} tick={{fontSize: 12}} />
                        <Tooltip content={<CustomTooltip />} cursor={{fill: '#f3f4f6'}} />
                        <Bar dataKey="return1Y" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-gray-100 rounded-lg">
                      <span className="text-sm font-medium text-gray-400 italic">No 1-Year historical data available in selected date range.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showLineChart && (
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-4">Current NAV Snapshot</h3>
                <div className="h-64">
                  {lineChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} angle={-15} textAnchor="end" />
                        <YAxis tickFormatter={(val) => `\u20B9${val}`} tick={{fontSize: 12}} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="nav" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-gray-100 rounded-lg">
                      <span className="text-sm font-medium text-gray-400 italic">No NAV data available.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* EXPORT MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-bold text-gray-900">Export Raw Metrics</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Compile currently visible columns into a standard data file.</p>
              
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Destination File Name</label>
                <input type="text" readOnly value={exportPath} className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded text-xs text-gray-500 font-mono truncate outline-none" />
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setIsExportModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
              <button onClick={handleExportCSV} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
                Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}