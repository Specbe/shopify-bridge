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

function fail(message, extra = {}, status = 400) {
  return { ok: false, error: message, ...extra, status };
}

function ok(data) {
  return { ok: true, ...data };
}

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

app.post("/command", async (req, res) => {
  try {
    const apiKey = req.headers["x-bridge-api-key"];
    if (apiKey !== BRIDGE_API_KEY) {
      return res.status(401).json(fail("Unauthorized"));
    }

    const { command } = req.body;
    const parts = command.split(" ");

    // =========================
    // HEALTH
    // =========================
    if (command === "health-shopify") {
      const data = await shopifyGraphQL(`{ shop { name } }`);
      return res.json(ok({ shop: data.shop }));
    }

    // =========================
    // PRODUCTS
    // =========================
    if (parts[0] === "products") {
      const first = parts[1] || 5;
      const data = await shopifyGraphQL(`
        {
          products(first: ${first}) {
            edges {
              node {
                id
                title
                variants(first:1){
                  edges{
                    node{
                      id
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `);

      return res.json(ok({ products: data.products.edges }));
    }

    // =========================
    // SET PRICE (DIRECT VARIANT)
    // =========================
    if (parts[0] === "set-price") {
      const variantId = parts[1];
      const price = parts[2];

      const data = await shopifyGraphQL(
        `
        mutation ($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          input: {
            id: variantId,
            price: price
          }
        }
      );

      return res.json(ok(data.productVariantUpdate));
    }

    // =========================
    // SET PRICE AUTO (PRODUCT)
    // =========================
    if (parts[0] === "set-price-auto") {
      const productId = parts[1];
      const price = parts[2];

      const data = await shopifyGraphQL(
        `
        {
          product(id: "${productId}") {
            variants(first:1){
              edges{
                node{
                  id
                }
              }
            }
          }
        }
      `
      );

      const variantId =
        data.product.variants.edges[0].node.id;

      const update = await shopifyGraphQL(
        `
        mutation ($input: ProductVariantInput!) {
          productVariantUpdate(input: $input) {
            productVariant {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          input: {
            id: variantId,
            price: price
          }
        }
      );

      return res.json(ok(update.productVariantUpdate));
    }

    return res.json(fail("Unknown command"));
  } catch (err) {
    return res.status(500).json(fail(err.message));
  }
});

app.listen(3000, () => {
  console.log("Bridge running");
});
