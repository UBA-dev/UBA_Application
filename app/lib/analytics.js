// Groups sales/expenses records into time buckets (day/week/month) for charting,
// and compares totals against the previous equivalent period for trend arrows.

export const RANGE_OPTIONS = ["7D", "30D", "3M", "6M", "1Y", "All"];

export const RANGE_LABELS = {
  "7D": "Last 7 Days",
  "30D": "Last 30 Days",
  "3M": "Last 3 Months",
  "6M": "Last 6 Months",
  "1Y": "Last 12 Months",
  All: "All Time",
};

function getRangeBounds(rangeKey, earliestDate) {
  const end = new Date();
  const start = new Date(end);
  let granularity;

  switch (rangeKey) {
    case "7D":
      start.setDate(start.getDate() - 6);
      granularity = "day";
      break;
    case "30D":
      start.setDate(start.getDate() - 29);
      granularity = "day";
      break;
    case "3M":
      start.setMonth(start.getMonth() - 3);
      granularity = "week";
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      granularity = "week";
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      granularity = "month";
      break;
    case "All":
    default:
      start.setTime(earliestDate ? earliestDate.getTime() : end.getTime());
      granularity = "month";
      break;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end, granularity };
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  if (granularity === "day") return d.toISOString().slice(0, 10);
  if (granularity === "week") {
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());
    return sunday.toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function bucketLabel(key, granularity) {
  if (granularity === "day") {
    return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  if (granularity === "week") {
    return new Date(key + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

// Builds a continuous, chart-ready series — empty periods show as 0 instead of disappearing
export function buildTrendSeries(sales, expenses, rangeKey) {
  const allDates = [...sales.map((s) => new Date(s.date)), ...expenses.map((e) => new Date(e.date))];
  const earliestDate = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : new Date();

  const { start, end, granularity } = getRangeBounds(rangeKey, earliestDate);
  const bucketsMap = new Map();

  const cursor = new Date(start);
  while (cursor <= end) {
    const key = bucketKey(cursor, granularity);
    if (!bucketsMap.has(key)) {
      bucketsMap.set(key, { key, label: bucketLabel(key, granularity), revenue: 0, profit: 0, expenses: 0 });
    }
    if (granularity === "day") cursor.setDate(cursor.getDate() + 1);
    else if (granularity === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }

  sales.forEach((s) => {
    const d = new Date(s.date);
    if (d < start || d > end) return;
    const bucket = bucketsMap.get(bucketKey(d, granularity));
    if (bucket) {
      bucket.revenue += s.total || 0;
      bucket.profit += s.profit || 0;
    }
  });

  expenses.forEach((e) => {
    const d = new Date(e.date);
    if (d < start || d > end) return;
    const bucket = bucketsMap.get(bucketKey(d, granularity));
    if (bucket) bucket.expenses += e.amount || 0;
  });

  const series = Array.from(bucketsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  series.forEach((b) => {
    b.netProfit = b.profit - b.expenses;
  });

  return { series, start, end, granularity };
}

// Compares the selected range's totals against the immediately preceding equivalent range
export function computePeriodComparison(sales, expenses, rangeKey) {
  const { start, end } = getRangeBounds(rangeKey, new Date(0));
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const sumInRange = (records, field, s, e) =>
    records.reduce((sum, r) => {
      const d = new Date(r.date);
      return d >= s && d <= e ? sum + (r[field] || 0) : sum;
    }, 0);

  const currentRevenue = sumInRange(sales, "total", start, end);
  const currentProfit = sumInRange(sales, "profit", start, end);
  const currentExpenses = sumInRange(expenses, "amount", start, end);

  const prevRevenue = sumInRange(sales, "total", prevStart, prevEnd);
  const prevProfit = sumInRange(sales, "profit", prevStart, prevEnd);
  const prevExpenses = sumInRange(expenses, "amount", prevStart, prevEnd);

  const pctChange = (curr, prev) => {
    if (prev === 0) return curr === 0 ? 0 : 100;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  return {
    currentRevenue,
    currentProfit,
    currentExpenses,
    currentNetProfit: currentProfit - currentExpenses,
    revenueChangePct: pctChange(currentRevenue, prevRevenue),
    profitChangePct: pctChange(currentProfit, prevProfit),
    expensesChangePct: pctChange(currentExpenses, prevExpenses),
    netProfitChangePct: pctChange(currentProfit - currentExpenses, prevProfit - prevExpenses),
  };
}