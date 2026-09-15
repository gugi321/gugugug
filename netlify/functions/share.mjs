import { getStore } from "@netlify/blobs";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getUser } from "@netlify/identity";

const STORE_NAME = "ifc-shared-models";
const MAX_MODEL_BYTES = 250 * 1024 * 1024;
const MAX_PART_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_MODEL_BYTES / MAX_PART_BYTES);
const SHARE_ID = /^[a-f0-9]{32}$/;
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: jsonHeaders });

const fail = (message, status = 400) => json({ ok: false, error: message }, status);

function validId(value) {
  return typeof value === "string" && SHARE_ID.test(value);
}

function cleanName(value) {
  const name = String(value || "modelo.ifc")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  return (name || "modelo.ifc").slice(0, 180);
}

function partKey(id, part) {
  return `shares/${id}/parts/${part}`;
}

function manifestKey(id) {
  return `shares/${id}/manifest`;
}

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function currentOwner(request) {
  const secret = String(Netlify.env.get("IFC_SESSION_SECRET") || "");
  const token = (request.headers.get("cookie") || "").split(/;\s*/).find(v => v.startsWith("ifc_admin_session="))?.slice("ifc_admin_session=".length);
  if (!secret || !token) return false;
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || !/^[a-f0-9]{64}$/.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(expiresText).digest("hex");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function requireOwner(request) {
  return currentOwner(request) ? null : fail("Apenas o proprietário pode carregar arquivos ou criar compartilhamentos.", 403);
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

const normalizedEmail = value => String(value || "").trim().toLowerCase();
const grantKey = (id, email) => `access/${id}/${createHash('sha256').update(email).digest('hex')}`;
async function viewerAllowed(request, files, id, url) {
  if (currentOwner(request)) return true;
  let user; try { user = await getUser(); } catch { return false; }
  if (!user?.emailVerified || !user.email) return false;
  const project = url.searchParams.get('project') || id;
  if (!validId(project)) return false;
  const grant = await files.get(grantKey(project, normalizedEmail(user.email)), {type:'json'});
  if (!grant?.active) return false;
  if (project === id) return true;
  const manifest = await getManifest(files, project);
  return Array.isArray(manifest?.state?.pdfs) && manifest.state.pdfs.some(pdf => pdf.id === id);
}

async function getManifest(files, id) {
  const manifest = await files.get(manifestKey(id), { type: "json" });
  if (!manifest || manifest.version !== 1) return null;
  return manifest;
}

function requestId(request, context) {
  const url = new URL(request.url);
  const pathId = context.params?.id || url.pathname.match(/\/api\/share\/([a-f0-9]{32})$/)?.[1];
  return pathId || url.searchParams.get("id");
}

export default async (request, context) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders });
  const url = new URL(request.url);

  if (request.method === "GET" && url.searchParams.get("action") === "owner-check") {
    const denied = requireOwner(request);
    if (denied) return denied;
    return json({ ok: true, owner: true });
  }

  const id = requestId(request, context);
  if (!validId(id)) return fail("Link de compartilhamento inválido.", 400);

  if (request.method === "POST") {
    if (!sameOrigin(request)) return fail("Origem da solicitação não autorizada.", 403);
    const denied = requireOwner(request);
    if (denied) return denied;
  }

  const files = store();

  if (url.searchParams.get('action') === 'access') {
    const denied = requireOwner(request); if (denied) return denied;
    if (!await getManifest(files, id)) return fail('Projeto não encontrado.',404);
    if (request.method === 'GET') {
      const {blobs} = await files.list({prefix:`access/${id}/`});
      const entries = await Promise.all(blobs.map(blob => files.get(blob.key,{type:'json'})));
      return json({ok:true,people:entries.filter(entry => entry?.active).map(entry => ({email:entry.email}))});
    }
    if (request.method !== 'POST') return fail('Método não permitido.',405);
    let payload; try { payload = await request.json(); } catch { return fail('Dados inválidos.'); }
    const email = normalizedEmail(payload.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('E-mail inválido.');
    if (!['grant','revoke'].includes(payload.action)) return fail('Ação inválida.');
    await files.setJSON(grantKey(id,email),{email,active:payload.action==='grant',updatedAt:new Date().toISOString()});
    return json({ok:true});
  }

  if (request.method === "GET") {
    if (!await viewerAllowed(request,files,id,url)) return fail('Entre com um e-mail confirmado e autorizado para este projeto.',403);
    const manifest = await getManifest(files, id);
    if (!manifest) return fail("Modelo compartilhado não encontrado.", 404);
    const partParam = url.searchParams.get("part");
    if (partParam === null) {
      return json({
        ok: true,
        id: manifest.id,
        name: manifest.name,
        size: manifest.size,
        total: manifest.total,
        state: manifest.state || null,
        createdAt: manifest.createdAt,
      });
    }
    const part = Number(partParam);
    if (!Number.isInteger(part) || part < 0 || part >= manifest.total) return fail("Parte do modelo inválida.", 400);
    const data = await files.get(partKey(id, part), { type: "arrayBuffer" });
    if (!data) return fail("Parte do modelo ainda não está disponível.", 404);
    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (request.method !== "POST") return fail("Método não permitido.", 405);

  const action = request.headers.get("x-share-action") || "";
  if (action === "upload") {
    const part = Number(request.headers.get("x-share-part"));
    const total = Number(request.headers.get("x-share-total"));
    if (!Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_PARTS || part < 0 || part >= total) {
      return fail("Parte do modelo inválida.", 400);
    }
    if (await getManifest(files, id)) return fail("Este link já foi finalizado.", 409);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > MAX_PART_BYTES) return fail("Tamanho de parte inválido.", 413);
    await files.set(partKey(id, part), data, {
      metadata: {
        contentType: "application/octet-stream",
        bytes: String(data.byteLength),
        total: String(total),
      },
    });
    return json({ ok: true, part, total });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return fail("Dados de compartilhamento inválidos.", 400);
  }
  if (payload?.action !== "finalize") return fail("Ação de compartilhamento inválida.", 400);

  const total = Number(payload.total);
  const size = Number(payload.size);
  if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS || !Number.isSafeInteger(size) || size < 1 || size > MAX_MODEL_BYTES) {
    return fail("Tamanho do modelo fora do limite de 250 MB.", 413);
  }
  if (Math.ceil(size / MAX_PART_BYTES) !== total) return fail("Quantidade de partes incompatível com o modelo.", 400);
  const existing = await getManifest(files, id);
  if (existing) return json({ ok: true, id, name: existing.name, createdAt: existing.createdAt, shareUrl: `${url.origin}/?share=${id}` });

  const metadata = await Promise.all(Array.from({ length: total }, (_, part) => files.getMetadata(partKey(id, part))));
  if (metadata.some((entry) => !entry)) return fail("O envio do modelo não foi concluído. Tente novamente.", 409);
  const storedBytes = metadata.reduce((sum, entry) => sum + Number(entry.metadata?.bytes || 0), 0);
  if (storedBytes !== size) return fail("O tamanho enviado não confere com o modelo.", 409);

  const state = payload.state && typeof payload.state === "object" ? payload.state : null;
  const stateText = JSON.stringify(state || {});
  if (stateText.length > 100_000) return fail("Estado da visualização excede o limite.", 413);
  const manifest = {
    version: 1,
    id,
    name: cleanName(payload.name),
    size,
    total,
    state,
    createdAt: new Date().toISOString(),
  };
  await files.setJSON(manifestKey(id), manifest);
  return json({ ok: true, id, name: manifest.name, createdAt: manifest.createdAt, shareUrl: `${url.origin}/?share=${id}` });
};

export const config = {
  path: ["/api/share", "/api/share/:id"],
};
