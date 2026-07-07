interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: "home" | "download" | "analytics" | "settings") => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ currentTab, setCurrentTab, isCollapsed, setIsCollapsed }: SidebarProps) {
  const navItems = [
    { id: "home", label: "Dashboard", short: "DB" },
    { id: "download", label: "Sync Pipeline", short: "SP" },
    { id: "analytics", label: "Visualization", short: "VZ" },
    { id: "settings", label: "Settings", short: "ST" },
  ] as const;

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white h-screen flex flex-col border-r border-gray-200 shrink-0 select-none shadow-sm z-10 transition-all duration-300`}>
      <div className={`p-6 border-b border-gray-100 flex items-center justify-between`}>
        {!isCollapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="w-3 h-3 rounded-full bg-blue-600 animate-pulse shadow-sm shrink-0"></span>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight whitespace-nowrap">NAV Engine</h1>
          </div>
        )}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors mx-auto">
          {isCollapsed ? "?" : "?"}
        </button>
      </div>
      
      <nav className="flex flex-col gap-2 p-4 mt-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentTab(item.id)}
            title={isCollapsed ? item.label : ""}
            className={`p-3 text-left rounded-lg text-sm font-medium transition-all duration-200 ${
              currentTab === item.id 
                ? "bg-blue-600 text-white shadow-md" 
                : "text-gray-600 hover:text-blue-700 hover:bg-blue-50"
            } ${isCollapsed ? "text-center" : ""}`}
          >
            {isCollapsed ? item.short : item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}