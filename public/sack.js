const $ = id => document.getElementById(id);
async function api(url, options={}) {
  const r = await fetch(url, {credentials:"same-origin", headers:{"content-type":"application/json",...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Error de servidor");
  return data;
}
async function refresh() {
  const orders = await api("/sack/orders");
  const host = $("orders"); host.replaceChildren();
  const pending = orders.filter(o=>o.status==="paid");
  if (!pending.length) { const d=document.createElement("div");d.className="empty";d.textContent="No hay pedidos pendientes de entrega.";host.appendChild(d); }
  orders.forEach(o => {
    const card=document.createElement("article");card.className="order";
    const h=document.createElement("h3");h.textContent=`${o.product_name} · S/ ${o.amount.toFixed(2)}`;card.appendChild(h);
    [[ "Estado", o.status==="paid"?"Pendiente de entrega":"Entregado" ],["Juego",o.game],["ID jugador",o.player_id],["Nickname",o.nickname],["Pedido",o.id]].forEach(([k,v])=>{
      const p=document.createElement("p");p.textContent=`${k}: ${v}`;card.appendChild(p);
    });
    if(o.status==="paid"){
      const b=document.createElement("button");b.textContent="Pedido Entregado ✓";
      b.addEventListener("click",async()=>{if(!confirm("¿Confirmas que ya entregaste el producto al ID indicado?"))return;b.disabled=true;try{await api(`/sack/orders/${o.id}/deliver`,{method:"POST",body:"{}"});await refresh()}catch(e){alert(e.message);b.disabled=false}});
      card.appendChild(b);
    }
    host.appendChild(card);
  });
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/sack/login",{method:"POST",body:JSON.stringify({username:f.get("username"),password:f.get("password")})});$("login").classList.add("hidden");$("dashboard").classList.remove("hidden");await refresh()}catch(err){$("loginError").textContent=err.message}});
$("logout").addEventListener("click",async()=>{await api("/sack/logout",{method:"POST",body:"{}"});location.reload()});
(async()=>{try{await refresh();$("login").classList.add("hidden");$("dashboard").classList.remove("hidden")}catch{}})();
