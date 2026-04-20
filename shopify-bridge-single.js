import express from "express";

const app = express();
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 10000);
const SHOP = String(process.env.SHOPIFY_STORE_DOMAIN || "").trim();
const TOKEN = String(process.env.SHOPIFY_ACCESS_TOKEN || "").trim();
const API_VERSION = String(process.env.SHOPIFY_API_VERSION || "2024-01").trim();
const BRIDGE_API_KEY = String(process.env.BRIDGE_API_KEY || "").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const ALLOWED_ORIGINS = String(process.env.BRIDGE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use(express.json({ limit: "1mb" }));

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Bridge-Api-Key"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

function requireBridgeAuth(req, res, next) {
  if (!BRIDGE_API_KEY) return next();
  const headerKey = String(req.get("x-bridge-api-key") || "").trim();
  const bearer = String(req.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (headerKey === BRIDGE_API_KEY || bearer === BRIDGE_API_KEY) {
    return next();
  }

  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

function assertShopifyConfig() {
  if (!SHOP || !TOKEN) {
    const error = new Error("Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN");
    error.statusCode = 500;
    throw error;
  }

  if (!SHOP.endsWith(".myshopify.com")) {
    const error = new Error("SHOPIFY_STORE_DOMAIN must be the store .myshopify.com domain");
    error.statusCode = 500;
    throw error;
  }
}

function normalizeAdminPath(input) {
  const raw = String(input || "/shop.json").trim();

  if (!raw) return `/admin/api/${API_VERSION}/shop.json`;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const error = new Error("Absolute URLs are not allowed");
    error.statusCode = 400;
    throw error;
  }

  if (raw.includes("..")) {
    const error = new Error("Path traversal is not allowed");
    error.statusCode = 400;
    throw error;
  }

  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.startsWith("/admin/api/")) return path;

  return `/admin/api/${API_VERSION}${path}`;
}

function buildShopifyUrl(path, queryParams = {}) {
  const url = new URL(`https://${SHOP}${normalizeAdminPath(path)}`);

  if (isPlainObject(queryParams)) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function parseResponseBody(response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json") && text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

async function shopifyRequest({ method = "GET", path = "/shop.json", queryParams = {}, body } = {}) {
  assertShopifyConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const normalizedMethod = String(method || "GET").toUpperCase();

  const headers = {
    "X-Shopify-Access-Token": TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  try {
    const response = await fetch(buildShopifyUrl(path, queryParams), {
      method: normalizedMethod,
      headers,
      body:
        normalizedMethod === "GET" || normalizedMethod === "HEAD"
          ? undefined
          : JSON.stringify(body ?? {}),
      signal: controller.signal
    });

    return {
      ok: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: await parseResponseBody(response)
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "shopify-bridge",
    status: "running",
    routes: {
      root: "GET /",
      health: "GET /health",
      command: "POST /command"
    },
    shopifyConfigured: Boolean(SHOP && TOKEN),
    requiresApiKey: Boolean(BRIDGE_API_KEY),
    apiVersion: API_VERSION
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    shopifyConfigured: Boolean(SHOP && TOKEN),
    timestamp: new Date().toISOString()
  });
});

app.post("/command", requireBridgeAuth, async (req, res, next) => {
  try {
    const action = String(req.body?.action || req.body?.command || "ping").trim();

    if (action === "ping") {
      return res.status(200).json({
        ok: true,
        action: "ping",
        route: "/command",
        body: req.body ?? null
      });
    }

    if (action === "health" || action === "health-shopify" || action === "shop.get") {
      const upstream = await shopifyRequest({ method: "GET", path: "/shop.json" });
      return res.status(upstream.status).json({
        ok: upstream.ok,
        action,
        status: upstream.status,
        data: upstream.data
      });
    }

    if (action === "products.list") {
      const limit = clamp(Number(req.body?.limit || 10), 1, 250);
      const upstream = await shopifyRequest({
        method: "GET",
        path: "/products.json",
        queryParams: {
          limit,
          fields: Array.isArray(req.body?.fields) ? req.body.fields.join(",") : req.body?.fields,
          since_id: req.body?.since_id,
          ids: Array.isArray(req.body?.ids) ? req.body.ids.join(",") : req.body?.ids,
          status: req.body?.status,
          vendor: req.body?.vendor,
          product_type: req.body?.product_type,
          published_status: req.body?.published_status
        }
      });

      return res.status(upstream.status).json({
        ok: upstream.ok,
        action,
        status: upstream.status,
        data: upstream.data
      });
    }

    if (action === "orders.list") {
      const limit = clamp(Number(req.body?.limit || 10), 1, 250);
      const upstream = await shopifyRequest({
        method: "GET",
        path: "/orders.json",
        queryParams: {
          limit,
          status: req.body?.status || "any",
          financial_status: req.body?.financial_status,
          fulfillment_status: req.body?.fulfillment_status,
          created_at_min: req.body?.created_at_min,
          created_at_max: req.body?.created_at_max,
          updated_at_min: req.body?.updated_at_min,
          updated_at_max: req.body?.updated_at_max,
          fields: Array.isArray(req.body?.fields) ? req.body.fields.join(",") : req.body?.fields
        }
      });

      return res.status(upstream.status).json({
        ok: upstream.ok,
        action,
        status: upstream.status,
        data: upstream.data
      });
    }

    if (action === "graphql") {
      if (typeof req.body?.query !== "string" || !req.body.query.trim()) {
        return res.status(400).json({ ok: false, error: "Missing GraphQL query" });
      }

      const upstream = await shopifyRequest({
        method: "POST",
        path: "/graphql.json",
        body: {
          query: req.body.query,
          variables: isPlainObject(req.body?.variables) ? req.body.variables : {}
        }
      });

      return res.status(upstream.status).json({
        ok: upstream.ok,
        action,
        status: upstream.status,
        data: upstream.data
      });
    }

    if (action === "rest") {
      const method = String(req.body?.method || "GET").toUpperCase();
      const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

      if (!allowedMethods.has(method)) {
        return res.status(400).json({ ok: false, error: `Unsupported method: ${method}` });
      }

      const upstream = await shopifyRequest({
        method,
        path: String(req.body?.path || "/shop.json"),
        queryParams: isPlainObject(req.body?.queryParams) ? req.body.queryParams : {},
        body: req.body?.body
      });

      return res.status(upstream.status).json({
        ok: upstream.ok,
        action,
        status: upstream.status,
        data: upstream.data
      });
    }

    return res.status(400).json({ ok: false, error: `Unsupported action: ${action}` });
  } catch (error) {
    return next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found", path: req.originalUrl });
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.statusCode || error?.status || 500);
  console.error(`[${new Date().toISOString()}] ERROR`, error);
  res.status(status).json({
    ok: false,
    error: error?.message || "Internal Server Error"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "startup",
      port: PORT,
      shopifyStoreDomainPresent: Boolean(SHOP),
      shopifyAccessTokenPresent: Boolean(TOKEN),
      apiVersion: API_VERSION,
      bridgeApiKeyEnabled: Boolean(BRIDGE_API_KEY)
    })
  );

  if (TOKEN.startsWith("shpss")) {
    console.warn(
      "SHOPIFY_ACCESS_TOKEN starts with shpss; use an Admin API access token for Admin API calls."
    );
  }
});
