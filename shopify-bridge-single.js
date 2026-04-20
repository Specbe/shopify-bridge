import express from "express";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).json({ ok: true, route: "/" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, route: "/health" });
});

app.post("/command", (req, res) => {
  res.status(200).json({ ok: true, route: "/command", body: req.body ?? null });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MINIMAL SERVER LIVE ON ${PORT}`);
});
