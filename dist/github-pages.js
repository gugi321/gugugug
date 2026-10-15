const $ = id => document.getElementById(id);

function bootGithubPagesMode() {
  if (!location.hostname.endsWith('github.io') && !new URLSearchParams(location.search).has('static')) return;
  document.body.classList.add('github-pages-mode');

  const share = $('share');
  const createShare = $('createShare');
  if (share) {
    share.hidden = false;
    share.disabled = false;
    share.textContent = '↗ Exportar';
    share.onclick = () => {
      $('shareDialog')?.showModal();
      if (createShare) createShare.hidden = true;
      if ($('shareProgress')) $('shareProgress').hidden = true;
      if ($('shareLinkRow')) $('shareLinkRow').hidden = true;
      if ($('shareStatus')) $('shareStatus').textContent =
        'Hospedagem gratuita GitHub Pages. O link em nuvem do Netlify foi removido. Use Exportar IFC, HTML ou PNG.';
    };
  }
  if (createShare) createShare.hidden = true;

  if ($('pdfOwnerHint')) $('pdfOwnerHint').textContent =
    'PDFs locais: ficam salvos neste navegador/dispositivo e não são enviados ao Netlify.';
  if ($('uploadPDFs')) $('uploadPDFs').textContent = 'Adicionar PDFs locais';
  if ($('pdfLibraryState')) $('pdfLibraryState').textContent = 'Armazenamento local gratuito';

  if ($('pdfFloorFilter')) {
    $('pdfFloorFilter').disabled = true;
    $('pdfFloorFilter').style.display = 'none';
  }
  if ($('pdfElementFilter')) {
    $('pdfElementFilter').disabled = true;
    $('pdfElementFilter').closest('label')?.style.setProperty('display','none');
  }

  let pdfjs = null;
  let currentPdf = null;
  let currentPage = 1;
  let currentZoom = 1;
  let currentUrl = '';
  let renderTask = null;

  function scope() {
    const name = ($('filename')?.textContent || 'sem-modelo').split(' · ')[0].trim();
    return name && name !== 'Nenhum modelo aberto' ? name : 'sem-modelo';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('gg-viewer-local', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('pdfs')) {
          const store = db.createObjectStore('pdfs', {keyPath:'key'});
          store.createIndex('scope', 'scope', {unique:false});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putPdf(file) {
    const db = await openDb();
    const id = crypto.randomUUID();
    const rec = {
      key: `${scope()}:${id}`,
      scope: scope(),
      id,
      name: file.name,
      size: file.size,
      blob: file,
      added: Date.now()
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs','readwrite');
      tx.objectStore('pdfs').put(rec);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function listPdfs() {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs','readonly');
      const req = tx.objectStore('pdfs').index('scope').getAll(scope());
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.sort((a,b)=>b.added-a.added);
  }

  async function deletePdf(key) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs','readwrite');
      tx.objectStore('pdfs').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await renderLibrary();
  }

  function fmtBytes(bytes) {
    const mb = bytes / 1048576;
    return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1,Math.round(bytes/1024))} KB`;
  }

  async function renderLibrary() {
    const host = $('pdfList');
    if (!host) return;
    const q = ($('pdfSearch')?.value || '').trim().toLowerCase();
    const rows = (await listPdfs()).filter(r => !q || r.name.toLowerCase().includes(q));
    host.replaceChildren();

    if ($('pdfListCount')) $('pdfListCount').textContent = `${rows.length} PDF(s) local(is)`;
    if ($('pdfLibraryState')) $('pdfLibraryState').textContent = `${rows.length} PDF(s) neste dispositivo`;

    if (!rows.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Nenhum PDF local para este IFC.';
      host.appendChild(p);
      return;
    }

    for (const rec of rows) {
      const row = document.createElement('div');
      row.className = 'pdf-local-row';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'pdf-local-open';
      open.innerHTML = `<strong>${rec.name}</strong><small>${fmtBytes(rec.size)}</small>`;
      open.onclick = () => openPdf(rec);

      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Excluir';
      del.onclick = () => deletePdf(rec.key);

      row.append(open, del);
      host.appendChild(row);
    }
  }

  async function ensurePdfJs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';
    return pdfjs;
  }

  async function openPdf(rec) {
    try {
      if ($('pdfStatus')) $('pdfStatus').textContent = `Abrindo ${rec.name}…`;
      if (currentPdf) await currentPdf.destroy();

      const lib = await ensurePdfJs();
      currentPdf = await lib.getDocument({
        data: new Uint8Array(await rec.blob.arrayBuffer()),
        isEvalSupported: false,
        standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
        cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked:true
      }).promise;

      currentPage = 1;
      currentZoom = 1;

      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = URL.createObjectURL(rec.blob);

      const dl = $('pdfDownload');
      if (dl) {
        dl.href = currentUrl;
        dl.download = rec.name;
        dl.hidden = false;
      }

      await renderPage();
      if ($('pdfStatus')) $('pdfStatus').textContent = `${rec.name} · local`;
    } catch (e) {
      if ($('pdfStatus')) $('pdfStatus').textContent =
        `Erro ao abrir PDF local: ${e?.message || e}`;
    }
  }

  async function renderPage() {
    if (!currentPdf) return;
    if (renderTask) {
      try { renderTask.cancel(); } catch {}
    }

    const page = await currentPdf.getPage(currentPage);
    const natural = page.getViewport({scale:1});
    const width = Math.max(($('pdfCanvasWrap')?.clientWidth || 800) - 24, 250);
    const scale = Math.min((width / natural.width) * currentZoom, 4);
    const viewport = page.getViewport({scale});

    const canvas = $('pdfCanvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    renderTask = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport
    });
    await renderTask.promise;

    if ($('pdfPage')) $('pdfPage').textContent = `${currentPage} / ${currentPdf.numPages}`;
    if ($('pdfPrevious')) $('pdfPrevious').disabled = currentPage <= 1;
    if ($('pdfNext')) $('pdfNext').disabled = currentPage >= currentPdf.numPages;
  }

  const input = $('pdfFiles');
  if (input) input.onchange = async () => {
    const files = [...(input.files || [])].filter(f => /\.pdf$/i.test(f.name));
    for (const file of files) {
      if (file.size <= 100 * 1024 * 1024) await putPdf(file);
    }
    input.value = '';
    await renderLibrary();
  };

  $('pdfSearch')?.addEventListener('input', () => renderLibrary());

  if ($('pdfPrevious')) $('pdfPrevious').onclick = () => {
    if (currentPdf && currentPage > 1) {
      currentPage--;
      renderPage();
    }
  };

  if ($('pdfNext')) $('pdfNext').onclick = () => {
    if (currentPdf && currentPage < currentPdf.numPages) {
      currentPage++;
      renderPage();
    }
  };

  if ($('pdfZoomIn')) $('pdfZoomIn').onclick = () => {
    if (currentPdf) {
      currentZoom = Math.min(4, currentZoom * 1.25);
      renderPage();
    }
  };

  if ($('pdfZoomOut')) $('pdfZoomOut').onclick = () => {
    if (currentPdf) {
      currentZoom = Math.max(.25, currentZoom / 1.25);
      renderPage();
    }
  };

  for (const id of ['pdfTab','projectPDFs']) {
    $(id)?.addEventListener('click', () => setTimeout(renderLibrary, 50));
  }

  const filename = $('filename');
  if (filename) {
    new MutationObserver(() => {
      const hasModel = filename.textContent &&
        filename.textContent !== 'Nenhum modelo aberto';

      if ($('pdfTab')) $('pdfTab').disabled = !hasModel;
      if ($('projectPDFs')) $('projectPDFs').disabled = !hasModel;
      renderLibrary();
    }).observe(filename, {childList:true, characterData:true, subtree:true});
  }

  const style = document.createElement('style');
  style.textContent = `
    .github-pages-mode .pdf-local-row{
      display:grid;grid-template-columns:1fr auto;gap:6px;
      align-items:stretch;margin:6px 0
    }
    .github-pages-mode .pdf-local-open{
      text-align:left;display:grid;gap:2px
    }
    .github-pages-mode .pdf-local-open small{
      font-size:10px;opacity:.65
    }
    .github-pages-mode #createShare{display:none!important}
  `;
  document.head.appendChild(style);

  const version = document.querySelector('.build-version');
  if (version) version.textContent = 'GitHub Pages · gratuito · sem Netlify';

  renderLibrary().catch(console.warn);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(bootGithubPagesMode, 0));
} else {
  setTimeout(bootGithubPagesMode, 0);
}
