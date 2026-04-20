const http = require("http");
const { URL, URLSearchParams } = require("url");

const PORT = Number(process.env.PORT || 8787);
const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-04";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.TOKEN_REFRESH_BUFFER_MS || 300000);

let cachedToken = null;
let tokenExpiresAt = 0;

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function requireEnv() {
  const missing = [];
  for (const [key, value] of Object.entries({
    SHOPIFY_STORE_DOMAIN: STORE_DOMAIN,
    SHOPIFY_CLIENT_ID: CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: CLIENT_SECRET,
    BRIDGE_API_KEY
  })) {
    if (!value) missing.push(key);
  }
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
}

async function mintAccessToken() {
  requireEnv();

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  });

  const resp = await fetch(`https://${STORE_DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || !data.access_token) {
    throw new Error(`Token request failed: ${resp.status} ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + ((data.expires_in || 86399) * 1000);
  return cachedToken;
}

async function shopifyGraphQL(query, variables = {}) {
  const token = await mintAccessToken();

  const resp = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(`Shopify GraphQL HTTP error: ${resp.status} ${JSON.stringify(data)}`);
  }
  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

function productGid(id) {
  if (String(id).startsWith("gid://")) return String(id);
  return `gid://shopify/Product/${id}`;
}

function variantGid(id) {
  if (String(id).startsWith("gid://")) return String(id);
  return `gid://shopify/ProductVariant/${id}`;
}

async function handleCommand(raw) {
  const command = String(raw || "").trim();
  if (!command) throw new Error("Missing command");

  if (command === "health-shopify") {
    const data = await shopifyGraphQL(`
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `);
    return { ok: true, command, shop: data.shop };
  }

  if (command.startsWith("get-product ")) {
    const id = command.replace(/^get-product\s+/, "").trim();
    const data = await shopifyGraphQL(`
      query GetProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          status
          vendor
          tags
          descriptionHtml
          variants(first: 10) {
            nodes {
              id
              title
              price
              inventoryQuantity
            }
          }
        }
      }
    `, { id: productGid(id) });

    return { ok: true, command, product: data.product };
  }

  if (command.startsWith("set-title ")) {
    const rest = command.replace(/^set-title\s+/, "");
    const firstSpace = rest.indexOf(" ");
    if (firstSpace === -1) throw new Error("Use: set-title PRODUCT_ID New Title");
    const id = rest.slice(0, firstSpace).trim();
    const title = rest.slice(firstSpace + 1).trim();

    const data = await shopifyGraphQL(`
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            handle
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: {
        id: productGid(id),
        title
      }
    });

    return { ok: true, command, result: data.productUpdate };
  }

  if (command.startsWith("set-tags ")) {
    const rest = command.replace(/^set-tags\s+/, "");
    const firstSpace = rest.indexOf(" ");
    if (firstSpace === -1) throw new Error("Use: set-tags PRODUCT_ID tag1, tag2");
    const id = rest.slice(0, firstSpace).trim();
    const tagsRaw = rest.slice(firstSpace + 1).trim();
    const tags = tagsRaw.split(",").map(s => s.trim()).filter(Boolean);

    const data = await shopifyGraphQL(`
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: {
        id: productGid(id),
        tags
      }
    });

    return { ok: true, command, result: data.productUpdate };
  }

  if (command.startsWith("set-price ")) {
    const rest = command.replace(/^set-price\s+/, "").trim();
    const parts = rest.split(/\s+/);
    if (parts.length < 2) throw new Error("Use: set-price VARIANT_ID PRICE");
    const variantId = parts[0];
    const price = parts[1];

    const data = await shopifyGraphQL(`
      mutation UpdateVariant($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            title
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      input: {
        id: variantGid(variantId),
        price
      }
    });

    return { ok: true, command, result: data.productVariantUpdate };
  }

  if (command.startsWith("products")) {
    const parts = command.split(/\s+/);
    const limit = Math.max(1, Math.min(50, Number(parts[1] || 10)));

    const data = await shopifyGraphQL(`
      query Products($first: Int!) {
        products(first: $first, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            title
            handle
            status
            totalInventory
            variants(first: 5) {
              nodes {
                id
                title
                price
              }
            }
          }
        }
      }
    `, { first: limit });

    return { ok: true, command, products: data.products.nodes };
  }

  throw new Error("Unknown command");
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && parsedUrl.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "shopify-bridge-single",
        port: PORT,
        store: STORE_DOMAIN || null,
        apiVersion: API_VERSION
      });
    }

    if (req.method === "POST" && parsedUrl.pathname === "/command") {
      const apiKey = req.headers["x-bridge-api-key"];
      if (!apiKey || apiKey !== BRIDGE_API_KEY) {
        return json(res, 401, { ok: false, error: "Unauthorized" });
      }

      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const result = await handleCommand(body.command);
      return json(res, 200, result);
    }

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Shopify bridge listening on http://localhost:${PORT}`);
});
