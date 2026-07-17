import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';

export interface DatosCertificado {
  nombre: string;
  dni: string;
  nota: number | string;
  curso: string;
  fecha: string; // ya formateada (ej. "10 de julio de 2026")
}

/**
 * Certificado genérico en PDF — provisional para pruebas.
 * Cuando el proyecto salga a producción, cada ejecutor sube su propio diseño
 * a la carpeta de Drive de su red (ver CarpetasDriveService); este generador
 * deja de usarse.
 */
@Injectable({ providedIn: 'root' })
export class CertificadoService {
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
}
