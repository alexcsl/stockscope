import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

export const firebaseCookie = "stockscope-firebase-token";
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"), { timeoutDuration: 10000 });
export function firebaseConfigured(): boolean { return process.env.STOCKSCOPE_FIREBASE_ENABLED === "1" && !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN; }

export async function verifyFirebaseToken(token: string, project: string, key: JWTVerifyGetKey = keys, now = new Date()) {
  if (!token || token.length > 4096 || !/^[a-z0-9-]{6,30}$/.test(project)) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["RS256"], issuer: `https://securetoken.google.com/${project}`, audience: project, currentDate: now, requiredClaims: ["exp", "iat", "sub", "auth_time"] });
    if (!payload.sub || payload.sub.length > 128 || typeof payload.iat !== "number" || payload.iat > now.getTime() / 1000 || typeof payload.auth_time !== "number" || payload.auth_time > now.getTime() / 1000 || payload.email_verified !== true || typeof payload.email !== "string" || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return null;
    return { id: `firebase:${project}:${payload.sub}`, uid: payload.sub, email: payload.email, provider: "firebase" as const, expires: payload.exp!, authenticatedAt: payload.auth_time };
  } catch (error) {
    if (error instanceof errors.JWTExpired || error instanceof errors.JWTClaimValidationFailed || error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid || error instanceof errors.JWKSNoMatchingKey) return null;
    throw error;
  }
}

export async function verifiedFirebaseAccount(token: string) {
  if (!firebaseConfigured()) throw new Error("firebase_not_configured");
  const account = await verifyFirebaseToken(token, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!);
  if (!account) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY!)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) throw new Error("firebase_account_unavailable");
  const user = (await response.json()).users?.[0];
  if (!user || user.localId !== account.uid || user.email !== account.email || user.emailVerified !== true || user.disabled === true || Number(user.validSince || 0) > account.authenticatedAt) return null;
  return account;
}
