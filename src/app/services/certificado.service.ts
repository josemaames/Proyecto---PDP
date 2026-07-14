import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import JSZip from 'jszip';

export interface DatosCertificado {
  nombre: string;
  dni: string;
  nota: number | string;
  curso: string;
  fecha: string; // ya formateada (ej. "10 de julio de 2026")
}

@Injectable({ providedIn: 'root' })
export class CertificadoService {
  /**
   * Dibuja UN certificado en la página actual del documento.
   * Diseño propio (provisional). Para usar el oficial luego: reemplazar el
   * contenido de este método (p. ej. poner una imagen de fondo con doc.addImage
   * y solo escribir encima nombre/dni/nota).
   */
  private dibujar(doc: jsPDF, d: DatosCertificado): void {
    const W = doc.internal.pageSize.getWidth();   // 297 mm (landscape)
    const H = doc.internal.pageSize.getHeight();  // 210 mm
    const cx = W / 2;
    const azul: [number, number, number] = [26, 61, 124];
    const gris: [number, number, number] = [90, 105, 125];

    // Marco doble
    doc.setDrawColor(...azul);
    doc.setLineWidth(1.4);
    doc.rect(10, 10, W - 20, H - 20);
    doc.setLineWidth(0.4);
    doc.rect(14, 14, W - 28, H - 28);

    // Encabezado institucional
    doc.setTextColor(...gris);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('SEGURO SOCIAL DE SALUD — EsSalud', cx, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Plan de Desarrollo de Personas (PDP)', cx, 37, { align: 'center' });

    // Título
    doc.setTextColor(...azul);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(38);
    doc.text('CERTIFICADO', cx, 62, { align: 'center' });
    doc.setLineWidth(0.6);
    doc.line(cx - 40, 68, cx + 40, 68);

    // Otorgado a
    doc.setTextColor(...gris);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text('Se otorga el presente certificado a:', cx, 84, { align: 'center' });

    // Nombre — autoajuste: reduce la letra hasta que quepa en una sola línea.
    doc.setTextColor(20, 30, 50);
    doc.setFont('helvetica', 'bold');
    const nombreTxt = (d.nombre || '—').toUpperCase();
    const maxAncho = W - 70;
    let nombreSize = 26;
    doc.setFontSize(nombreSize);
    while (doc.getTextWidth(nombreTxt) > maxAncho && nombreSize > 12) {
      nombreSize -= 1;
      doc.setFontSize(nombreSize);
    }
    doc.text(nombreTxt, cx, 100, { align: 'center' });

    // DNI
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...gris);
    doc.text(`DNI / CE: ${d.dni || '—'}`, cx, 110, { align: 'center' });

    // Cuerpo
    doc.setTextColor(40, 50, 65);
    doc.setFontSize(13.5);
    const cuerpo =
      `Por haber aprobado satisfactoriamente el curso "${d.curso || ''}", ` +
      `obteniendo una calificación de ${d.nota} (APROBADO).`;
    const lineas = doc.splitTextToSize(cuerpo, W - 90);
    doc.text(lineas, cx, 126, { align: 'center' });

    // Fecha
    doc.setFontSize(11);
    doc.setTextColor(...gris);
    doc.text(`Lima, ${d.fecha}`, cx, 158, { align: 'center' });

    // Firma
    doc.setDrawColor(...gris);
    doc.setLineWidth(0.4);
    doc.line(cx - 45, 178, cx + 45, 178);
    doc.setFontSize(11);
    doc.text('Coordinación del Plan de Desarrollo de Personas', cx, 184, { align: 'center' });
    doc.setFontSize(9);
    doc.text('EsSalud', cx, 189, { align: 'center' });
  }

  private nuevoDoc(): jsPDF {
    return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  }

  /** Certificado individual → descarga un PDF de 1 página. */
  descargarIndividual(d: DatosCertificado): void {
    const doc = this.nuevoDoc();
    this.dibujar(doc, d);
    doc.save(`Certificado_${(d.dni || 'participante')}.pdf`);
  }

  /** Un PDF con una página por cada aprobado del curso. */
  descargarCurso(aprobados: DatosCertificado[], codigoAct: string): void {
    if (!aprobados.length) return;
    const doc = this.nuevoDoc();
    aprobados.forEach((d, i) => {
      if (i > 0) doc.addPage();
      this.dibujar(doc, d);
    });
    doc.save(`Certificados_${codigoAct}.pdf`);
  }

  // ── Certificado a partir de una PLANTILLA .docx con marcadores {{ }} ──
  private DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  /**
   * Factor de reducción por tramos: cuanto más largo el texto, más agresivo el achique.
   * (Una simple regla de "proporción al exceso" resultaba demasiado suave para nombres
   * de 2 apellidos + 2 nombres, que fácilmente pasan de 25-30 caracteres).
   */
  private factorPorLargo(len: number): number {
    if (len <= 15) return 1;
    if (len <= 20) return 0.72;
    if (len <= 25) return 0.58;
    if (len <= 30) return 0.48;
    if (len <= 36) return 0.4;
    if (len <= 45) return 0.34;
    return 0.28;
  }

  /**
   * Reduce el tamaño de letra del texto insertado (nombre, curso, etc.) cuando es largo,
   * para que no se desborde a más líneas de las previstas en la plantilla y empuje el
   * certificado a una segunda página. Actúa solo sobre el <w:r> que contiene ese texto exacto.
   */
  private ajustarTamanioTexto(zip: PizZip, texto: string, tamanioMinimo = 14): void {
    const factor = this.factorPorLargo((texto || '').length);
    if (!texto || factor >= 1) return;
    const path = 'word/document.xml';
    const file = zip.file(path);
    if (!file) return;
    let xml = file.asText();

    const escapado = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const idx = xml.indexOf(`>${escapado}<`);
    if (idx === -1) return; // texto partido en varios runs u otro caso no soportado; se deja tal cual

    const runStartTag = xml.lastIndexOf('<w:r>', idx);
    const runStartTagAttr = xml.lastIndexOf('<w:r ', idx);
    const runStart = Math.max(runStartTag, runStartTagAttr);
    const runEndTag = '</w:r>';
    const runEndIdx = xml.indexOf(runEndTag, idx);
    if (runStart === -1 || runEndIdx === -1) return;
    const runEnd = runEndIdx + runEndTag.length;

    const run = xml.slice(runStart, runEnd);
    const nuevoRun = run
      .replace(/<w:sz w:val="(\d+)"\/>/g, (_m, val) =>
        `<w:sz w:val="${Math.max(tamanioMinimo, Math.round(Number(val) * factor))}"/>`)
      .replace(/<w:szCs w:val="(\d+)"\/>/g, (_m, val) =>
        `<w:szCs w:val="${Math.max(tamanioMinimo, Math.round(Number(val) * factor))}"/>`);

    xml = xml.slice(0, runStart) + nuevoRun + xml.slice(runEnd);
    zip.file(path, xml);
  }

  private rellenarDocx(templateBuf: ArrayBuffer, d: DatosCertificado): ArrayBuffer {
    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render({
      nombre: d.nombre || '',
      dni: d.dni || '',
      nota: String(d.nota ?? ''),
      curso: d.curso || '',
      fecha: d.fecha || '',
      condicion: 'Aprobado',
    });

    // Autoajuste: si el nombre/curso son largos, reduce su letra para que quepan en 1 hoja.
    this.ajustarTamanioTexto(zip, d.nombre || '');
    this.ajustarTamanioTexto(zip, d.curso || '');

    return doc.getZip().generate({ type: 'arraybuffer' });
  }

  private descargarBlob(data: Blob, filename: string): void {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Certificado individual usando la plantilla → descarga un .docx. */
  descargarIndividualDocx(templateBuf: ArrayBuffer, d: DatosCertificado): void {
    const ab = this.rellenarDocx(templateBuf, d);
    this.descargarBlob(new Blob([ab], { type: this.DOCX }), `Certificado_${d.dni || 'participante'}.docx`);
  }

  /** Todos los aprobados usando la plantilla → descarga un ZIP con un .docx por persona. */
  async descargarCursoDocx(templateBuf: ArrayBuffer, aprobados: DatosCertificado[], codigoAct: string): Promise<void> {
    if (!aprobados.length) return;
    const zip = new JSZip();
    for (const d of aprobados) {
      const ab = this.rellenarDocx(templateBuf, d);
      zip.file(`Certificado_${d.dni || d.nombre}.docx`, ab);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    this.descargarBlob(content, `Certificados_${codigoAct}.zip`);
  }
}
