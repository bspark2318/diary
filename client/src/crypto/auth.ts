// Passkey + PRF flows (D23, D27). One Face ID = login + unlock K.
import { startRegistration, startAuthentication, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { PRF_INPUT, importK, randomBytes, generateRecoveryCode, wrapWithPrf, wrapWithRecovery, unwrapWithPrf } from "./wrap";
import { setK } from "./key";
import { toB64u, fromB64u } from "./b64";

export class UnsupportedBrowser extends Error {}

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? r.statusText);
  return d;
}

// Ask the authenticator to evaluate PRF over our fixed input. ArrayBuffer is passed straight to navigator.credentials.
async function withPrf<T extends PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON>(optionsJSON: T): Promise<T> {
  (optionsJSON as any).extensions = { ...optionsJSON.extensions, prf: { eval: { first: await PRF_INPUT } } };
  return optionsJSON;
}
const prfOutput = (resp: { clientExtensionResults: unknown }) =>
  (resp.clientExtensionResults as any).prf?.results?.first as ArrayBuffer | undefined;

type LoginResult = { userId: string; role: string; credentialId: string; wrappedK: string | null; salt: string | null; hasRecovery: boolean };

/** Sign in, or unlock after a reload (K lives in memory only). */
export async function login(): Promise<{ recoveryCode?: string }> {
  const optionsJSON = await withPrf(await api("POST", "/api/auth/login/options"));
  const resp = await startAuthentication({ optionsJSON });
  const prf = prfOutput(resp);
  if (!prf) throw new UnsupportedBrowser("This passkey/browser does not support PRF; cannot unlock the diary.");
  const me: LoginResult = await api("POST", "/api/auth/login/verify", resp);
  if (me.wrappedK && me.salt) {
    setK(await unwrapWithPrf(fromB64u(me.wrappedK), fromB64u(me.salt), prf));
    return {};
  }
  if (me.hasRecovery) throw new Error("This passkey has no key wrap yet. Enrolling it via recovery code is not built yet.");
  return { recoveryCode: await setupK(me.credentialId, prf) }; // signup was interrupted before wraps were stored → finish it
}

/** Create account: passkey → PRF (from create() if the authenticator gives it, else one more get()) → K + recovery code → store both wraps. */
export async function register(): Promise<{ recoveryCode: string }> {
  const optionsJSON = await withPrf(await api("POST", "/api/auth/register/options"));
  const resp = await startRegistration({ optionsJSON });
  if ((resp.clientExtensionResults as any).prf?.enabled !== true)
    throw new UnsupportedBrowser("This browser/authenticator does not support WebAuthn PRF. Use Safari 18+, iOS 18+, or Chrome 116+.");
  const { credentialId } = await api("POST", "/api/auth/register/verify", resp);

  let prf = prfOutput(resp);
  if (!prf) {
    const o = await withPrf(await api("POST", "/api/auth/login/options"));
    const r = await startAuthentication({ optionsJSON: o });
    await api("POST", "/api/auth/login/verify", r);
    prf = prfOutput(r);
    if (!prf) throw new UnsupportedBrowser("Authenticator returned no PRF output.");
  }
  return { recoveryCode: await setupK(credentialId, prf) };
}

async function setupK(credentialId: string, prf: ArrayBuffer) {
  const rawK = randomBytes(32);
  const code = generateRecoveryCode();
  const p = await wrapWithPrf(rawK, prf);
  const r = await wrapWithRecovery(rawK, code);
  await api("PUT", "/api/keys/prf", { credentialId, wrappedK: toB64u(p.wrapped), salt: toB64u(p.salt) });
  await api("PUT", "/api/keys/recovery", { wrappedK: toB64u(r.wrapped), salt: toB64u(r.salt) });
  setK(await importK(rawK));
  return code;
}

export async function logout() {
  await api("POST", "/api/auth/logout");
  setK(null);
}
