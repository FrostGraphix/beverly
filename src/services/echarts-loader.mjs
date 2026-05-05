/**
 * echarts-loader.mjs
 * Singleton ECharts loader — resolves once the CDN script is ready.
 * All chart components await this instead of checking window.echarts directly.
 *
 * Usage:
 *   import { loadECharts } from "../../services/echarts-loader.mjs";
 *   const echarts = await loadECharts();
 *   const chart = echarts.init(el);
 */

const CDN_URL = "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js";

let _promise = null;

export function loadECharts() {
  // Already resolved (normal hot-reload path)
  if (window.echarts) return Promise.resolve(window.echarts);

  // Already in progress — return same promise
  if (_promise) return _promise;

  _promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CDN_URL}"]`);
    if (existing) {
      // Script tag present but onload already fired — check again in a tick
      const poll = setInterval(() => {
        if (window.echarts) { clearInterval(poll); resolve(window.echarts); }
      }, 50);
      setTimeout(() => { clearInterval(poll); reject(new Error("ECharts load timeout")); }, 10000);
      return;
    }

    const s = document.createElement("script");
    s.src = CDN_URL;
    s.async = true;
    s.onload = () => resolve(window.echarts);
    s.onerror = () => reject(new Error("Failed to load ECharts from CDN"));
    document.head.appendChild(s);

    // Safety timeout
    setTimeout(() => {
      if (!window.echarts) reject(new Error("ECharts load timeout"));
    }, 15000);
  });

  return _promise;
}
