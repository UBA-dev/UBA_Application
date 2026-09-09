interface ReceiptLine {
  label: string;
  amount: number;
}

interface PrintReceiptOptions {
  businessName?: string;
  logoUrl?: string | null;
  receiptTitle?: string;
  receiptNumber?: string;
  date?: Date | string;
  customerName?: string;
  lines: ReceiptLine[];
  total: number;
  cashReceived?: number;
  change?: number;
  footerNote?: string;
}

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printReceipt({
  businessName,
  logoUrl,
  receiptTitle = "Sales Receipt",
  receiptNumber,
  date,
  customerName,
  lines,
  total,
  cashReceived,
  change,
  footerNote = "Thank you for your business!",
}: PrintReceiptOptions) {
  const dateStr = new Date(date || Date.now()).toLocaleString();

  const linesHtml = lines
    .map(
      (l) => `
      <div class="line">
        <span class="line-label">${escapeHtml(l.label)}</span>
        <span class="line-amount">₱${Number(l.amount).toLocaleString()}</span>
      </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(receiptTitle)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', monospace;
    color: #000;
    background: #fff;
    padding: 16px;
    width: 320px;
    margin: 0 auto;
  }
  .center { text-align: center; }
  .logo { max-width: 64px; max-height: 64px; margin: 0 auto 8px; display: block; }
  .business-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .receipt-title { font-size: 12px; margin-bottom: 8px; }
  .divider { border-top: 1px dashed #000; margin: 8px 0; }
  .meta { font-size: 11px; margin-bottom: 2px; }
  .line { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
  .totals-line { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; margin-top: 6px; }
  .footer { text-align: center; font-size: 11px; margin-top: 12px; }
  @media print {
    @page { margin: 0.25in; }
    body { width: 100%; }
  }
</style>
</head>
<body>
  <div class="center">
    ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ""}
    <div class="business-name">${escapeHtml(businessName || "")}</div>
    <div class="receipt-title">${escapeHtml(receiptTitle)}</div>
  </div>
  <div class="divider"></div>
  <div class="meta">Date: ${escapeHtml(dateStr)}</div>
  ${receiptNumber ? `<div class="meta">Receipt #: ${escapeHtml(receiptNumber)}</div>` : ""}
  ${customerName ? `<div class="meta">Customer: ${escapeHtml(customerName)}</div>` : ""}
  <div class="divider"></div>
  ${linesHtml}
  <div class="divider"></div>
  <div class="totals-line">
    <span>TOTAL</span>
    <span>₱${Number(total).toLocaleString()}</span>
  </div>
  ${cashReceived != null ? `<div class="line"><span>Cash Received</span><span>₱${Number(cashReceived).toLocaleString()}</span></div>` : ""}
  ${change != null ? `<div class="line"><span>Change</span><span>₱${Number(change).toLocaleString()}</span></div>` : ""}
  <div class="footer">${escapeHtml(footerNote)}</div>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=380,height=640");
  if (!printWindow) {
    alert("Please allow pop-ups to print the receipt.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}