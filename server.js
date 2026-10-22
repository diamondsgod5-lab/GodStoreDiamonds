require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, waitForConnections: true,
  connectionLimit: 10, charset: "utf8mb4"
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false })); // Configure CSP estricta al desplegar.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "gd_sack_session",
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const CATALOG = {
  freefire: [
    { id: "ff110", name: "110 diamantes", price: 2.80 },
    { id: "ff341", name: "341 diamantes", price: 8.00 },
    { id: "ff572", name: "572 diamantes", price: 13.00 },
    { id: "ff1166", name: "1166 diamantes", price: 23.00 },
    { id: "ff2378", name: "2378 diamantes", price: 44.00 },
    { id: "ff6760", name: "6760 diamantes", price: 105.00 }
  ],
  roblox: [
    { id: "rbx-custom", name: "Robux (confirmar disponibilidad)", price: 10.00 }
  ],
  passes: [
    { id: "pass-custom", name: "Pase (confirmar disponibilidad)", price: 10.00 }
  ]
};

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function sackOnly(req, res, next) {
  if (!req.session.sack) return res.status(401).json({ error: "No autorizado" });
  next();
}
function dollarsToCents(amount) { return Math.round(Number(amount) * 100); }

app.get("/api/catalog", (_req, res) => res.json(CATALOG));

app.post("/api/nickname", async (req, res) => {
  const { game, playerId } = req.body || {};
  if (!CATALOG[game] || typeof playerId !== "string" || !/^[a-zA-Z0-9_-]{3,80}$/.test(playerId.trim())) {
    return res.status(400).json({ error: "Selecciona un juego e introduce un ID válido." });
  }
  if (!process.env.NICK_API_URL) {
    return res.status(503).json({ error: "La validación de nickname aún no está configurada. No pagues hasta verificar tu ID." });
  }
  try {
    const r = await fetch(process.env.NICK_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", ...(process.env.NICK_API_KEY ? { authorization: `Bearer ${process.env.NICK_API_KEY}` } : {}) },
      body: JSON.stringify({ game, playerId: playerId.trim() }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error("nickname provider error");
    const data = await r.json();
    const nickname = String(data.nickname || data.nick || "").trim().slice(0, 120);
    if (!nickname) return res.status(404).json({ error: "No se pudo verificar el nickname." });
    res.json({ game, playerId: playerId.trim(), nickname });
  } catch {
    res.status(502).json({ error: "El servicio de validación no respondió. Inténtalo más tarde." });
  }
});

app.post("/api/orders", async (req, res) => {
  const { game, playerId, nickname, productId } = req.body || {};
  const product = (CATALOG[game] || []).find(p => p.id === productId);
  if (!product || typeof playerId !== "string" || !/^[a-zA-Z0-9_-]{3,80}$/.test(playerId) ||
      typeof nickname !== "string" || nickname.trim().length < 1 || nickname.length > 120) {
    return res.status(400).json({ error: "Datos de pedido inválidos." });
  }
  if (!process.env.CULQI_SECRET_KEY || !process.env.CULQI_ORDER_API_URL) {
    return res.status(503).json({ error: "La pasarela de pago aún no está configurada." });
  }

  const id = crypto.randomUUID();
  const amountCents = dollarsToCents(product.price);
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO orders (id,game,player_id,nickname,product_name,amount_cents)
       VALUES (?,?,?,?,?,?)`,
      [id, game, playerId, nickname.trim(), product.name, amountCents]
    );

    // IMPORTANTE: endpoint y campos deben ajustarse al producto de Órdenes de Pago
    // habilitado en tu cuenta Culqi. No se asume que todos los comercios reciban QR.
    const payload = {
      amount: amountCents, currency_code: "PEN",
      description: `God Diamonds - ${product.name}`.slice(0, 80),
      order_number: id,
      metadata: { order_id: id, game, player_id: playerId, nickname: nickname.trim(), product: product.name }
    };
    const r = await fetch(process.env.CULQI_ORDER_API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`, "content-type": "application/json", "x-culqi-product": "online" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12000)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Culqi order creation failed", r.status, data.type || data.code || "unknown");
      return res.status(502).json({ error: "No se pudo crear el pago. No se realizó ningún cobro." });
    }
    await conn.execute("UPDATE orders SET culqi_order_id=? WHERE id=?", [data.id, id]);
    res.status(201).json({
      orderId: id, amount: product.price,
      paymentUrl: data.url || data.qr || null,
      paymentCode: data.payment_code || null,
      expiresAt: data.expiration_date || null,
      message: "Pedido creado. Completa el pago en la experiencia proporcionada por Culqi."
    });
  } catch (e) {
    console.error("Create order error", e.message);
    res.status(500).json({ error: "No se pudo crear el pedido." });
  } finally { conn.release(); }
});

app.get("/api/orders/:id", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "ID inválido" });
  const [rows] = await pool.execute("SELECT id,status,game,product_name,amount_cents,created_at FROM orders WHERE id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json({ ...rows[0], amount: rows[0].amount_cents / 100 });
});

// Culqi: registra en el panel el evento correcto para el producto de pago que uses.
// Valida autenticidad con el mecanismo de firma/seguridad vigente de Culqi antes de producción.
// No se debe confiar en un JSON sin validar ni en una visita del navegador.
app.post("/webhooks/culqi", async (req, res) => {
  const event = req.body || {};
  const eventId = String(event.id || event.event_id || "");
  const eventType = String(event.type || "");
  if (!eventId || !eventType) return res.status(400).send("Invalid event");

  // Si Culqi proporciona un secreto/firma para el endpoint configurado, valida aquí
  // exactamente el mecanismo documentado para tu cuenta. No inventes una firma.
  // Para producción, bloquea el procesamiento hasta completar esa validación.
  if (process.env.NODE_ENV === "production" && !process.env.CULQI_WEBHOOK_SECRET) {
    console.error("Webhook blocked: configure official Culqi webhook validation first");
    return res.status(503).send("Webhook verification not configured");
  }

  const data = event.data || {};
  const metadata = data.metadata || event.metadata || {};
  const orderId = String(metadata.order_id || data.order_number || "");
  const successful = /order\.status\.changed/i.test(eventType)
    ? String(data.state || data.status || "").toLowerCase() === "paid"
    : /charge\.succeeded|charged\.succeeded/i.test(eventType);

  if (!successful || !/^[0-9a-f-]{36}$/i.test(orderId)) return res.sendStatus(200);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await conn.execute("INSERT INTO webhook_events (event_id,event_type) VALUES (?,?)", [eventId, eventType]);
    } catch (e) {
      if (e.code === "ER_DUP_ENTRY") { await conn.rollback(); return res.sendStatus(200); }
      throw e;
    }
    const [rows] = await conn.execute("SELECT * FROM orders WHERE id=? FOR UPDATE", [orderId]);
    if (!rows.length) { await conn.commit(); return res.sendStatus(200); }
    const order = rows[0];
    if (order.status === "pending") {
      // Verifica además en producción el monto, moneda, ID de orden y estado contra
      // la respuesta oficial del evento/recurso de Culqi antes de marcar como pagado.
      await conn.execute("UPDATE orders SET status='paid', payment_reference=? WHERE id=?",
        [String(data.id || eventId), orderId]);
      await conn.commit();
      io.to(`order:${orderId}`).emit("order:paid", { orderId });
      notifySack(order).catch(err => console.error("WhatsApp notification failed", err.message));
    } else {
      await conn.commit();
    }
    res.sendStatus(200);
  } catch (e) {
    await conn.rollback();
    console.error("Webhook processing error", e.message);
    res.sendStatus(500);
  } finally { conn.release(); }
});

async function notifySack(order) {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, SACK_WHATSAPP_TO } = process.env;
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !SACK_WHATSAPP_TO) {
    console.warn("WhatsApp not configured; order remains paid in database");
    return;
  }
  const text = [
    "🚨 ¡NUEVO PEDIDO PAGADO!",
    `• Juego: ${order.game}`,
    `• Producto: ${order.product_name}`,
    `• ID del Jugador: ${order.player_id}`,
    `• Nick/Nombre: ${order.nickname}`,
    `• Monto Pagado: S/. ${(order.amount_cents / 100).toFixed(2)} (Confirmado por Culqi)`
  ].join("\n");
  const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: SACK_WHATSAPP_TO, type: "text", text: { body: text } }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error(`WhatsApp Cloud API HTTP ${r.status}`);
}

io.on("connection", socket => {
  socket.on("order:watch", async (orderId) => {
    if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
    const [rows] = await pool.execute("SELECT status FROM orders WHERE id=?", [orderId]);
    if (!rows.length) return;
    socket.join(`order:${orderId}`);
    socket.emit("order:state", { status: rows[0].status });
  });
});

app.post("/sack/login", rateLimit({ windowMs: 15 * 60_000, limit: 8 }), async (req, res) => {
  const { username, password } = req.body || {};
  if (!process.env.SACK_PANEL_PASSWORD_HASH || username !== (process.env.SACK_PANEL_USER || "sack")) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }
  const ok = await bcrypt.compare(String(password || ""), process.env.SACK_PANEL_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Credenciales incorrectas" });
  req.session.sack = true;
  res.json({ ok: true });
});
app.post("/sack/logout", sackOnly, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/sack/orders", sackOnly, async (_req, res) => {
  const [rows] = await pool.execute(
    "SELECT id,game,player_id,nickname,product_name,amount_cents,status,created_at FROM orders WHERE status IN ('paid','delivered') ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows.map(o => ({ ...o, amount: o.amount_cents / 100 })));
});
app.post("/sack/orders/:id/deliver", sackOnly, async (req, res) => {
  const id = req.params.id;
  const [result] = await pool.execute(
    "UPDATE orders SET status='delivered', delivered_at=NOW() WHERE id=? AND status='paid'", [id]
  );
  if (!result.affectedRows) return res.status(409).json({ error: "El pedido no existe o no está pendiente de entrega." });
  io.to(`order:${id}`).emit("order:delivered", { orderId: id });
  res.json({ ok: true });
});

app.get("/health", (_req, res) => res.json({ ok: true }));
server.listen(PORT, () => console.log(`God Diamonds escuchando en puerto ${PORT}`));
