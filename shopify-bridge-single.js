import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  return res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  return res.status(200).json({ status: "alive" });
});

app.post("/command", async (req, res) => {
  try {
    const { action, payload } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: "Missing action" });
    }

    if (!SHOP) {
      return res.status(500).json({ error: "Missing SHOPIFY_STORE_DOMAIN" });
    }

    if (!TOKEN) {
      return res.status(500).json({ error: "Missing SHOPIFY_ACCESS_TOKEN" });
    }

    if (action === "health-shopify") {
      return res.json({
        status: "ok",
        shop: SHOP,
        api_version: API_VERSION
      });
    }

    if (action === "get_products") {
      const response = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/products.json`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json"
          }
        }
      );

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (action === "create_product") {
      const response = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/products.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ product: payload })
        }
      );

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
