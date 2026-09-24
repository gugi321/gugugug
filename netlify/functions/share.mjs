import { getStore } from "@netlify/blobs";

const STORE_NAME = "ifc-shared-models";
const MAX_MODEL_BYTES = 1024 * 1024 * 1024;
const MAX_PART_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_MODEL_BYTES / MAX_PART_BYTES);
const SHARE_ID = /^[a-f0-9]{32}$/;
const PROJECT_SCOPE = /^[a-f0-9]{64}$/;
const MAX_PDFS = 40;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: jsonHeaders });
const fail = (message, status = 400, detail = null) => json({ ok: false, error: message, ...(detail ? { detail } : {}) }, status);
const cleanPermission = () => "view";
const validId = (value) => typeof value === "string" && SHARE_ID.test(value);
const trustedWrite = (request, url) => { const origin = request.headers.get("origin"); return !origin || origin === url.origin; };
const files = () => getStore(STORE_NAME, { consistency: "strong" });
const partKey = (id, part) => `shares/${id}/parts/${part}`;
const manifestKey = (id) => `shares/${id}/manifest`;
const pdfCatalogKey = (scope) => `projects/${scope}/pdf-catalog`;

function cleanName(value) {
  const name = String(value || "modelo.ifc")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  return (name || "modelo.ifc").slice(0, 180);
}


function cleanPdfCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_PDFS).flatMap((item) => {
    if (!item || !validId(item.id) || typeof item.name !== "string") return [];
    const size = Number(item.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PDF_BYTES) return [];
    const elements = Array.isArray(item.elements)
      ? item.elements.filter(Number.isSafeInteger).slice(0, 1000)
      : [];
    return [{
      id: item.id,
      name: cleanName(item.name),
      size,
      floor: String(item.floor || "").slice(0, 120),
      elements,
    }];
  });
}

async function getManifest(store, id) {
  const manifest = await store.get(manifestKey(id), { type: "json" });
  return manifest && [2, 3].includes(manifest.version) ? manifest : null;
}

export default async (request) => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.searchParams.get("health") === "1") {
    try {
      const store = files();
      const probe = `__share_health_probe__/${crypto.randomUUID()}`;
      await store.set(probe, "ok");
      const value = await store.get(probe, { type: "text" });
      await store.delete(probe);
      if (value !== "ok") throw new Error("Falha ao confirmar escrita no armazenamento.");
      return json({ ok: true, service: "share", storage: "netlify-blobs", writable: true, chunkBytes: MAX_PART_BYTES });
    } catch (error) {
      console.error("share health", error);
      return fail("O armazenamento do compartilhamento não está disponível.", 503, String(error?.message || error));
    }
  }

  if (request.method === "POST" && !trustedWrite(request, url)) return fail("Origem não autorizada.", 403);

  const catalogScope = url.searchParams.get("catalog");
  if (catalogScope !== null) {
    if (!PROJECT_SCOPE.test(catalogScope)) return fail("Projeto inválido.", 400);
    let store;
    try { store = files(); }
    catch (error) {
      console.error("pdf catalog store", error);
      return fail("Não foi possível iniciar o armazenamento da lista de PDFs.", 503, String(error?.message || error));
    }
    try {
      if (request.method === "GET") {
        const catalog = await store.get(pdfCatalogKey(catalogScope), { type: "json" });
        return json({ ok: true, pdfs: cleanPdfCatalog(catalog?.pdfs), updatedAt: catalog?.updatedAt || null });
      }
      if (request.method === "POST") {
        let payload;
        try { payload = await request.json(); }
        catch { return fail("Lista de PDFs inválida.", 400); }
        const pdfs = cleanPdfCatalog(payload?.pdfs);
        const catalog = { version: 1, scope: catalogScope, pdfs, updatedAt: new Date().toISOString() };
        await store.setJSON(pdfCatalogKey(catalogScope), catalog);
        return json({ ok: true, count: pdfs.length, updatedAt: catalog.updatedAt });
      }
      return fail("Método não permitido.", 405);
    } catch (error) {
      console.error("pdf catalog", error);
      return fail("Falha ao salvar ou carregar a lista de PDFs.", 500, String(error?.message || error));
    }
  }

  const id = url.searchParams.get("id");
  if (!validId(id)) return fail("Link de compartilhamento inválido.", 400);

  let store;
  try { store = files(); }
  catch (error) {
    console.error("share store", error);
    return fail("Não foi possível iniciar o armazenamento do compartilhamento.", 503, String(error?.message || error));
  }

  try {
    if (request.method === "GET") {
      const manifest = await getManifest(store, id);
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
          permission: cleanPermission(manifest.permission),
          createdAt: manifest.createdAt,
        });
      }
      const part = Number(partParam);
      if (!Number.isInteger(part) || part < 0 || part >= manifest.total) return fail("Parte do modelo inválida.", 400);
      const data = await store.get(partKey(id, part), { type: "arrayBuffer" });
      if (!data) return fail("Parte do modelo ainda não está disponível.", 404);
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(data.byteLength),
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (request.method !== "POST") return fail("Método não permitido.", 405);

    if (request.headers.get("x-share-action") === "upload") {
      const part = Number(request.headers.get("x-share-part"));
      const total = Number(request.headers.get("x-share-total"));
      if (!Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_PARTS || part < 0 || part >= total) {
        return fail("Parte do modelo inválida.", 400);
      }
      if (await getManifest(store, id)) return fail("Este link já foi finalizado.", 409);
      const data = await request.arrayBuffer();
      if (!data.byteLength || data.byteLength > MAX_PART_BYTES) return fail("Tamanho de parte inválido.", 413);
      await store.set(partKey(id, part), data, { metadata: { bytes: String(data.byteLength), total: String(total) } });
      return json({ ok: true, part, total, bytes: data.byteLength });
    }

    let payload;
    try { payload = await request.json(); }
    catch { return fail("Dados de compartilhamento inválidos.", 400); }
    if (payload?.action !== "finalize") return fail("Ação de compartilhamento inválida.", 400);

    const total = Number(payload.total);
    const size = Number(payload.size);
    if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS || !Number.isSafeInteger(size) || size < 1 || size > MAX_MODEL_BYTES) {
      return fail("Tamanho do modelo fora do limite de 1 GB.", 413);
    }
    if (Math.ceil(size / MAX_PART_BYTES) !== total) return fail("Quantidade de partes incompatível com o modelo.", 400);

    const existing = await getManifest(store, id);
    if (existing) return json({ ok: true, id, shareUrl: `${url.origin}/?share=${id}`, permission: cleanPermission(existing.permission) });

    const metadata = [];
    // Valida em lotes para suportar modelos grandes sem fazer centenas de leituras sequenciais.
    for (let offset = 0; offset < total; offset += 24) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(24, total - offset) }, (_, i) =>
          store.getMetadata(partKey(id, offset + i))
        )
      );
      metadata.push(...batch);
    }
    if (metadata.some((entry) => !entry)) return fail("O envio do modelo não foi concluído. Tente novamente.", 409);
    const storedBytes = metadata.reduce((sum, entry) => sum + Number(entry.metadata?.bytes || 0), 0);
    if (storedBytes !== size) return fail("O tamanho enviado não confere com o modelo.", 409);

    const state = payload.state && typeof payload.state === "object" ? payload.state : null;
    const stateText = JSON.stringify(state || {});
    if (stateText.length > 100_000) return fail("Estado da visualização excede o limite.", 413);

    const manifest = {
      version: 3,
      id,
      name: cleanName(payload.name),
      size,
      total,
      state,
      permission: cleanPermission(payload.permission),
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(manifestKey(id), manifest);
    return json({ ok: true, id, name: manifest.name, permission: manifest.permission, createdAt: manifest.createdAt, shareUrl: `${url.origin}/?share=${id}` });
  } catch (error) {
    console.error("share request", error);
    return fail("Falha no armazenamento do compartilhamento.", 500, String(error?.message || error));
  }
};

export const config = { path: "/api/share" };
