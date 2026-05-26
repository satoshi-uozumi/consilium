import http from "http";

/**
 * Makes a StreamableHTTP MCP POST request.
 * Returns { status, sessionId, body } where body is parsed JSON.
 */
export function post(port, path, body, sessionId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Content-Length": Buffer.byteLength(payload),
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const req = http.request(
      { hostname: "localhost", port, path, method: "POST", headers },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          // SSE wraps JSON as "event: message\r\ndata: {...}\r\n\r\n"
          const match = data.match(/^data:\s*(.+)$/m);
          const json = match ? match[1].trim() : data;
          try {
            resolve({ status: res.statusCode, sessionId: res.headers["mcp-session-id"], body: JSON.parse(json) });
          } catch {
            resolve({ status: res.statusCode, sessionId: res.headers["mcp-session-id"], body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/** Sends an MCP initialize request and returns the full response. */
export function initialize(port, path) {
  return post(port, path, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.1" },
    },
  });
}