require('dotenv').config();
const StorageSDK = require('./storage-sdk');

const sdk = new StorageSDK({
  host: process.env.STORAGE_URL_API,
  api_key: process.env.STORAGE_API_KEY,
  app_name: process.env.STORAGE_APP_NAME,
});

const PDF_MINIMO = require('fs').readFileSync(
  '/private/tmp/claude-501/-Users-victoracero/ede4efbd-5c22-4e8d-b4d6-8d09f0ee4842/scratchpad/prueba_pdp.pdf',
);

async function main() {
  console.log('=== 1) Subir un PDF de prueba ===');
  const fakeReqFile = {
    buffer: PDF_MINIMO,
    originalname: 'prueba_pdp.pdf',
    mimetype: 'application/pdf',
  };

  const subida = await sdk.upload({
    file: fakeReqFile,
    identifier: 'PDP_TEST',
    trace: 'pdp_test_storage_sdk',
  });
  console.log(JSON.stringify(subida, null, 2));

  if (!subida.isOk) {
    console.log('\nLa subida no fue exitosa, no continúo con la descarga.');
    return;
  }

  const ruta = subida.item?.newFilename || subida.item?.filename || subida.item?.nameFile || subida.item?.path;
  console.log('\nNombre/ruta devuelta por el storage:', ruta);

  if (ruta) {
    console.log('\n=== 2) Obtener el link del archivo ===');
    try {
      const link = await sdk.obtenerArchivoLink(ruta);
      console.log(JSON.stringify(link, null, 2));
    } catch (e) {
      console.error('Error obteniendo el link:', e.message);
    }

    console.log('\n=== 3) Descargar el archivo (base64/JSON) ===');
    try {
      const archivo = await sdk.obtenerArchivoPdf(ruta);
      console.log('Respuesta (recortada):', JSON.stringify(archivo).slice(0, 300));
    } catch (e) {
      console.error('Error descargando el archivo:', e.message);
    }
  }
}

main().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
