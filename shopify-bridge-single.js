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

  if (command.startsWith("products")) {
    const parts = command.split(/\s+/);
    const limit = Math.max(1, Math.min(50, Number(parts[1] || 10)));

    const data = await shopifyGraphQL(`
      query Products($first: Int!) {
        products(first: $first) {
          nodes {
            id
            title
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
          }
        }
      }
    `, { first: limit });

    return { ok: true, command, products: data.products.nodes };
  }

  if (command.startsWith("set-title ")) {
    const rest = command.replace(/^set-title\s+/, "");
    const firstSpace = rest.indexOf(" ");
    const id = rest.slice(0, firstSpace).trim();
    const title = rest.slice(firstSpace + 1).trim();

    const data = await shopifyGraphQL(`
      mutation ($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title }
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

  if (command.startsWith("set-price ")) {
    const rest = command.replace(/^set-price\s+/, "").trim();
    const [variantId, price] = rest.split(/\s+/);

    const data = await shopifyGraphQL(`
      mutation ($variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors {
            message
          }
        }
      }
    `, {
      variants: [
        {
          id: variantGid(variantId),
          price: price
        }
      ]
    });

    return { ok: true, command, result: data.productVariantsBulkUpdate };
  }

  throw new Error("Unknown command");
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && parsedUrl.pathname === "/command") {
      if (req.headers["x-bridge-api-key"] !== BRIDGE_API_KEY) {
        return json(res, 401, { ok: false, error: "Unauthorized" });
      }

      const body = JSON.parse(await readBody(req));
      const result = await handleCommand(body.command);
      return json(res, 200, result);
    }

    return json(res, 404, { ok: false });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT);
