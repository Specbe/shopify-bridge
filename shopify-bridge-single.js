import express from "express";
import fetch from "node-fetch";

const app = express();

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "shopify-bridge",
    status: "running"
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy"
  });
});

app.post("/command", async (req, res) => {
  try {
    const action = req.body?.action || req.body?.command;

    if (!action) {
      return res.status(400).json({
        ok: false,
        error: "Missing action or command in request body"
      });
    }

    if (action === "health-shopify" || action === "health") {
      if (!SHOP || !TOKEN) {
        return res.status(500).json({
          ok: false,
          error: "Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN"
        });
      }

      const url = `https://${SHOP}/admin/api/${API_VERSION}/shop.json`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": TOKEN,
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      const text = await response.text();

      return res.status(response.status).type("application/json").send(text);
    }

    return res.status(400).json({
      ok: false,
      error: `Unsupported action: ${action}`
    });
  } catch (error) {
    console.error("POST /command error:", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
    path: req.originalUrl
  });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled application error:", error);
  return res.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : "Internal server error"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
