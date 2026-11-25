import { create } from "zustand";
import type { AppInfo } from "@shared/types";

type AppStore = {
  info: AppInfo | null; // null until main has answered
  setInfo: (info: AppInfo) => void;
};

// main owns app state; the renderer mirrors it (same pattern as WorkPulse's stores)
const useAppStore = create<AppStore>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));

export { useAppStore };
