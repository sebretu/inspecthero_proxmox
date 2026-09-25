import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, title, desc, description } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).send("Missing parameter: url");
  }

  const safeTitle = typeof title === "string" ? title.replace(/[<>"'&]/g, "") : "Foto-Ansicht";
  const descRaw = typeof desc === "string" ? desc : typeof description === "string" ? description : "";
  const safeDesc = descRaw.replace(/[<>"'&]/g, "");
  const safeUrl = url.replace(/[<>"']/g, "");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
  <title>${safeTitle} • InspectHero</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #030712;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }
    header {
      min-height: 56px;
      height: auto;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 10px 16px;
      z-index: 100;
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .title-box {
      min-width: 0;
    }
    .title {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
      white-space: normal;
      word-break: break-word;
      max-width: 520px;
      line-height: 1.35;
    }
    .subtitle {
      font-size: 11px;
      color: #38bdf8;
      font-weight: 600;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-1px);
    }
    .btn:active {
      transform: scale(0.96);
    }
    .btn-download {
      background: rgba(14, 165, 233, 0.2);
      border-color: rgba(56, 189, 248, 0.4);
      color: #38bdf8;
    }
    .btn-download:hover {
      background: rgba(14, 165, 233, 0.35);
      border-color: #38bdf8;
      color: #ffffff;
    }
    .btn-close {
      background: #dc2626;
      border-color: rgba(255, 255, 255, 0.4);
      color: #ffffff;
      font-weight: 800;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);
    }
    .btn-close:hover {
      background: #ef4444;
      border-color: #ffffff;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    main {
      flex: 1;
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle, #0f172a 0%, #030712 100%);
    }
    main:active {
      cursor: grabbing;
    }
    #image-wrapper {
      position: absolute;
      transform-origin: center center;
      transition: transform 0.05s ease-out;
      display: flex;
      align-items: center;
      justify-content: center;
      max-width: 100%;
      max-height: 100%;
    }
    #photo {
      max-width: 95vw;
      max-height: 85vh;
      object-fit: contain;
      border-radius: 6px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      pointer-events: none;
    }
    .desc-box {
      position: fixed;
      top: 66px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 14px;
      padding: 8px 18px;
      max-width: min(700px, 92vw);
      text-align: center;
      z-index: 90;
      box-shadow: 0 12px 30px rgba(0,0,0,0.7);
      animation: fadeIn 0.25s ease-out;
    }
    .desc-text {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      line-height: 1.45;
    }
    .floating-controls {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      z-index: 100;
    }
    .floating-btn {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    }
    .floating-btn:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    @media (max-width: 640px) {
      .title { max-width: 100%; font-size: 13px; }
      .desc-text { font-size: 12px; }
      .hide-mobile { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <button type="button" class="btn" onclick="handleGoBack()" title="Zurück (Esc)">
        ← <span class="hide-mobile">Zurück</span>
      </button>
      <div class="title-box">
        <div class="title">${safeTitle}</div>
        <div class="subtitle">Originalbild • el4u.de</div>
      </div>
    </div>
    <div class="header-right">
      <button type="button" class="btn btn-download hide-mobile" onclick="downloadImage()" title="Originalbild direkt herunterladen">
        ⬇ Herunterladen
      </button>
      <button type="button" class="btn btn-close" onclick="handleGoBack()" title="Schließen (Esc)">
        ✕ Schließen
      </button>
    </div>
  </header>

  ${safeDesc ? `
  <div class="desc-box">
    <p class="desc-text">${safeDesc}</p>
  </div>
  ` : ""}

  <main id="container">
    <div id="image-wrapper">
      <img id="photo" src="${safeUrl}" alt="${safeTitle}" />
    </div>
  </main>

  <div class="floating-controls">
    <button type="button" class="floating-btn" onclick="zoomIn()" title="Vergrößern (+)">🔍 +</button>
    <button type="button" class="floating-btn" onclick="zoomOut()" title="Verkleinern (-)">🔍 -</button>
    <button type="button" class="floating-btn" onclick="resetZoom()" title="Zurücksetzen">100%</button>
  </div>

  <script>
    let scale = 1;
    let posX = 0;
    let posY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const wrapper = document.getElementById('image-wrapper');
    const container = document.getElementById('container');

    function updateTransform() {
      wrapper.style.transform = 'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ')';
    }

    function zoomIn() {
      scale = Math.min(scale * 1.3, 8);
      updateTransform();
    }

    function zoomOut() {
      scale = Math.max(scale / 1.3, 0.5);
      updateTransform();
    }

    function resetZoom() {
      scale = 1;
      posX = 0;
      posY = 0;
      updateTransform();
    }

    function handleGoBack() {
      try {
        if (window.opener && !window.opener.closed) {
          window.close();
          return;
        }
      } catch(e) {}
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    }

    function downloadImage() {
      const cleanName = '${safeTitle}'.replace(/[^a-zA-Z0-9_-]/g, '_') + '.jpg';
      const downloadEndpoint = '/api/download-photo?url=' + encodeURIComponent('${safeUrl}') + '&filename=' + encodeURIComponent(cleanName);
      const a = document.createElement('a');
      a.href = downloadEndpoint;
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Mouse Dragging / Panning
    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX - posX;
      startY = e.clientY - posY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      posX = e.clientX - startX;
      posY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch Support
    let lastTouchDistance = 0;
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - posX;
        startY = e.touches[0].clientY - posY;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging) {
        posX = e.touches[0].clientX - startX;
        posY = e.touches[0].clientY - startY;
        updateTransform();
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastTouchDistance > 0) {
          const factor = dist / lastTouchDistance;
          scale = Math.min(Math.max(scale * factor, 0.5), 8);
          updateTransform();
        }
        lastTouchDistance = dist;
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      isDragging = false;
      lastTouchDistance = 0;
    });

    // Wheel Zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        scale = Math.min(scale * 1.15, 8);
      } else {
        scale = Math.max(scale / 1.15, 0.5);
      }
      updateTransform();
    }, { passive: false });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleGoBack();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
