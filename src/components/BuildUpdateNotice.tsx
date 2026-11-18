import React, { useEffect, useState } from "react";
import { RefreshCw, X, Sparkles, CheckCircle2 } from "lucide-react";

interface RemoteBuildInfo {
  buildId?: string;
  buildTime?: string;
  gitSha?: string;
}

const BUILD_INFO_URL = "/build-info.json";
const CHECK_INTERVAL_MS = 45_000; // Cada 45 segundos

export function BuildUpdateNotice() {
  const [latestBuild, setLatestBuild] = useState<RemoteBuildInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkForUpdate = async () => {
      try {
        // Actualizar service worker si existe
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.update().catch(() => undefined)));
        }

        const res = await fetch(`${BUILD_INFO_URL}?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
        });

        if (!res.ok) return;

        const remote = (await res.json()) as RemoteBuildInfo;
        if (!isMounted || !remote.buildId) return;

        // Si el buildId remoto es diferente al compilado en este bundle
        const currentBuildId = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "";
        if (currentBuildId && remote.buildId !== currentBuildId) {
          setLatestBuild(remote);
        } else {
          setLatestBuild(null);
        }
      } catch (err) {
        // En desarrollo local o sin conexión, silenciar
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    checkForUpdate();
    const timer = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (!latestBuild?.buildId || dismissed) return null;

  const handleReload = async () => {
    setUpdating(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 max-w-sm bg-[#2A2A1E]/95 text-white p-4 rounded-2xl shadow-2xl border border-amber-500/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
              <span>Nueva versión web</span>
            </div>
            <p className="text-xs font-medium text-gray-200 mt-0.5">
              Hay una nueva compilación subida al servidor.
            </p>
            {latestBuild.gitSha && (
              <p className="text-[10px] font-mono text-gray-400 mt-0.5">
                Commit: {latestBuild.gitSha}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors"
          title="Descartar por ahora"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-400">
          Versión actual: <span className="font-mono text-gray-300">{typeof __APP_GIT_SHA__ !== "undefined" ? __APP_GIT_SHA__ : "activa"}</span>
        </span>
        <button
          onClick={handleReload}
          disabled={updating}
          className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${updating ? "animate-spin" : ""}`} />
          <span>{updating ? "Cargando..." : "Actualizar"}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Pequeña insignia sutil para el footer que muestra la versión actual instalada
 */
export function CurrentBuildBadge() {
  const gitSha = typeof __APP_GIT_SHA__ !== "undefined" ? __APP_GIT_SHA__ : "dev";
  const buildId = typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "";

  return (
    <div
      className="inline-flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 font-mono transition-colors cursor-default"
      title={`Compilación: ${buildId}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      <span>v.{gitSha}</span>
    </div>
  );
}
