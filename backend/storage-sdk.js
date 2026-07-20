// SDK del File Server interno de EsSalud (Dotworkers), pasado por el ingeniero.
// Convertido de ES Modules a CommonJS para que calce con el resto del backend
// (que usa require()), y reconstruido: el código original llegó por chat sin
// backticks en los template literals (se perdieron al copiar/pegar).
// Usa fetch/FormData/Blob nativos de Node (18+) en vez de axios/form-data,
// para no agregar dependencias nuevas al proyecto.

function errorInterno(msg, data) {
  const err = new Error(msg);
  err.data = data;
  return err;
}

class StorageSDK {
  /**
   * @param {object} data
   * @param {string} data.host       Base URL del File Server (ej. STORAGE_URL_API)
   * @param {string} data.api_key    API key del File Server
   * @param {string} data.app_name   Nombre de la app registrada en el File Server
   * @param {object} [data.paths]    Overrides de los endpoints (upload/obtenerArchivoPdf/obtenerArchivoLink)
   */
  constructor({ host, api_key, app_name, paths } = {}) {
    const {
      upload = '/upload',
      obtenerArchivoPdf = '/download',
      obtenerArchivoLink = '/obtener',
    } = paths || {};

    if (!api_key) throw errorInterno('api_key is required', { api_key, paths });
    if (!app_name) throw errorInterno('app_name is required', { app_name, paths });
    if (!host) throw errorInterno('host is required', { host, paths });
    if (!upload) throw errorInterno('upload is required', { host, paths });
    if (!obtenerArchivoPdf) throw errorInterno('obtenerArchivoPdf is required', { host, paths });
    if (!obtenerArchivoLink) throw errorInterno('obtenerArchivoLink is required', { host, paths });

    this.api_key = api_key;
    this.app_name = app_name;
    this.host = host;
    this.paths = { upload, obtenerArchivoPdf, obtenerArchivoLink };
  }

  async upload(data) {
    const {
      // Acá pasamos el req.file que da multer: { buffer, originalname, mimetype }.
      // Se deja el fallback a .hapi.* por si algún día se llama con un stream de Hapi,
      // como en el código original del ingeniero.
      file,
      identifier,
      throwError = false,
      trace,
    } = data || {};

    if (!file) throw errorInterno('StorageSDK.upload: file is required', data);
    if (!trace) throw errorInterno('StorageSDK.upload: trace is required', data);

    const bytes = file.buffer || file; // multer: file.buffer. Si no, asume que file ya es el Buffer.
    const filenew = file?.hapi?.filename || file?.originalname || file?.name || 'file';
    const sanitizedIdentifier = (identifier || '')
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9.-]/g, '')
      .replace(/\+/g, '');
    const sanitizedFilename = filenew
      .trim()
      .replace(/[^a-zA-Z0-9. ]/g, '_')
      .replace(/\s+/g, '');
    const fileName = sanitizedIdentifier ? `${sanitizedIdentifier}_${sanitizedFilename}` : sanitizedFilename;

    const contentType = file?.hapi?.headers?.['content-type'] || file?.mimetype || 'application/octet-stream';
    const blob = new Blob([bytes], { type: contentType });

    const form = new FormData();
    form.append('file', blob, fileName);
    form.append('nameApp', this.app_name);

    const url = this.host + this.paths.upload;

    let result;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { api_key: this.api_key }, // fetch pone el Content-Type multipart solo
        body: form,
      });
      const raw = await resp.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
      result = { isStatusIn2xx: resp.ok, status: resp.status, data };
    } catch (err) {
      result = { isStatusIn2xx: false, error: err.message };
    }

    if (result.isStatusIn2xx) {
      return { isOk: true, item: result.data || {} };
    }

    if (throwError) throw errorInterno(`Error: StorageSDK.upload`, { result, url });

    return { isOk: false, errInternalServer: true, result, request: { url } };
  }

  async obtenerArchivoPdf(nameFile) {
    const url = this.host + this.paths.obtenerArchivoPdf;
    const headers = { 'Content-Type': 'application/json', api_key: this.api_key };
    const body = { nameFile, nameApp: this.app_name };

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Error en la petición: ${response.statusText}`);
    return response.json();
  }

  async obtenerArchivoLink(nameFile) {
    const baseUrl = this.host + this.paths.obtenerArchivoLink;
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}nameFile=${encodeURIComponent(nameFile)}&nameApp=${encodeURIComponent(this.app_name)}`;
    const headers = { 'Content-Type': 'application/json', api_key: this.api_key };

    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) throw new Error('Error al obtener el enlace del archivo');
    return response.json();
  }
}

module.exports = StorageSDK;
