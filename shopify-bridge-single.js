import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_API_VERSION,
  SHOPIFY_ACCESS_TOKEN,
  BRIDGE_API_KEY
} = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error("❌ Missing required env variables");
  process.exit(1);
}

const SHOPIFY_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(SHOPIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await res.json();

  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }

  return json.data;
}

app.post("/command", async (req, res) => {
  try {
    const key = req.headers["x-bridge-api-key"];
    if (key !== BRIDGE_API_KEY) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { command } = req.body;

    if (command === "health-shopify") {
      const data = await shopifyGraphQL(`{
        shop { name }
      }`);

      return res.json({ ok: true, shop: data.shop });
    }

    if (command.startsWith("set-price-auto")) {
      const [, productId, price] = command.split(" ");

      const data = await shopifyGraphQL(`
        query ($id: ID!) {
          product(id: $id) {
            variants(first: 1) {
              nodes { id }
            }
          }
        }
      `, { id: productId });

      const variantId = data.product.variants.nodes[0].id;

      await shopifyGraphQL(`
        mutation ($id: ID!, $price: Money!) {
          productVariantUpdate(input: {
            id: $id,
            price: $price
          }) {
            productVariant { id }
            userErrors { message }
          }
        }
      `, { id: variantId, price });

      return res.json({ ok: true, variantId, price });
    }

    return res.json({ ok: false, error: "Unknown command" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(3000, () => console.log("🚀 Bridge running"));
