import http from "http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

/**
 * Starts a minimal mock OIDC server (OIDC discovery + JWKS) and returns
 * helpers for signing test tokens. Call stop() when done.
 *
 * @returns {{ issuer, audience, signToken, stop }}
 */
export async function createOAuthSetup() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key-1", alg: "RS256", use: "sig" };
  const audience = "consilium-test";

  const server = await new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
        const issuer = `http://localhost:${s.address().port}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/.well-known/jwks.json` }));
      } else if (req.url === "/.well-known/jwks.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [jwk] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    s.listen(0, () => resolve(s));
    s.on("error", reject);
  });

  const issuer = `http://localhost:${server.address().port}`;

  return {
    issuer,
    audience,

    /** Signs a valid JWT with the test key pair. */
    async signToken({ expiresIn = "1h" } = {}) {
      return new SignJWT({})
        .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(privateKey);
    },

    stop() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}