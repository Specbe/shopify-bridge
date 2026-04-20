import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/health", (req, res) => {
  res.json({ status: "alive" });
});

app.post("/command", async (req, res) => {
  try {
    const { action, payload } = req.body;

    if (!action) {
      return res.status(400).json({ error: "Missing action" });
    }

    // HEALTH CHECK
    if (action === "health-shopify") {
      return res.json({ status: "ok" });
    }

    // CREATE PRODUCT
    if (action === "create_product") {
      const response = await fetch(
        `https://${SHOP}/admin/api/${API_VERSION}/products.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product: payload }),
        }
      );

      const data = await response.json();
      return res.json(data);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
