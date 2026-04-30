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
    title: { left: "center", text: title, textStyle: { color: "#008de4", fontWeight: "normal" } },
    xAxis: {
      data: series.xData,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#008de4" } },
      axisLabel: { color: "#008de4" }
    },
    grid: { left: 10, right: 10, bottom: 20, top: 30, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" }, padding: [5, 10] },
    yAxis: {
      axisTick: { show: false },
      minInterval: 1,
      axisLine: { lineStyle: { color: "#008de4" } },
      axisLabel: { color: "#008de4" },
      splitLine: { lineStyle: { color: "#eeeeee" } }
    },
    series: [
      {
        name: "value",
        smooth: true,
        type: "bar",
        itemStyle: {
          color: "#3888fa",
          lineStyle: { color: "#3888fa", width: 2 },
          areaStyle: { color: "#f3f8ff" }
        },
        data: series.yData,
        animationDuration: 2000,
        animationEasing: "quadraticOut"
      }
    ]
  };
}

export function createLineOption(series, title) {
  return {
    title: { left: "center", text: title, textStyle: { color: "#008de4", fontWeight: "normal", fontSize: 24 } },
    xAxis: {
      data: series.xData,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#008de4" } },
      axisLabel: {
        color: "#008de4",
        interval: Math.max(0, Math.ceil(series.xData.length / 8) - 1)
      }
    },
    grid: { left: 58, right: 30, bottom: 36, top: 56, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      padding: [5, 10],
      formatter: "{b} <br/>{a} : {c}%"
    },
    yAxis: {
      axisTick: { show: false },
      min: 0,
      max: 80,
      interval: 20,
      axisLine: { lineStyle: { color: "#008de4" } },
      axisLabel: { color: "#008de4" },
      splitLine: { lineStyle: { color: "#eeeeee" } }
    },
    series: [
      {
        name: "value",
        smooth: true,
        type: "line",
        symbol: "circle",
        symbolSize: 4,
        lineStyle: { color: "#3888fa", width: 2 },
        itemStyle: { color: "#3888fa", borderColor: "#fff", borderWidth: 1 },
        areaStyle: { color: "rgba(56, 136, 250, 0.06)" },
        data: series.yData,
        animationDuration: 2000,
        animationEasing: "quadraticOut"
      }
    ]
  };
}

export function createPieOption(series, title) {
  return {
    color: ["#35c2c1", "#b399dd", "#5caee8", "#ffb26a", "#db7a85", "#92a0bd", "#f3d600", "#9ab94f"],
    title: { text: title, align: "center", textStyle: { color: "#008de4", fontWeight: "normal" } },
    tooltip: { trigger: "item", formatter: "{a} <br/>{b} : {c} ({d}%)" },
    legend: { left: "center", bottom: "10", data: series.xData },
    series: [
      {
        name: title,
        type: "pie",
        roseType: "radius",
        radius: [15, 95],
        center: ["50%", "38%"],
        data: series.xData.map((name, index) => ({
          name,
          value: series.yData[index] ?? 0
        })),
        animationEasing: "cubicInOut",
        animationDuration: 2000
      }
    ]
  };
}
