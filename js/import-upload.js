// ═══════════════════════════════════════════
// DCANT — Import : traitement fichiers
// PDF → images, conversions base64, HEIC
// + pré-traitement photo mobile (contraste, netteté)
// ═══════════════════════════════════════════

const ImportUpload = (() => {

  /**
   * Détecte si on est probablement sur mobile (photo prise au téléphone).
   */
  function _isMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Pré-traitement d'un canvas pour améliorer la lisibilité du texte
   * (photos de documents prises au téléphone).
   * 1) Augmente le contraste (texte plus noir, fond plus blanc)
   * 2) Applique un filtre de netteté (unsharp mask simplifié)
   */
  function _enhanceDocPhoto(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;

    // ── Étape 1 : Contraste + luminosité ──
    // Pousse les pixels sombres plus sombres, les clairs plus clairs
    const contrast = 1.4;   // 1.0 = neutre, >1 = plus de contraste
    const brightness = 10;  // léger éclaircissement du fond
    const mid = 128;
    for (let i = 0; i < d.length; i += 4) {
      d[i]     = Math.max(0, Math.min(255, contrast * (d[i]     - mid) + mid + brightness));
      d[i + 1] = Math.max(0, Math.min(255, contrast * (d[i + 1] - mid) + mid + brightness));
      d[i + 2] = Math.max(0, Math.min(255, contrast * (d[i + 2] - mid) + mid + brightness));
    }

    // ── Étape 2 : Netteté (unsharp mask simplifié) ──
    // On compare chaque pixel à la moyenne de ses voisins
    // et on amplifie la différence
    const strength = 0.4;
    const orig = new Uint8ClampedArray(d); // copie avant blur
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          // Moyenne 3x3 des voisins (approximation rapide : 4 voisins cardinaux)
          const avg = (
            orig[((y-1)*w+x)*4+c] +
            orig[((y+1)*w+x)*4+c] +
            orig[(y*w+x-1)*4+c] +
            orig[(y*w+x+1)*4+c]
          ) / 4;
          const sharp = orig[idx+c] + strength * (orig[idx+c] - avg);
          d[idx+c] = Math.max(0, Math.min(255, sharp));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Convertit un PDF en tableau d'images JPEG (une par page).
   * Cap à 5 pages, résolution élevée pour lisibilité.
   */
  async function pdfToImages(file) {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = Math.min(pdf.numPages, 5);

    const images = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      let scale = 2.0;
      let vp = page.getViewport({ scale });

      // iOS Safari crashe au-delà de ~16M pixels par canvas
      const maxPixels = _isMobile() ? 8000000 : 8000000;
      if (vp.width * vp.height > maxPixels) {
        scale *= Math.sqrt(maxPixels / (vp.width * vp.height));
        vp = page.getViewport({ scale });
      }

      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      const b64 = dataUrl.split(',')[1];
      if (b64 && b64.length > 1000) {
        images.push({ base64: b64, media_type: 'image/jpeg' });
      }
      console.log(`[DCANT] PDF page ${i}/${numPages}: ${c.width}x${c.height}px, base64: ${(b64.length / 1024).toFixed(0)}KB`);
    }

    return images;
  }

  /**
   * Lecture brute d'un fichier image en base64 (sans conversion).
   */
  function fileToBase64Raw(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Conversion d'image via canvas (HEIC, gros fichiers, formats exotiques).
   * Redimensionne intelligemment selon mobile/desktop.
   * Applique un pré-traitement pour les photos mobile.
   * @param {File} file
   * @param {boolean} isPhoto - true si photo prise au téléphone
   * @returns {Promise<string>} base64 JPEG
   */
  function fileToBase64(file, isPhoto) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;

        // Limite pixels pour éviter crash canvas iOS
        // 8M pixels = ~2830x2830 — largement suffisant pour lire du texte
        const maxPixels = 8000000;
        if (w * h > maxPixels) {
          const ratio = Math.sqrt(maxPixels / (w * h));
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        // Limite dimension max (API Claude accepte jusqu'à ~4096px)
        const MAX = 3200;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        // Pré-traitement pour photos de documents (mobile)
        if (isPhoto) {
          _enhanceDocPhoto(canvas);
          console.log(`[DCANT] Photo enhanced: ${w}x${h}px`);
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve(dataUrl.split(',')[1]);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Impossible de lire cette image'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Prépare un fichier (PDF, image, HEIC) en tableau d'images base64 pour l'API.
   * Sur mobile, les photos sont pré-traitées pour améliorer la lisibilité.
   */
  async function prepareImages(file) {
    const supportedRaw = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.type === 'application/pdf') {
      const imgs = await pdfToImages(file);
      if (imgs.length === 0) throw new Error('Impossible de lire le PDF (canvas vide)');
      return imgs;
    }

    // Détection photo mobile : fichier pris avec la caméra
    // Les photos iPhone/Android sont souvent > 2MB et en JPEG
    const isMobile = _isMobile();
    const isLargePhoto = file.type === 'image/jpeg' && file.size > 2 * 1024 * 1024;
    const isPhoto = isMobile || isLargePhoto;

    // Si photo détectée → toujours passer par canvas pour pré-traiter
    if (isPhoto) {
      console.log(`[DCANT] Photo détectée (${(file.size/1024/1024).toFixed(1)}MB, mobile=${isMobile}) → pré-traitement`);
      const base64 = await fileToBase64(file, true);
      return [{ base64, media_type: 'image/jpeg' }];
    }

    // Image desktop propre < 20MB → envoi brut sans traitement
    if (supportedRaw.includes(file.type) && file.size < 20 * 1024 * 1024) {
      const base64 = await fileToBase64Raw(file);
      return [{ base64, media_type: file.type }];
    }

    // Fallback (HEIC, formats exotiques, etc.)
    const base64 = await fileToBase64(file, false);
    return [{ base64, media_type: 'image/jpeg' }];
  }

  return { pdfToImages, fileToBase64Raw, fileToBase64, prepareImages };

})();
