import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyFirebaseToken } from "../src/lib/firebase-auth";

test("Firebase accepts only signed, verified email identities from the configured project", async () => {
  const project = "stockscope-fixture";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "fixture", alg: "RS256", use: "sig" }] });
  const now = Math.floor(Date.now() / 1000);
  const token = (claims = {}) => new SignJWT({ email: "research@example.com", email_verified: true, auth_time: now - 10, ...claims }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject("account1").setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
  const account = await verifyFirebaseToken(await token(), project, key);
  assert.equal(account?.id, `firebase:${project}:account1`);
  assert.equal(account?.email, "research@example.com");
  for (const claims of [{ email_verified: false }, { email: null }, { email: "invalid" }, { auth_time: now + 60 }]) assert.equal(await verifyFirebaseToken(await token(claims), project, key), null);
  assert.equal(await verifyFirebaseToken(await token(), "another-project", key), null);
  assert.equal(await verifyFirebaseToken("not.a.token", project, key), null);
  assert.equal(await verifyFirebaseToken("x".repeat(4097), project, key), null);
  assert.equal(await verifyFirebaseToken(await token(), project, key, new Date((now + 4000) * 1000)), null);
  const attacker = await generateKeyPair("RS256");
  const forged = await new SignJWT({ email: "research@example.com", email_verified: true, auth_time: now }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(`https://securetoken.google.com/${project}`).setAudience(project).setSubject("account1").setIssuedAt(now).setExpirationTime(now + 3600).sign(attacker.privateKey);
  assert.equal(await verifyFirebaseToken(forged, project, key), null);
});
