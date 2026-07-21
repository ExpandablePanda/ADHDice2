import { createServer } from "node:http";
import next from "next";
import { handleLocalQaSession } from "./local-qa-session-handler.ts";

const LOCAL_QA_PATH = "/api/local-qa-session";
const devHostname = process.env.ADHDICE_DEV_HOST ?? "0.0.0.0";
const devPort = Number.parseInt(process.env.PORT ?? "3000", 10);

if (process.env.NODE_ENV === "production") {
  throw new Error("The ADHDice development server cannot run with NODE_ENV=production.");
}
if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const nextApp = next({ dev: true, hostname: devHostname, port: devPort });
const nextRequestHandler = nextApp.getRequestHandler();

function getRequestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function toWebRequest(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const origin = `http://${request.headers.host ?? "localhost"}`;
  return new Request(new URL(request.url ?? "/", origin), {
    body,
    headers: getRequestHeaders(request),
    method: request.method,
  });
}

async function sendWebResponse(response, outgoing) {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) outgoing.setHeader(name, value);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

await nextApp.prepare();

const server = createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host ?? "localhost"}`;
    const pathname = new URL(request.url ?? "/", origin).pathname;
    if (pathname === LOCAL_QA_PATH) {
      const localQaResponse = await handleLocalQaSession(await toWebRequest(request), { isDevelopment: true });
      await sendWebResponse(localQaResponse, response);
      return;
    }
    await nextRequestHandler(request, response);
  } catch (error) {
    console.error("[dev-server] Request failed.", error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json");
    }
    response.end(JSON.stringify({ error: "Development server request failed." }));
  }
});

server.listen(devPort, devHostname, () => {
  console.log(`> ADHDice development server ready on http://${devHostname}:${devPort}`);
});
