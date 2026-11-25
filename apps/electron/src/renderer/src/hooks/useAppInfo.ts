import { useEffect } from "react";
import { useAppStore } from "../store/appStore";

// call once in App: asks main for the version and mode
function useAppInfo() {
  const info = useAppStore((store) => store.info);
  const setInfo = useAppStore((store) => store.setInfo);

  useEffect(() => {
    void window.clipper.getInfo().then(setInfo);
  }, [setInfo]);

  return info;
}

export { useAppInfo };
