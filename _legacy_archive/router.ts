import { Router, Request as ExpRequest, Response as ExpResponse } from 'express';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { requestStore } from './shims/next-headers';

interface RouteModule {
  GET?: Function;
  POST?: Function;
  PUT?: Function;
  DELETE?: Function;
  PATCH?: Function;
  OPTIONS?: Function;
  HEAD?: Function;
}

export async function createApiRouter(apiBaseDir: string): Promise<Router> {
  const router = Router();
  const routeFiles: { filePath: string; relativePath: string }[] = [];

  function scanDir(dir: string, base: string = '') {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relPath = path.join(base, item.name);
      if (item.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (item.name === 'route.ts' || item.name === 'route.js') {
        routeFiles.push({ filePath: fullPath, relativePath: base });
      }
    }
  }

  scanDir(apiBaseDir);

  // Sort routes: static routes first, dynamic (:param) routes later, catch-all (*) last
  routeFiles.sort((a, b) => {
    const aHasDynamic = a.relativePath.includes('[');
    const bHasDynamic = b.relativePath.includes('[');
    if (!aHasDynamic && bHasDynamic) return -1;
    if (aHasDynamic && !bHasDynamic) return 1;
    return b.relativePath.length - a.relativePath.length;
  });

  console.log(`[API Router] Found ${routeFiles.length} API route files. Mounting...`);

  for (const { filePath, relativePath } of routeFiles) {
    // Convert path: e.g. "jobs/[id]" -> "/jobs/:id"
    let routePath = '/' + relativePath.replace(/\\/g, '/');
    routePath = routePath.replace(/\/+/g, '/').replace(/\/$/, '');
    if (routePath === '') routePath = '/';

    // Convert Next.js param patterns to Express param patterns
    // [...slug] -> *
    routePath = routePath.replace(/\[\.\.\.([^\]]+)\]/g, '*');
    // [param] -> :param
    routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');

    try {
      const fileUrl = pathToFileURL(filePath).href;
      const mod: RouteModule = await import(fileUrl);
      const methods: (keyof RouteModule)[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

      for (const method of methods) {
        const handler = mod[method];
        if (typeof handler === 'function') {
          const expressMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

          router[expressMethod](routePath, async (req: ExpRequest, res: ExpResponse) => {
            try {
              // 1. Build Web Request
              const protocol = req.protocol || 'http';
              const host = req.get('host') || 'localhost:6969';
              const fullUrl = `${protocol}://${host}${req.originalUrl}`;

              const webHeaders = new Headers();
              for (const [key, val] of Object.entries(req.headers)) {
                if (val !== undefined) {
                  if (Array.isArray(val)) {
                    val.forEach(v => webHeaders.append(key, v));
                  } else {
                    webHeaders.set(key, val);
                  }
                }
              }

              // Parse cookies safely (support values containing '=')
              const cookieMap = new Map<string, string>();
              if (req.headers.cookie) {
                req.headers.cookie.split(';').forEach(c => {
                  const idx = c.indexOf('=');
                  if (idx !== -1) {
                    const k = c.slice(0, idx).trim();
                    const v = c.slice(idx + 1).trim();
                    if (k) {
                      try {
                        cookieMap.set(k, decodeURIComponent(v));
                      } catch {
                        cookieMap.set(k, v);
                      }
                    }
                  }
                });
              }

              const bodyAllowed = !['GET', 'HEAD'].includes(method);
              let requestBody: any = undefined;
              if (bodyAllowed && req.body && Object.keys(req.body).length > 0) {
                requestBody = JSON.stringify(req.body);
              }

              const webRequest = new Request(fullUrl, {
                method,
                headers: webHeaders,
                body: requestBody
              });

              // Context with AsyncLocalStorage for cookies()/headers()
              const webResponse: Response = await requestStore.run(
                { cookies: cookieMap, headers: webHeaders },
                () => handler(webRequest, { params: Promise.resolve(req.params) })
              );

              // 2. Transmit Response
              res.status(webResponse.status);

              if (typeof (webResponse.headers as any).getSetCookie === 'function') {
                const cookiesList = (webResponse.headers as any).getSetCookie();
                if (cookiesList && cookiesList.length > 0) {
                  res.setHeader('Set-Cookie', cookiesList);
                }
              }

              webResponse.headers.forEach((value, name) => {
                if (name.toLowerCase() !== 'set-cookie') {
                  res.setHeader(name, value);
                }
              });

              const contentType = webResponse.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                const json = await webResponse.json();
                res.json(json);
              } else if (contentType.includes('text/') || contentType.includes('xml')) {
                const text = await webResponse.text();
                res.send(text);
              } else {
                const arrayBuffer = await webResponse.arrayBuffer();
                res.send(Buffer.from(arrayBuffer));
              }
            } catch (err: any) {
              console.error(`Error in route ${method} ${routePath}:`, err);
              if (!res.headersSent) {
                res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
              }
            }
          });
        }
      }
    } catch (importErr) {
      console.error(`Failed to load route file: ${filePath}`, importErr);
    }
  }

  return router;
}
