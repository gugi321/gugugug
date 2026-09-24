const SOURCE_ORIGIN = "https://eng-gustavogil.netlify.app";
const SHARE_ID = /^[a-f0-9]{32}$/;
const PROJECT_SCOPE = /^[a-f0-9]{64}$/;
const MAX_MODEL_PARTS = 256;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  },
});

export default async (request) => {
  if (request.method !== "GET") return json({ ok: false, error: "Somente leitura." }, 405);
  const url = new URL(request.url);
  const upstream = new URL("/api/share", SOURCE_ORIGIN);
  const id = String(url.searchParams.get("id") || "").toLowerCase();
  const catalog = String(url.searchParams.get("catalog") || "").toLowerCase();

  if (catalog) {
    if (!PROJECT_SCOPE.test(catalog)) return json({ ok: false, error: "Projeto inválido." }, 400);
    upstream.searchParams.set("catalog", catalog);
  } else {
    if (!SHARE_ID.test(id)) return json({ ok: false, error: "Link de projeto inválido." }, 400);
    upstream.searchParams.set("id", id);
    const partRaw = url.searchParams.get("part");
    if (partRaw !== null) {
      const part = Number(partRaw);
      if (!Number.isInteger(part) || part < 0 || part >= MAX_MODEL_PARTS) return json({ ok: false, error: "Parte inválida." }, 400);
      upstream.searchParams.set("part", String(part));
    }
  }

  try {
    const response = await fetch(upstream, {
      method: "GET",
      headers: { "Accept": request.headers.get("accept") || "*/*" },
      redirect: "error",
    });
    const headers = new Headers();
    const type = response.headers.get("content-type");
    const length = response.headers.get("content-length");
    if (type) headers.set("Content-Type", type);
    if (length) headers.set("Content-Length", length);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Cache-Control", url.searchParams.has("part") ? "public, max-age=31536000, immutable" : "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error("public viewer proxy", error);
    return json({ ok: false, error: "Não foi possível carregar o projeto compartilhado." }, 502);
  }
};

export const config = { path: "/api/view" };
