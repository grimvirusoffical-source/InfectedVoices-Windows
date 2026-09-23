import fs from 'node:fs';

const THUMB = /^[0-9a-fA-F]{40}$/;

/** Report whether an Authenticode cert was supplied. Never invents one. */
export function describeCertificate(env = process.env) {
  const pfx = String(env.IV_AUTHENTICODE_PFX || '').trim();
  const thumb = String(env.IV_AUTHENTICODE_THUMBPRINT || '').trim();
  if (thumb && !THUMB.test(thumb)) {
    return {
      ok: false,
      reason: 'IV_AUTHENTICODE_THUMBPRINT is set but is not a 40-character SHA-1 thumbprint. Refusing to sign.'
    };
  }
  if (pfx) {
    if (!fs.existsSync(pfx)) {
      return {ok: false, reason: `IV_AUTHENTICODE_PFX does not exist (${pfx}). Refusing to sign.`};
    }
    if (env.IV_AUTHENTICODE_PASSWORD == null) {
      return {
        ok: false,
        reason: 'IV_AUTHENTICODE_PFX is set but IV_AUTHENTICODE_PASSWORD is missing. Refusing to sign.'
      };
    }
    return {ok: true, mode: 'pfx', pfx, thumb: null};
  }
  if (thumb) return {ok: true, mode: 'thumbprint', pfx: null, thumb};
  return {
    ok: false,
    reason: [
      'Authenticode certificate is not provisioned.',
      'Set IV_AUTHENTICODE_PFX and IV_AUTHENTICODE_PASSWORD, or IV_AUTHENTICODE_THUMBPRINT.',
      'Refusing to sign, cut a Release, or write SHA-256 sums.',
      'release/SHA256SUMS.txt stays UNPROVISIONED.'
    ].join('\n')
  };
}
