import type { User } from "firebase/auth";

export type SessionInfo = {
  tenantId: string;
  role: "owner" | "secretary" | "cashier";
  isStaff: boolean;
  staffName: string | null;
};

// Reads the Firebase ID token's custom claims to figure out which tenant
// this signed-in user actually belongs to. For a normal Owner account,
// there are no custom claims, so tenantId = their own uid. For staff
// accounts (signed in via custom token), the claims carry the real tenantId.
export async function getSessionInfo(user: User): Promise<SessionInfo> {
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims as any;

  if (claims.isStaff) {
    return {
      tenantId: claims.tenantId,
      role: claims.role,
      isStaff: true,
      staffName: claims.staffName || null,
    };
  }

  return {
    tenantId: user.uid,
    role: "owner",
    isStaff: false,
    staffName: null,
  };
}