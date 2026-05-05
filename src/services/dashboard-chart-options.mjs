export const emptyDashboardSeries = {
  xData: [],
  yData: []
};

function toSeries(labels = [], values = []) {
  const yData = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return {
    xData: labels.map((label) => String(label)).slice(0, yData.length),
    yData
  };
}

export function dashboardSeries(labels = [], values = []) {
  return toSeries(labels, values);
}

export function createBarOption(series, title) {
  return {
    title: { left: "left", text: title, textStyle: { color: "#64748b", fontWeight: 600, fontSize: 14 } },
    xAxis: {
      data: series.xData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11, margin: 12 }
    },
    grid: { left: 0, right: 0, bottom: 0, top: 40, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(16, 185, 129, 0.05)" } }, padding: [8, 12], backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(255, 255, 255, 0.1)", textStyle: { color: "#f8fafc" } },
    yAxis: {
      axisTick: { show: false },
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)", type: "dashed" } }
    },
    series: [
      {
        name: "value",
        type: "bar",
        barMaxWidth: 32,
        itemStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: "#10b981" }, { offset: 1, color: "#047857" }]
          },
          borderRadius: [4, 4, 0, 0]
        },
        data: series.yData,
        animationDuration: 1500,
        animationEasing: "cubicOut"
      }
    ]
  };
}

export function createLineOption(series, title) {
  return {
    title: { left: "left", text: title, textStyle: { color: "#64748b", fontWeight: 600, fontSize: 14 } },
    xAxis: {
      data: series.xData,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11, margin: 12 }
    },
    grid: { left: 0, right: 10, bottom: 0, top: 40, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#10b981", type: "dashed" } },
      padding: [8, 12], backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(255, 255, 255, 0.1)", textStyle: { color: "#f8fafc" },
      formatter: "{b} <br/><span style='color:#10b981'>●</span> {a} : {c}%"
    },
    yAxis: {
      axisTick: { show: false },
      min: 0, max: 80, interval: 20,
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)", type: "dashed" } }
    },
    series: [
      {
        name: "value",
        smooth: 0.4,
        type: "line",
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: "#10b981", width: 3, shadowColor: "rgba(16, 185, 129, 0.3)", shadowBlur: 8, shadowOffsetY: 4 },
        itemStyle: { color: "#10b981", borderColor: "#fff", borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: "rgba(16, 185, 129, 0.3)" }, { offset: 1, color: "rgba(16, 185, 129, 0)" }]
          }
        },
        data: series.yData,
        animationDuration: 1500,
        animationEasing: "cubicOut"
      }
    ]
  };
}

export function createPieOption(series, title) {
  return {
    color: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6"],
    title: { text: title, left: "center", textStyle: { color: "#64748b", fontWeight: 600, fontSize: 14 } },
    tooltip: { trigger: "item", padding: [8, 12], backgroundColor: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(255, 255, 255, 0.1)", textStyle: { color: "#f8fafc" }, formatter: "{a} <br/>{b} : {c} ({d}%)" },
    legend: { bottom: "0", itemWidth: 10, itemHeight: 10, textStyle: { color: "#94a3b8", fontSize: 11 } },
    series: [
      {
        name: title,
        type: "pie",
        roseType: "radius",
        radius: ["40%", "75%"],
        center: ["50%", "45%"],
        itemStyle: { borderRadius: 4, borderColor: "#fff", borderWidth: 2 },
        data: series.xData.map((name, index) => ({
          name,
          value: series.yData[index] ?? 0
        })),
        animationEasing: "cubicOut",
        animationDuration: 1500
      }
    ]
  };
}
