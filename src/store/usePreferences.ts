import { useState, useEffect } from "react";

export interface AppConfig {
  buffer_days: number;
  sync_from_date: string;
  sync_to_date: string;
  sync_mf: string;
  sync_tp: string;
  last_summary: Record<string, number>;
  dashboard_cache: {
    total_records: number;
    tracked_funds: number;
    last_synced: string;
    records_this_week: number;
  };
  analytics_filters: { from: string; to: string; mf: string; tp: string };
  analytics_cache: any[];
}

const DEFAULT_CONFIG: AppConfig = {
  buffer_days: 3,
  sync_from_date: "", sync_to_date: "", sync_mf: "", sync_tp: "",
  last_summary: {},
  dashboard_cache: { total_records: 0, tracked_funds: 0, last_synced: "Never", records_this_week: 0 },
  analytics_filters: { from: "", to: "", mf: "", tp: "" },
  analytics_cache: []
};

export function usePreferences() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Read directly from browser memory
    const stored = localStorage.getItem("amfi_web_config");
    if (stored) {
      setConfig(JSON.parse(stored));
    } else {
      setConfig(DEFAULT_CONFIG);
    }
    setIsLoading(false);
  }, []);

  const savePreferences = async (newConfig: AppConfig) => {
    try {
      localStorage.setItem("amfi_web_config", JSON.stringify(newConfig));
      setConfig(newConfig);
      return true;
    } catch (error) {
      console.error("Failed to save config:", error);
      return false;
    }
  };

  return { config, setConfig, savePreferences, isLoading };
}