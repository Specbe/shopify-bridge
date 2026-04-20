import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).send("SHOPIFY BRIDGE OK");
});

app.get("/health", (_req, res) => {
  res.status(200).send("HEALTH OK");
});

app.post("/command", (req, res) => {
  res.status(200).json({
    ok: true,
    route: "/command",
    body: req.body ?? null
  });
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SHOPIFY BRIDGE LIVE ON ${PORT}`);
});
