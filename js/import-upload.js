// ═══════════════════════════════════════════
// DCANT — Import : traitement fichiers
// PDF → images, conversions base64, HEIC
// ═══════════════════════════════════════════

const ImportUpload = (() => {

  /**
   * Convertit un PDF en tableau d'images JPEG (une par page).
   * Charge PDF.js depuis CDN si nécessaire.
   * Cap à 5 pages, 4M pixels par page (sécurité iOS).
   * @param {File} file
   * @returns {Promise<Array<{base64: string, media_type: string}>>}
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

      const maxPixels = 4000000;
      if (vp.width * vp.height > maxPixels) {
        scale *= Math.sqrt(maxPixels / (vp.width * vp.height));
        vp = page.getViewport({ scale });
      }

      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const dataUrl = c.toDataURL('image/jpeg', 0.90);
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
   * Pour les formats directement supportés par l'API (JPEG, PNG, WebP, GIF) < 5MB.
   * @param {File} file
   * @returns {Promise<string>} base64 sans préfixe data:
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
   * Redimensionne pour respecter les limites iOS (4M px) et API (2500px).
   * @param {File} file
   * @returns {Promise<string>} base64 JPEG sans préfixe data:
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const maxPixels = 4000000;
        if (w * h > maxPixels) {
          const ratio = Math.sqrt(maxPixels / (w * h));
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const MAX = 2500;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
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
   * @param {File} file
   * @returns {Promise<Array<{base64: string, media_type: string}>>}
   */
  async function prepareImages(file) {
    const supportedRaw = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.type === 'application/pdf') {
      const imgs = await pdfToImages(file);
      if (imgs.length === 0) throw new Error('Impossible de lire le PDF (canvas vide)');
      return imgs;
    }

    if (supportedRaw.includes(file.type) && file.size < 5 * 1024 * 1024) {
      const base64 = await fileToBase64Raw(file);
      return [{ base64, media_type: file.type }];
    }

    const base64 = await fileToBase64(file);
    return [{ base64, media_type: 'image/jpeg' }];
  }

  return { pdfToImages, fileToBase64Raw, fileToBase64, prepareImages };

})();
