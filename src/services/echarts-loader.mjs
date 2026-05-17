let chartLoader = null;

export function loadECharts() {
  if (typeof window !== "undefined" && window.echarts) return Promise.resolve(window.echarts);
  if (chartLoader) return chartLoader;

  chartLoader = import("echarts").then((module) => {
    if (typeof window !== "undefined") window.echarts = module;
    return module;
  });

  return chartLoader;
}
