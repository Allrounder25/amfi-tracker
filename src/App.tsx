import { useState } from "react";
import './App.css';

import Sidebar from "./components/Sidebar";
import HomeView from "./pages/HomeView";
import DownloadView from "./pages/DownloadView";
import AnalyticsView from "./pages/AnalyticsView";
import SettingsView from "./pages/SettingsView";

export default function App() {
  const [activeTab, setActiveTab] = useState<"home" | "download" | "analytics" | "settings">("home");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // NEW STATE

  
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <Sidebar 
        currentTab={activeTab} 
        setCurrentTab={setActiveTab} 
        isCollapsed={isSidebarCollapsed} 
        setIsCollapsed={setIsSidebarCollapsed} 
      />

      <main className="flex-1 overflow-y-auto p-8 relative transition-all duration-300">
        <div className="max-w-7xl mx-auto h-full">
          <div className={activeTab === "home" ? "block h-full" : "hidden"}><HomeView /></div>
          <div className={activeTab === "download" ? "block h-full" : "hidden"}><DownloadView /></div>
          <div className={activeTab === "analytics" ? "block h-full" : "hidden"}><AnalyticsView /></div>
          <div className={activeTab === "settings" ? "block h-full" : "hidden"}><SettingsView /></div>
        </div>
      </main>
    </div>
  );
}