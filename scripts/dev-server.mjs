import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const argumentsList = process.argv.slice(2);

function option(name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

const port = Number(option("--port") || process.env.PORT || 4173);
const host = option("--host") || process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Port must be an integer from 1 to 65535.");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function safeFilePath(pathname) {
  const candidate = resolve(webRoot, `.${pathname}`);
  const pathFromRoot = relative(webRoot, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) return null;
  return candidate;
}

function headers(contentType) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(
      request.url || "/",
      `http://${request.headers.host || "localhost"}`,
    );
    const pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.includes("\0")) throw new Error("Invalid path.");
    let filePath = safeFilePath(pathname === "/" ? "/index.html" : pathname);
    if (!filePath) {
      response.writeHead(403, headers("text/plain; charset=utf-8"));
      response.end("Forbidden");
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = resolve(filePath, "index.html");
      info = await stat(filePath).catch(() => null);
    }

    if (!info?.isFile()) {
      const acceptsHtml = String(request.headers.accept || "").includes(
        "text/html",
      );
      if (!acceptsHtml || extname(pathname)) {
        response.writeHead(404, headers("text/plain; charset=utf-8"));
        response.end("Not found");
        return;
      }
      filePath = resolve(webRoot, "index.html");
    }

    const body = await readFile(filePath);
    response.writeHead(
      200,
      headers(mime[extname(filePath)] || "application/octet-stream"),
    );
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(400, headers("text/plain; charset=utf-8"));
    response.end("Bad request");
  }
});

server.listen(port, host, () => {
  console.log(`PatchOath running at http://${host}:${port}`);
});
