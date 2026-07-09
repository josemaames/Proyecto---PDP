import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import * as ExcelJS from 'exceljs';

@Injectable({ providedIn: 'root' })
export class NotasService {
  private http = inject(HttpClient);

  getResultados(codigoAct: string): Observable<any> {
    return this.http.get<any>(`/api/actividades/${encodeURIComponent(codigoAct)}/resultados`);
  }

  guardarNotas(codigoAct: string, notas: { dni: string; nota: any }[], ejecutorNombre: string): Observable<any> {
    return this.http.post<any>(`/api/actividades/${encodeURIComponent(codigoAct)}/notas`, {
      notas,
      ejecutor_nombre: ejecutorNombre,
    });
  }

  /** Genera y descarga la plantilla de notas pre-llenada con los participantes. */
  async descargarPlantilla(codigoAct: string, nombreActividad: string, participantes: any[]): Promise<void> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Notas');
    ws.columns = [
      { header: 'DNI', key: 'dni', width: 15 },
      { header: 'Nombre', key: 'nombre', width: 42 },
      { header: 'Curso', key: 'curso', width: 32 },
      { header: 'Nota (0-20)', key: 'nota', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3D7C' } };
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });
    for (const p of participantes) {
      ws.addRow({ dni: p.dni || '', nombre: p.nombre || '', curso: nombreActividad || codigoAct, nota: '' });
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Plantilla_Notas_${codigoAct}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Lee un Excel subido y devuelve [{ dni, nota }] (columna 1 = DNI, columna 4 = Nota). */
  async leerExcel(file: File): Promise<{ dni: string; nota: any }[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const filas: { dni: string; nota: any }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // encabezado
      const dni = String(row.getCell(1).value ?? '').trim();
      let nota: any = row.getCell(4).value;
      if (nota && typeof nota === 'object' && 'result' in nota) nota = (nota as any).result; // celda con fórmula
      if (dni) filas.push({ dni, nota });
    });
    return filas;
  }
}
