import { createHmac, timingSafeEqual } from "node:crypto";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (value, status = 200, extra = {}) =>
  new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });

function equalText(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

function validSession(request) {
  const secret = String(Netlify.env.get("IFC_SESSION_SECRET") || "");
  const token = (request.headers.get("cookie") || "").split(/;\s*/).find(v => v.startsWith("ifc_admin_session="))?.slice("ifc_admin_session=".length);
  if (!secret || !token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(expiresText).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export default async (request) => {
  if (request.method === "GET") return json({ ok: true, owner: validSession(request) });
  if (request.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ok:false,error:'Origem não autorizada.'},403);

  let body = {};
  try { body = await request.json(); } catch {}
  if (body.action === "logout") {
    return json({ ok: true }, 200, { "Set-Cookie": "ifc_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  }
  const password = String(Netlify.env.get("IFC_ADMIN_PASSWORD") || "");
  if (body.action !== "login" || !password || !Netlify.env.get("IFC_SESSION_SECRET") || !equalText(body.username, Netlify.env.get("IFC_ADMIN_USERNAME")) || !equalText(body.password, password)) {
    return json({ ok: false, error: "Senha inválida." }, 401);
  }
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const signature = createHmac("sha256", String(Netlify.env.get("IFC_SESSION_SECRET"))).update(String(expires)).digest("hex");
  return json({ ok: true, owner: true }, 200, {
    "Set-Cookie": `ifc_admin_session=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`,
  });
};

export const config = { path: "/api/auth" };
