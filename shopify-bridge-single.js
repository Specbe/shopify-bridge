import express from "express";
import fetch from "node-fetch";

console.log("Bridge starting...");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  console.log("Incoming:", req.method, req.url);
  next();
});

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;
const PORT = process.env.PORT || 3000;

function authOk(req) {
  if (!BRIDGE_API_KEY) return true;
  return req.headers["x-bridge-api-key"] === BRIDGE_API_KEY;
}

async function shopifyRest(path, options = {}) {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}${path}`, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { status: response.status, data };
}

app.get("/", (req, res) => {
  return res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  return res.status(200).json({ status: "alive" });
});

app.post("/command", async (req, res) => {
  try {
    if (!authOk(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (!SHOP) {
      return res.status(500).json({ ok: false, error: "Missing SHOPIFY_STORE_DOMAIN" });
    }

    if (!TOKEN) {
      return res.status(500).json({ ok: false, error: "Missing SHOPIFY_ACCESS_TOKEN" });
    }

    const body = req.body || {};
    const action = body.action;
    const payload = body.payload || {};
    const command = typeof body.command === "string" ? body.command.trim() : "";

    // ACTION MODE
    if (action === "health-shopify") {
      return res.status(200).json({
        ok: true,
        status: "ok",
        shop: SHOP,
        api_version: API_VERSION
      });
    }

    if (action === "get_products") {
      const result = await shopifyRest(`/products.json`, { method: "GET" });
      return res.status(result.status).json({ ok: result.status < 400, ...result.data });
    }

    if (action === "create_product") {
      const result = await shopifyRest(`/products.json`, {
        method: "POST",
        body: JSON.stringify({ product: payload })
      });
      return res.status(result.status).json({ ok: result.status < 400, ...result.data });
    }

    // LEGACY COMMAND MODE
    if (command === "health-shopify") {
      return res.status(200).json({
        ok: true,
        status: "ok",
        shop: SHOP,
        api_version: API_VERSION
      });
    }

    if (command === "get_products") {
      const result = await shopifyRest(`/products.json`, { method: "GET" });
      return res.status(result.status).json({ ok: result.status < 400, ...result.data });
    }

    if (command.startsWith("create_product ")) {
      let parsed;
      try {
        parsed = JSON.parse(command.replace(/^create_product\s+/, ""));
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid create_product JSON" });
      }

      const result = await shopifyRest(`/products.json`, {
        method: "POST",
        body: JSON.stringify({ product: parsed })
      });
      return res.status(result.status).json({ ok: result.status < 400, ...result.data });
    }

    return res.status(400).json({
      ok: false,
      error: "Unknown action/command"
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      ok: false,
      error: "Server error",
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
