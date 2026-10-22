const $ = (id) => document.getElementById(id);
const gameEl = $("game"), productEl = $("product"), playerIdEl = $("playerId");
let catalog = {}, verified = null, currentOrder = null, socket = null;

$("year").textContent = new Date().getFullYear();

async function loadCatalog() {
  const r = await fetch("/api/catalog");
  catalog = await r.json();
  renderProducts();
}
function renderProducts() {
  productEl.innerHTML = "";
  (catalog[gameEl.value] || []).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id; opt.textContent = `${p.name} — S/ ${p.price.toFixed(2)}`;
    productEl.appendChild(opt);
  });
  updatePrice();
}
function updatePrice() {
  const p = (catalog[gameEl.value] || []).find(x => x.id === productEl.value);
  $("price").textContent = p ? `S/ ${p.price.toFixed(2)}` : "—";
}
gameEl.addEventListener("change", () => { verified = null; $("pay").disabled = true; $("nickResult").textContent = "Verifica tu ID antes de continuar."; renderProducts(); });
productEl.addEventListener("change", updatePrice);
playerIdEl.addEventListener("input", () => { verified = null; $("pay").disabled = true; });

$("verify").addEventListener("click", async () => {
  const playerId = playerIdEl.value.trim();
  if (!playerId) return showNotice("Escribe tu ID de jugador primero.");
  $("verify").disabled = true; $("verify").textContent = "Verificando…";
  try {
    const r = await fetch("/api/nickname", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({game:gameEl.value, playerId}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "No se pudo verificar.");
    verified = data;
    showNotice(`✓ Nickname verificado: ${data.nickname}. Revisa que sea tu cuenta.`);
    $("pay").disabled = false;
  } catch(e) { verified = null; $("pay").disabled = true; showNotice(e.message); }
  finally { $("verify").disabled = false; $("verify").textContent = "⌕ Verificar nickname"; }
});
function showNotice(text) { $("nickResult").textContent = text; }

$("pay").addEventListener("click", async () => {
  if (!verified || verified.playerId !== playerIdEl.value.trim() || verified.game !== gameEl.value) {
    return showNotice("Vuelve a verificar tu ID antes de pagar.");
  }
  const productId = productEl.value;
  $("pay").disabled = true; $("pay").textContent = "Preparando pedido…";
  try {
    const r = await fetch("/api/orders", {method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({game:verified.game,playerId:verified.playerId,nickname:verified.nickname,productId})});
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "No se pudo crear el pedido.");
    currentOrder = data.orderId;
    $("shop").classList.add("hidden"); $("statusCard").classList.remove("hidden");
    $("statusTitle").textContent = "Completa tu pago";
    $("statusText").textContent = "Sigue las instrucciones de pago generadas por Culqi. La confirmación llegará automáticamente cuando Culqi notifique el pago.";
    $("statusEyebrow").textContent = "PEDIDO CREADO";
    $("progressBar").style.width = "15%";
    const details = $("paymentDetails");
    details.replaceChildren();
    if (data.paymentUrl) {
      const a = document.createElement("a"); a.href = data.paymentUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "Abrir instrucciones de pago"; a.className = "payment-link"; details.appendChild(a);
    } else {
      details.textContent = "La pasarela no devolvió un enlace visible. Contacta soporte; no realices una transferencia por fuera de la pasarela.";
    }
    if (data.paymentCode) {
      const p = document.createElement("p"); p.textContent = `Código de pago: ${data.paymentCode}`; details.appendChild(p);
    }
    connectOrder(currentOrder);
  } catch(e) { showNotice(e.message); $("pay").disabled = false; }
  finally { $("pay").innerHTML = 'Continuar al pago <span>→</span>'; }
});
function connectOrder(orderId) {
  socket = io();
  socket.emit("order:watch", orderId);
  socket.on("order:state", ({status}) => applyStatus(status));
  socket.on("order:paid", () => applyStatus("paid"));
  socket.on("order:delivered", () => applyStatus("delivered"));
}
function applyStatus(status) {
  if (status === "paid") {
    $("statusEyebrow").textContent = "PAGO CONFIRMADO";
    $("statusTitle").textContent = "¡Pago Procesado con Éxito! 🚀";
    $("statusText").textContent = "Estamos asignando tus artículos a tu ID. Tu pedido está en la cola de procesamiento. Por favor, no cierres esta pantalla. Tiempo estimado: 1 a 3 minutos.";
    $("progressBar").style.width = "68%";
    $("paymentDetails").textContent = "Pago confirmado por el servidor. Estamos esperando la entrega manual.";
  }
  if (status === "delivered") {
    $("loaderRing").style.animation = "none";
    $("statusEyebrow").textContent = "ENTREGA COMPLETADA";
    $("statusTitle").textContent = "¡Felicidades! 🎉";
    $("statusText").textContent = "¡Felicidades! Tus artículos ya llegaron a tu cuenta. ¡Gracias por comprar en God Diamonds!";
    $("progressBar").style.width = "100%";
    $("statusFoot").textContent = "Puedes cerrar esta pantalla.";
    $("paymentDetails").textContent = "";
    if (socket) socket.disconnect();
  }
}
loadCatalog().catch(() => showNotice("No se pudo cargar el catálogo."));
