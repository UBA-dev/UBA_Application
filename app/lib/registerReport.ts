// Daily Cashier Report — the printable (Print / Save as PDF) and Excel
// versions of one cashier's register day. Both list every sale, expense and
// deposit so the owner can match the cash against the records line by line.

import {
  DEPOSIT_TYPE_LABELS,
  formatBusinessDate,
  formatDateTime,
  formatTime,
  money,
  nowIso,
  peso,
  type DaySummary,
  type RegisterDay,
  type RegisterDeposit,
  type RegisterExpense,
  type RegisterSale,
} from "./register";

export type RegisterReportData = {
  businessName: string;
  logoUrl?: string | null;
  cashierName: string;
  date: string;
  day: RegisterDay | null;
  summary: DaySummary;
  sales: RegisterSale[];
  expenses: RegisterExpense[];
  deposits: RegisterDeposit[];
  // Cashiers don't see cost or profit anywhere else in the app either.
  includeProfit: boolean;
  generatedByName: string;
  changedAfterClose: boolean;
};

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const byTime = <T extends { date?: string; createdAt?: string }>(a: T, b: T) =>
  (a.date || a.createdAt || "").localeCompare(b.date || b.createdAt || "");

const paymentLabel = (s: RegisterSale) =>
  s.paymentMethod === "ewallet" ? `GCash/E-wallet${s.paymentRef ? ` (Ref ${s.paymentRef})` : ""}` : "Cash";

function depositStatus(d: RegisterDeposit): string {
  if (d.voided) return `VOIDED${d.voidReason ? ` — ${d.voidReason}` : ""}`;
  if (d.verifiedAt) return `Received by ${d.verifiedByName || "owner"}`;
  return "Awaiting owner confirmation";
}

function statusLine(data: RegisterReportData): string {
  const day = data.day;
  if (day?.status === "closed") return `CLOSED · ${formatDateTime(day.closedAt)}`;
  return "OPEN · not yet closed";
}

export function fileBaseName(data: RegisterReportData): string {
  const who = data.cashierName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cashier";
  return `UBA-Cashier-Report_${who}_${data.date}`;
}

// ---- Printable report -----------------------------------------------------------

export function printRegisterReport(data: RegisterReportData): boolean {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups for UBA so the report can open.");
    return false;
  }
  win.document.open();
  win.document.write(buildRegisterReportHtml(data));
  win.document.close();
  return true;
}

export function buildRegisterReportHtml(data: RegisterReportData): string {
  const s = data.summary;
  const sales = [...data.sales].sort(byTime);
  const expenses = [...data.expenses].sort(byTime);
  const deposits = [...data.deposits].sort(byTime);
  const activeDeposits = deposits.filter((d) => !d.voided);
  const profitCols = data.includeProfit;

  const warnings: string[] = [];
  if (data.changedAfterClose) {
    warnings.push("Records for this day were added, edited or deleted after it was closed. The totals below are the current records; the totals at closing are shown in the Closing Check section.");
  }
  if ((data.day?.reopenCount || 0) > 0) {
    warnings.push(`This day was reopened by the owner ${data.day!.reopenCount} time(s).`);
  }
  if (s.expensesExceedCash) warnings.push("Expenses are higher than the cash that was in the drawer.");
  if (s.overDeposited) warnings.push("More cash was deposited than the drawer should have. Check the deposits and expenses.");
  if (sales.some((x) => x.lateSyncFromDate)) {
    warnings.push("Some sales were made offline on an earlier date and synced into this day (marked “late sync”).");
  }

  const reconRows = [
    ["Opening cash on hand (kept from previous day)", peso(s.openingCashOnHand), ""],
    ["+ Cash sales", peso(s.cashSales), ""],
    ["− Expenses paid from the drawer", peso(s.expenses), ""],
    ["= Expected cash in drawer", peso(s.expectedCash), "strong"],
    [`− Cash on hand deposit (required: ${peso(s.requiredCashOnHandDeposit)})`, peso(s.cashOnHandDeposited), ""],
    [
      `− Sales deposit${s.cashOnHandLimit != null ? ` (at least ${peso(s.minSalesDeposit)})` : ""}`,
      peso(s.salesDeposited),
      "",
    ],
    ["= Cash on hand kept for next day", peso(s.closingCashOnHand), "highlight"],
  ]
    .map(
      ([label, value, cls]) =>
        `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`
    )
    .join("");

  const totalsRows = [
    ["Total sales", peso(s.totalSales)],
    ["Cash sales", peso(s.cashSales)],
    ["GCash / e-wallet sales (not in drawer)", peso(s.ewalletSales)],
    ["Transactions", String(s.transactionCount)],
    ["Items sold", String(s.itemsSold)],
    ...(profitCols ? [["Gross profit", peso(s.profit)]] : []),
    ["Expenses", peso(s.expenses)],
    ...(profitCols ? [["Net profit (gross profit − expenses)", peso(s.profit - s.expenses)]] : []),
    ["Total deposited", peso(s.cashOnHandDeposited + s.salesDeposited)],
  ]
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(value)}</td></tr>`)
    .join("");

  const salesRows = sales.length
    ? sales
        .map(
          (x) => `<tr>
            <td>${esc(formatTime(x.date))}</td>
            <td class="mono">${esc((x.transactionId || "").slice(-6))}</td>
            <td>${esc(x.itemName)}${x.lateSyncFromDate ? ` <span class="tag">late sync · ${esc(x.lateSyncFromDate)}</span>` : ""}</td>
            <td class="num">${esc(x.quantity)}</td>
            <td class="num">${esc(peso(x.price))}</td>
            <td class="num">${esc(peso(x.total))}</td>
            <td>${esc(paymentLabel(x))}</td>
            ${profitCols ? `<td class="num">${esc(peso(x.profit || 0))}</td>` : ""}
          </tr>`
        )
        .join("")
    : `<tr><td colspan="${profitCols ? 8 : 7}" class="empty">No sales</td></tr>`;

  const expenseRows = expenses.length
    ? expenses
        .map(
          (e) => `<tr><td>${esc(formatTime(e.date))}</td><td>${esc(e.description)}</td><td class="num">${esc(peso(e.amount))}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="empty">No expenses</td></tr>`;

  const depositRows = deposits.length
    ? deposits
        .map(
          (d, i) => `<tr class="${d.voided ? "voided" : ""}">
            <td>${i + 1}</td>
            <td>${esc(formatDateTime(d.createdAt))}</td>
            <td>${esc(DEPOSIT_TYPE_LABELS[d.type])}</td>
            <td class="num">${esc(peso(d.amount))}</td>
            <td>${esc(d.method)}</td>
            <td>${esc(d.reference || "—")}</td>
            <td>${esc(depositStatus(d))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No deposits</td></tr>`;

  const proofs = deposits
    .map((d, i) =>
      d.proofImage?.startsWith("data:image/")
        ? `<figure class="${d.voided ? "voided" : ""}">
            <img src="${d.proofImage}" alt="Proof ${i + 1}" />
            <figcaption>#${i + 1} · ${esc(DEPOSIT_TYPE_LABELS[d.type])} · ${esc(peso(d.amount))} · ${esc(formatTime(d.createdAt))}${d.voided ? " · VOIDED" : ""}</figcaption>
          </figure>`
        : ""
    )
    .join("");

  const closing = data.day?.closing;
  const closingCheck = data.changedAfterClose && closing
    ? `<h2>Closing check</h2>
       <table class="kv">
         <tr><th></th><th class="num">At closing</th><th class="num">Records now</th></tr>
         <tr><td>Total sales</td><td class="num">${esc(peso(closing.totalSales))}</td><td class="num">${esc(peso(s.totalSales))}</td></tr>
         <tr><td>Expenses</td><td class="num">${esc(peso(closing.expenses))}</td><td class="num">${esc(peso(s.expenses))}</td></tr>
         <tr><td>Cash on hand deposit</td><td class="num">${esc(peso(closing.cashOnHandDeposited))}</td><td class="num">${esc(peso(s.cashOnHandDeposited))}</td></tr>
         <tr><td>Sales deposit</td><td class="num">${esc(peso(closing.salesDeposited))}</td><td class="num">${esc(peso(s.salesDeposited))}</td></tr>
         <tr><td>Cash on hand kept</td><td class="num">${esc(peso(closing.closingCashOnHand))}</td><td class="num">${esc(peso(s.closingCashOnHand))}</td></tr>
       </table>`
    : "";

  const check = (ok: boolean) => (ok ? "✔" : "✘");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(fileBaseName(data))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; font-size: 12px; }
  .wrap { max-width: 800px; margin: 0 auto; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #1f3864; padding-bottom: 10px; margin-bottom: 14px; }
  header img { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; }
  .shop { font-size: 18px; font-weight: bold; }
  .title { font-size: 13px; letter-spacing: 0.12em; color: #1f3864; font-weight: bold; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 20px; margin-bottom: 14px; }
  .meta div span { color: #555; }
  .status { font-weight: bold; }
  .warn { background: #fff4e5; border: 1px solid #f0a020; color: #7a4a00; padding: 8px 10px; margin-bottom: 8px; border-radius: 6px; }
  h2 { font-size: 13px; color: #1f3864; border-bottom: 1px solid #c9d3e6; padding-bottom: 4px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e3e7ef; text-align: left; vertical-align: top; }
  th { background: #eef2f8; font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .mono { font-family: 'Courier New', monospace; }
  .empty { text-align: center; color: #777; padding: 10px; }
  tr.strong td { font-weight: bold; border-top: 2px solid #c9d3e6; }
  tr.highlight td { font-weight: bold; background: #e8f5e9; font-size: 13px; }
  tr.voided td { color: #999; text-decoration: line-through; }
  tfoot td { font-weight: bold; background: #f6f8fb; }
  .tag { font-size: 10px; background: #fff4e5; color: #7a4a00; padding: 1px 4px; border-radius: 4px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .proofs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  figure { margin: 0; border: 1px solid #e3e7ef; border-radius: 6px; padding: 6px; break-inside: avoid; }
  figure img { width: 100%; max-height: 220px; object-fit: contain; display: block; background: #f6f8fb; }
  figure.voided { opacity: 0.45; }
  figcaption { font-size: 10px; color: #444; margin-top: 4px; }
  .checks td:first-child { width: 28px; font-size: 14px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
  .sign div { border-top: 1px solid #111; padding-top: 4px; text-align: center; }
  footer { margin-top: 24px; color: #777; font-size: 10px; text-align: center; }
  .toolbar { position: sticky; top: 0; background: #1f3864; color: #fff; padding: 10px; margin: -24px -24px 16px; text-align: center; }
  .toolbar button { font-size: 14px; padding: 8px 18px; border: 0; border-radius: 6px; background: #fff; color: #1f3864; font-weight: bold; }
  .scroll { overflow-x: auto; }
  @media (max-width: 640px) { .scroll table { min-width: 600px; } .two, .meta { grid-template-columns: 1fr; } .proofs { grid-template-columns: repeat(2, minmax(0, 1fr)); } body { padding: 12px; } .toolbar { margin: -12px -12px 12px; } }
  @media print { .toolbar { display: none; } body { padding: 0; } @page { size: A4; margin: 12mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨️ Print / Save as PDF</button></div>
<div class="wrap">
  <header>
    ${data.logoUrl?.startsWith("data:image/") ? `<img src="${data.logoUrl}" alt="" />` : ""}
    <div>
      <div class="shop">${esc(data.businessName || "My Shop")}</div>
      <div class="title">DAILY CASHIER REPORT</div>
    </div>
  </header>

  <div class="meta">
    <div><span>Cashier:</span> <b>${esc(data.cashierName)}</b></div>
    <div><span>Business date:</span> <b>${esc(formatBusinessDate(data.date, true))}</b></div>
    <div><span>Status:</span> <span class="status">${esc(statusLine(data))}</span></div>
    <div><span>Day opened:</span> ${esc(formatDateTime(data.day?.openedAt))}</div>
    <div><span>Report generated:</span> ${esc(formatDateTime(nowIso()))}</div>
    <div><span>Generated by:</span> ${esc(data.generatedByName)}</div>
  </div>

  ${warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join("")}

  <div class="two">
    <div>
      <h2>Cash reconciliation</h2>
      <table class="kv">${reconRows}</table>
    </div>
    <div>
      <h2>Day totals</h2>
      <table class="kv">${totalsRows}</table>
    </div>
  </div>

  <h2>Sales (${sales.length} line${sales.length === 1 ? "" : "s"} · ${s.transactionCount} transaction${s.transactionCount === 1 ? "" : "s"})</h2>
  <div class="scroll"><table>
    <thead><tr><th>Time</th><th>Txn</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th>Payment</th>${profitCols ? `<th class="num">Profit</th>` : ""}</tr></thead>
    <tbody>${salesRows}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="num">${esc(peso(s.totalSales))}</td><td></td>${profitCols ? `<td class="num">${esc(peso(s.profit))}</td>` : ""}</tr></tfoot>
  </table></div>

  <h2>Expenses paid from the drawer</h2>
  <table>
    <thead><tr><th>Time</th><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>${expenseRows}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td class="num">${esc(peso(s.expenses))}</td></tr></tfoot>
  </table>

  <h2>Deposits</h2>
  <div class="scroll"><table>
    <thead><tr><th>#</th><th>Date &amp; time</th><th>Type</th><th class="num">Amount</th><th>How</th><th>Reference</th><th>Status</th></tr></thead>
    <tbody>${depositRows}</tbody>
    <tfoot>
      <tr><td colspan="3">Cash on hand deposits</td><td class="num">${esc(peso(s.cashOnHandDeposited))}</td><td colspan="3"></td></tr>
      <tr><td colspan="3">Sales deposits</td><td class="num">${esc(peso(s.salesDeposited))}</td><td colspan="3"></td></tr>
    </tfoot>
  </table></div>
  ${activeDeposits.length !== deposits.length ? `<p style="color:#777">Voided deposits are crossed out and not counted.</p>` : ""}

  ${proofs ? `<h2>Proof of deposits</h2><div class="proofs">${proofs}</div>` : ""}

  ${closingCheck}

  <h2>Closing checklist</h2>
  <table class="checks">
    <tr><td>${check(s.cashOnHandDepositDone)}</td><td>Previous cash on hand deposited in full (${esc(peso(s.cashOnHandDeposited))} of ${esc(peso(s.requiredCashOnHandDeposit))})</td></tr>
    <tr><td>${check(s.salesDepositDone)}</td><td>Sales deposited (${esc(peso(s.salesDeposited))}${s.cashOnHandLimit != null ? `, at least ${esc(peso(s.minSalesDeposit))} to stay within the ${esc(peso(s.cashOnHandLimit))} cash on hand limit` : ""})</td></tr>
    <tr><td>${check(data.day?.status === "closed")}</td><td>Day closed${data.day?.closedAt ? ` at ${esc(formatDateTime(data.day.closedAt))}` : ""}</td></tr>
  </table>

  <div class="sign">
    <div>Prepared by (Cashier): ${esc(data.cashierName)}</div>
    <div>Received &amp; verified by (Owner)</div>
  </div>

  <footer>Generated by UBA — Universal Business Assistant · ${esc(fileBaseName(data))}</footer>
</div>
<script>
  window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 400); });
</script>
</body>
</html>`;
}

// ---- Excel report ---------------------------------------------------------------

export async function downloadRegisterExcel(data: RegisterReportData): Promise<void> {
  const XLSX = await import("xlsx");
  const s = data.summary;
  const profitCols = data.includeProfit;

  const summaryRows: (string | number)[][] = [
    ["DAILY CASHIER REPORT"],
    ["Shop", data.businessName || "My Shop"],
    ["Cashier", data.cashierName],
    ["Business date", formatBusinessDate(data.date, true)],
    ["Status", statusLine(data)],
    ["Day opened", formatDateTime(data.day?.openedAt)],
    ["Report generated", `${formatDateTime(nowIso())} by ${data.generatedByName}`],
    [],
    ["CASH RECONCILIATION", "Amount (₱)"],
    ["Opening cash on hand (kept from previous day)", s.openingCashOnHand],
    ["+ Cash sales", s.cashSales],
    ["− Expenses paid from the drawer", s.expenses],
    ["= Expected cash in drawer", s.expectedCash],
    ["− Cash on hand deposit", s.cashOnHandDeposited],
    ["   (required: all of the previous cash on hand)", s.requiredCashOnHandDeposit],
    ["− Sales deposit", s.salesDeposited],
    ...(s.cashOnHandLimit != null
      ? [
          ["   (cash on hand limit)", s.cashOnHandLimit],
          ["   (minimum sales deposit)", s.minSalesDeposit],
        ]
      : []),
    ["= Cash on hand kept for next day", s.closingCashOnHand],
    [],
    ["DAY TOTALS"],
    ["Total sales", s.totalSales],
    ["Cash sales", s.cashSales],
    ["GCash / e-wallet sales (not in drawer)", s.ewalletSales],
    ["Transactions", s.transactionCount],
    ["Items sold", s.itemsSold],
    ...(profitCols ? [["Gross profit", s.profit]] : []),
    ["Expenses", s.expenses],
    ...(profitCols ? [["Net profit (gross profit − expenses)", money(s.profit - s.expenses)]] : []),
    ["Total deposited", money(s.cashOnHandDeposited + s.salesDeposited)],
    [],
    ["CLOSING CHECKLIST"],
    ["Previous cash on hand deposited in full", s.cashOnHandDepositDone ? "Yes" : "No"],
    ["Sales deposited", s.salesDepositDone ? "Yes" : "No"],
    ["Day closed", data.day?.status === "closed" ? `Yes — ${formatDateTime(data.day.closedAt)}` : "No"],
  ];
  if (data.changedAfterClose) {
    summaryRows.push([], ["WARNING", "Records were changed after this day was closed."]);
  }

  const salesSheet = [...data.sales].sort(byTime).map((x) => ({
    Time: formatTime(x.date),
    "Transaction #": x.transactionId || "",
    Item: x.itemName,
    Qty: x.quantity,
    "Unit price": money(x.price),
    Total: money(x.total),
    Payment: x.paymentMethod === "ewallet" ? "GCash/E-wallet" : "Cash",
    "E-wallet ref no.": x.paymentRef || "",
    ...(profitCols ? { Profit: money(x.profit || 0) } : {}),
    Note: x.lateSyncFromDate ? `Late sync from ${x.lateSyncFromDate}` : "",
  }));

  const expensesSheet = [...data.expenses].sort(byTime).map((e) => ({
    Time: formatTime(e.date),
    Description: e.description,
    Amount: money(e.amount),
  }));

  const depositsSheet = [...data.deposits].sort(byTime).map((d, i) => ({
    "#": i + 1,
    "Date & time": formatDateTime(d.createdAt),
    Type: DEPOSIT_TYPE_LABELS[d.type],
    Amount: money(d.amount),
    How: d.method,
    Reference: d.reference || "",
    Status: depositStatus(d),
    "Proof photo": d.proofImage ? "Attached (see printed report)" : "Missing",
  }));

  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 48 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(
    wb,
    salesSheet.length ? XLSX.utils.json_to_sheet(salesSheet) : XLSX.utils.aoa_to_sheet([["No sales"]]),
    "Sales"
  );
  XLSX.utils.book_append_sheet(
    wb,
    expensesSheet.length ? XLSX.utils.json_to_sheet(expensesSheet) : XLSX.utils.aoa_to_sheet([["No expenses"]]),
    "Expenses"
  );
  XLSX.utils.book_append_sheet(
    wb,
    depositsSheet.length ? XLSX.utils.json_to_sheet(depositsSheet) : XLSX.utils.aoa_to_sheet([["No deposits"]]),
    "Deposits"
  );
  XLSX.writeFile(wb, `${fileBaseName(data)}.xlsx`);
}
