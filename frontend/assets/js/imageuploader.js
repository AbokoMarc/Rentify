// Upload d'images "depuis l'appareil" — sans service externe (pas de Cloudinary/S3, pour rester
// gratuit). Chaque image est redimensionnée et compressée dans le navigateur (Canvas), puis
// envoyée au serveur en base64 et stockée directement dans la fiche du logement (`images`).
// Limite pratique : quelques photos par annonce (le corps de requête est plafonné à 10 Mo côté serveur) ;
// largement suffisant après compression (chaque photo compressée pèse en général 100-300 Ko).

const MAX_IMAGE_WIDTH = 1280;
const IMAGE_QUALITY = 0.72;
const MAX_IMAGES = 8;

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error(`${file.name} n'est pas une image.`));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}.`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`Image invalide : ${file.name}.`));
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Monte un mini-widget d'upload dans le conteneur donné (id). `getImages`/`setImages` relient le
// widget à la liste d'images actuelle du formulaire (tableau de data-URI ou d'URLs existantes).
function mountImageUploader(containerId, images, onChange) {
  const container = qs(containerId);
  let current = [...images];

  function render() {
    container.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        ${current.map((src, i) => `
          <div style="position:relative;width:88px;height:88px;border-radius:8px;overflow:hidden;border:1px solid var(--line)">
            <img src="${src}" style="width:100%;height:100%;object-fit:cover">
            <button type="button" data-remove="${i}" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(20,13,8,0.75);color:white;border:none;font-size:12px;cursor:pointer;line-height:1">✕</button>
          </div>`).join('')}
        ${current.length < MAX_IMAGES ? `
          <label style="width:88px;height:88px;border-radius:8px;border:1.5px dashed var(--line-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:var(--muted-text);gap:4px;font-size:11px;text-align:center">
            ${ICONS.upload}
            Ajouter
            <input type="file" accept="image/*" multiple style="display:none" id="${containerId}-input">
          </label>` : ''}
      </div>
      <p id="${containerId}-status" style="font-size:12px;color:var(--muted-text)"></p>
    `;

    const input = document.getElementById(`${containerId}-input`);
    if (input) {
      input.addEventListener('change', async (e) => {
        const files = [...e.target.files].slice(0, MAX_IMAGES - current.length);
        const statusEl = document.getElementById(`${containerId}-status`);
        statusEl.textContent = `Traitement de ${files.length} image(s)…`;
        for (const file of files) {
          try {
            const dataUrl = await compressImageFile(file);
            current.push(dataUrl);
          } catch (err) {
            statusEl.textContent = err.message;
          }
        }
        statusEl.textContent = current.length ? `${current.length} photo(s)` : '';
        onChange(current);
        render();
      });
    }

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        current.splice(Number(btn.dataset.remove), 1);
        onChange(current);
        render();
      });
    });
  }

  render();
  return { getImages: () => current, reset: (imgs) => { current = [...imgs]; render(); } };
}
