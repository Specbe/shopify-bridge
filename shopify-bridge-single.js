import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ status: "alive" }));

app.post("/command", async (req, res) => {
  try {
    if (req.headers["x-bridge-api-key"] !== BRIDGE_API_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { action } = req.body || {};

    if (!SHOP) return res.status(500).json({ ok: false, error: "Missing SHOPIFY_STORE_DOMAIN" });
    if (!TOKEN) return res.status(500).json({ ok: false, error: "Missing SHOPIFY_ACCESS_TOKEN" });

    if (action === "health-shopify") {
      return res.status(200).json({
        ok: true,
        status: "ok",
        shop: SHOP,
        api_version: API_VERSION
      });
    }

    return res.status(400).json({ ok: false, error: "Unknown action" });
  } catch (error) {
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
