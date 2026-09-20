// app/lib/permissions.ts
//
// ISANG LUGAR LANG kung saan nakasulat kung sino ang may power sa ano.
// Kapag gusto mong baguhin ang rules sa future, dito lang ang edit.

export type Role = "owner" | "secretary" | "cashier";

// ─────────────────────────────────────────────
// 1) PAGE ACCESS — sino ang pwedeng pumasok sa bawat page
// ─────────────────────────────────────────────
// Kapag ang page ay WALA sa listahan, Owner lang ang pwede
// (mas ligtas na "bawal muna" kaysa "pwede lahat").
export const PAGE_ACCESS: Record<string, Role[]> = {
  "/dashboard": ["owner", "secretary"],
  "/inventory": ["owner", "secretary", "cashier"],
  "/pos": ["owner", "secretary", "cashier"],
  "/repair-tickets": ["owner", "secretary"],
  "/delivery-tickets": ["owner", "secretary"],
  "/po-tickets": ["owner", "secretary"],
  "/sales": ["owner", "secretary"],
  "/settings": ["owner"],
  "/approvals": ["owner"],
};

export function canAccessPage(role: Role, path: string): boolean {
  const allowed = PAGE_ACCESS[path] ?? ["owner"];
  return allowed.includes(role);
}

// Kung pumasok sa page na bawal sa kanya, saan siya ibabalik?
export function homeFor(role: Role): string {
  return role === "cashier" ? "/pos" : "/dashboard";
}

// ─────────────────────────────────────────────
// 2) ACTIONS — ano ang pwede nilang gawin loob ng page
// ─────────────────────────────────────────────
export type Action =
  | "inventory.addItem"          // direktang mag-add ng item (kasama ang Scanner at Bundle)
  | "inventory.requestAddItem"   // mag-add pero kailangan ng approval ni Owner
  | "inventory.editPrice"        // direktang baguhin ang selling price / unit cost
  | "inventory.requestPrice"     // baguhin ang price pero kailangan ng approval
  | "inventory.editDetails"      // pangalan, category, stock, photo, supplier
  | "inventory.delete"
  | "inventory.seeCost"          // makita ang Unit Cost (puhunan)
  | "sales.view"
  | "sales.edit"                 // mag-edit / mag-delete ng sales
  | "expenses.add"
  | "expenses.edit"
  | "expenses.delete"
  | "tickets.manage"
  | "tickets.delete"
  | "pos.sell"
  | "staff.manage"
  | "approvals.review";

const ACTION_ACCESS: Record<Action, Role[]> = {
  "inventory.addItem": ["owner"],
  "inventory.requestAddItem": ["secretary"],
  "inventory.editPrice": ["owner"],
  "inventory.requestPrice": ["secretary"],
  "inventory.editDetails": ["owner", "secretary"],
  "inventory.delete": ["owner"],
  "inventory.seeCost": ["owner", "secretary"],
  "sales.view": ["owner", "secretary"],
  "sales.edit": ["owner"],
  "expenses.add": ["owner", "secretary"],
  "expenses.edit": ["owner", "secretary"],
  "expenses.delete": ["owner"],
  "tickets.manage": ["owner", "secretary"],
  "tickets.delete": ["owner"],
  "pos.sell": ["owner", "secretary", "cashier"],
  "staff.manage": ["owner"],
  "approvals.review": ["owner"],
};

export function can(role: Role, action: Action): boolean {
  return ACTION_ACCESS[action].includes(role);
}