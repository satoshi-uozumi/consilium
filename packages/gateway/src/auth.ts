import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthConfig {
  issuer: string;
  audience: string;
}

// issuer → RemoteJWKSet; jose handles JWKS key rotation internally
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function resolveJwks(issuer: string) {
  if (jwksCache.has(issuer)) return jwksCache.get(issuer)!;

  // Prefer OIDC discovery; fall back to standard JWKS path
  let jwksUri: string;
  try {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    const { jwks_uri } = (await res.json()) as { jwks_uri: string };
    jwksUri = jwks_uri;
  } catch {
    jwksUri = `${issuer}/.well-known/jwks.json`;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(issuer, jwks);
  return jwks;
}

/** Validates a Bearer token. Throws on missing, malformed, or invalid token. */
export async function validateBearerToken(authHeader: string | undefined, config: AuthConfig): Promise<void> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("missing bearer token");
  const token = authHeader.slice(7);
  const jwks = await resolveJwks(config.issuer);
  await jwtVerify(token, jwks, { issuer: config.issuer, audience: config.audience });
}

/** RFC 9728 Protected Resource Metadata — advertises the authorization server to clients. */
export function protectedResourceMetadata(gatewayUrl: string, config: AuthConfig) {
  return {
    resource: gatewayUrl,
    authorization_servers: [config.issuer],
    bearer_methods_supported: ["header"],
  };
}