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
const PORT = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "shopify-bridge",
    status: "running"
  });
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/shopify-test", async (_req, res) => {
  try {
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
        "Content-Type": "application/json"
      }
    });

    const text = await response.text();

    return res.status(response.status).type("application/json").send(text);
  } catch (error) {
    console.error("Shopify test error:", error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
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
  console.error("Unhandled error:", error);
  res.status(500).json({
    ok: false,
    error: error instanceof Error ? error.message : "Internal server error"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
