function stringValue(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value);
}

export function mapExportRows(route, rows, columnKey) {
  const exportColumns = route.columns.filter((column) => column !== "Actions");
  return rows.map((row) => {
    const mapped = {};
    for (const column of exportColumns) {
      mapped[column] = stringValue(row[columnKey(column)]);
    }
    return mapped;
  });
}
