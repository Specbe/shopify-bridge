import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    route: "/",
    service: "shopify-bridge-minimal"
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    route: "/health"
  });
});

app.post("/command", (req, res) => {
  res.status(200).json({
    ok: true,
    route: "/command",
    body: req.body ?? null
  });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.originalUrl
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Minimal server running on port ${PORT}`);
});
