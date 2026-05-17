export const emptyDashboardSeries = {
  xData: [],
  yData: []
};

const defaultDashboardTheme = {
  primary: "#059669",
  primaryDeep: "#047857",
  primaryLight: "rgba(5, 150, 105, 0.12)",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  border: "rgba(148, 163, 184, 0.14)",
  surface: "#ffffff",
  tooltip: "rgba(15, 23, 42, 0.92)",
  tooltipText: "#f8fafc",
  alarmColors: []
};

function toSeries(labels = [], values = []) {
  const yData = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return {
    xData: labels.map((label) => String(label)).slice(0, yData.length),
    yData
  };
}

function chartTheme(theme = {}) {
  return { ...defaultDashboardTheme, ...theme };
}

export function dashboardSeries(labels = [], values = []) {
  return toSeries(labels, values);
}

export function createBarOption(series, title, theme = {}) {
  const colors = chartTheme(theme);
  return {
    title: { left: "left", text: title, textStyle: { color: colors.textMuted, fontWeight: 700, fontSize: 14 } },
    xAxis: {
      type: "category",
      data: series.xData,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: colors.textFaint, fontSize: 11, margin: 12 }
    },
    grid: { left: 0, right: 0, bottom: 0, top: 40, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: colors.primaryLight } },
      padding: [8, 12],
      backgroundColor: colors.tooltip,
      borderColor: colors.border,
      textStyle: { color: colors.tooltipText }
    },
    yAxis: {
      type: "value",
      axisTick: { show: false },
      minInterval: 1,
      axisLine: { show: false },
      axisLabel: { color: colors.textFaint, fontSize: 11 },
      splitLine: { lineStyle: { color: colors.border, type: "dashed" } }
    },
    series: [
      {
        name: "value",
        type: "bar",
        coordinateSystem: "cartesian2d",
        barMaxWidth: 32,
        itemStyle: {
          color: colors.primary,
          borderRadius: [4, 4, 0, 0]
        },
        data: series.yData,
        animationDelay: (index) => index * 28,
        animationDuration: 1200,
        animationDurationUpdate: 900,
        animationEasing: "elasticOut",
        animationEasingUpdate: "cubicOut",
        universalTransition: true
      }
    ]
  };
}

export function createLineOption(series, title, theme = {}) {
  const colors = chartTheme(theme);
  return {
    title: { left: "left", text: title, textStyle: { color: colors.textMuted, fontWeight: 700, fontSize: 14 } },
    xAxis: {
      type: "category",
      data: series.xData,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: colors.textFaint, fontSize: 11, margin: 12 }
    },
    grid: { left: 0, right: 10, bottom: 0, top: 40, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: colors.success, type: "dashed" } },
      padding: [8, 12],
      backgroundColor: colors.tooltip,
      borderColor: colors.border,
      textStyle: { color: colors.tooltipText },
      formatter: `{b} <br/><span style='color:${colors.success}'>●</span> {a} : {c}%`
    },
    yAxis: {
      type: "value",
      axisTick: { show: false },
      min: 0,
      max: 80,
      interval: 20,
      axisLine: { show: false },
      axisLabel: { color: colors.textFaint, fontSize: 11 },
      splitLine: { lineStyle: { color: colors.border, type: "dashed" } }
    },
    series: [
      {
        name: "value",
        smooth: 0.4,
        type: "line",
        coordinateSystem: "cartesian2d",
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        lineStyle: { color: colors.success, width: 3, shadowColor: colors.primaryLight, shadowBlur: 8, shadowOffsetY: 4 },
        itemStyle: { color: colors.success, borderColor: colors.surface, borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{ offset: 0, color: colors.primaryLight }, { offset: 1, color: "transparent" }]
          }
        },
        data: series.yData,
        animationDuration: 1500,
        animationEasing: "cubicOut"
      }
    ]
  };
}

export function createPieOption(series, title, theme = {}) {
  const colors = chartTheme(theme);
  const palette = colors.alarmColors.length
    ? colors.alarmColors
    : [colors.primary, colors.success, colors.primaryDeep, colors.textMuted, colors.warning, colors.danger];
  return {
    color: palette,
    title: { text: title, left: "center", textStyle: { color: colors.textMuted, fontWeight: 700, fontSize: 14 } },
    tooltip: {
      trigger: "item",
      padding: [8, 12],
      backgroundColor: colors.tooltip,
      borderColor: colors.border,
      textStyle: { color: colors.tooltipText },
      formatter: "{a} <br/>{b} : {c} ({d}%)"
    },
    legend: { bottom: "0", itemWidth: 10, itemHeight: 10, textStyle: { color: colors.textFaint, fontSize: 11 } },
    series: [
      {
        name: title,
        type: "pie",
        roseType: "radius",
        radius: ["40%", "75%"],
        center: ["50%", "45%"],
        label: {
          color: colors.textFaint,
          fontSize: 11,
          fontWeight: 600,
          overflow: "truncate",
          width: 96,
          textBorderWidth: 0
        },
        labelLine: {
          length: 16,
          length2: 22,
          lineStyle: { width: 1.5 }
        },
        itemStyle: { borderRadius: 4, borderWidth: 0 },
        data: series.xData.map((name, index) => ({
          name,
          value: series.yData[index] ?? 0,
          itemStyle: { color: palette[index % palette.length], borderWidth: 0 },
          labelLine: { lineStyle: { color: palette[index % palette.length] } }
        })),
        animationEasing: "cubicOut",
        animationDuration: 1500
      }
    ]
  };
}
