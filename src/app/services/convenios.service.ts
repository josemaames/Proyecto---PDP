import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import * as ExcelJS from 'exceljs';

export type EstadoVigencia = 'vigente' | 'por_vencer' | 'vencido' | 'sin_fecha';

export interface ConvenioMarco {
  id: number;
  universidad: string;
  numero_convenio: string | null;
  objeto: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string;
  tipo: 'Universidad' | 'Instituto';
  sede_principal: string | null;
  created_by: string | null;
  created_at: string;
  total_especificos: number;
  estado_vigencia: EstadoVigencia;
}

export interface ConvenioEspecifico {
  id: number;
  marco_id: number;
  nombre: string;
  numero_convenio: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string;
  created_by: string | null;
  created_at: string;
  estado_vigencia: EstadoVigencia;
}

export interface KpiConvenios {
  vigente: number;
  por_vencer: number;
  vencido: number;
  sin_fecha: number;
  total: number;
}

export interface Contraprestacion {
  id: number;
  marco_id: number;
  facultad: string | null;
  periodo: string | null;
  plan_anio: string | null;
  unidad_organica: string | null;
  detalle: string;
  duracion: string | null;
  num_beneficiarios: string | null;
  grupo_ocupacional: string | null;
  fecha_ejecucion: string | null;
  valorizacion: number | null;
  observaciones: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContraprestacionResumen {
  id: number;
  marco_id: number;
  tipo: 'subtotal' | 'total_red' | 'total_general';
  red: string | null;
  anio: string | null;
  monto: number | null;
}

export interface ConvenioDocumento {
  id: number;
  convenio_tipo: 'marco' | 'especifico';
  convenio_id: number;
  nombre_archivo: string;
  tipo_archivo: string;
  ruta_storage: string;
  tamano_kb: number;
  subido_por: string | null;
  fecha_subida: string;
}

@Injectable({ providedIn: 'root' })
export class ConveniosService {
  private http = inject(HttpClient);

  getKpis(): Observable<{ marco: KpiConvenios; especifico: KpiConvenios }> {
    return this.http.get<{ marco: KpiConvenios; especifico: KpiConvenios }>('/api/convenios/kpis');
  }

  // ── Convenios marco ──────────────────────────────
  getMarcos(q = ''): Observable<ConvenioMarco[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return this.http.get<ConvenioMarco[]>('/api/convenios-marco' + qs);
  }

  crearMarco(body: Partial<ConvenioMarco>): Observable<ConvenioMarco> {
    return this.http.post<ConvenioMarco>('/api/convenios-marco', body);
  }

  actualizarMarco(id: number, body: Partial<ConvenioMarco>): Observable<ConvenioMarco> {
    return this.http.put<ConvenioMarco>(`/api/convenios-marco/${id}`, body);
  }

  eliminarMarco(id: number): Observable<any> {
    return this.http.delete(`/api/convenios-marco/${id}`);
  }

  // ── Convenios específicos ────────────────────────
  getEspecificos(marcoId: number): Observable<ConvenioEspecifico[]> {
    return this.http.get<ConvenioEspecifico[]>(`/api/convenios-especifico?marco_id=${marcoId}`);
  }

  crearEspecifico(body: Partial<ConvenioEspecifico>): Observable<ConvenioEspecifico> {
    return this.http.post<ConvenioEspecifico>('/api/convenios-especifico', body);
  }

  actualizarEspecifico(
    id: number,
    body: Partial<ConvenioEspecifico>,
  ): Observable<ConvenioEspecifico> {
    return this.http.put<ConvenioEspecifico>(`/api/convenios-especifico/${id}`, body);
  }

  eliminarEspecifico(id: number): Observable<any> {
    return this.http.delete(`/api/convenios-especifico/${id}`);
  }

  // ── Documentos (PDF) ─────────────────────────────
  getDocumentos(
    convenioTipo: 'marco' | 'especifico',
    convenioId: number,
  ): Observable<ConvenioDocumento[]> {
    return this.http.get<ConvenioDocumento[]>(
      `/api/convenios/documentos?convenio_tipo=${convenioTipo}&convenio_id=${convenioId}`,
    );
  }

  subirDocumento(
    convenioTipo: 'marco' | 'especifico',
    convenioId: number,
    file: File,
    subidoPor: string,
  ): Observable<ConvenioDocumento> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('convenio_tipo', convenioTipo);
    formData.append('convenio_id', String(convenioId));
    formData.append('subido_por', subidoPor);
    return this.http.post<ConvenioDocumento>('/api/convenios/documentos', formData);
  }

  descargarDocumento(id: number): Observable<{ url: string; nombre_archivo: string }> {
    return this.http.get<{ url: string; nombre_archivo: string }>(
      `/api/convenios/documentos/${id}/descargar`,
    );
  }

  eliminarDocumento(id: number): Observable<any> {
    return this.http.delete(`/api/convenios/documentos/${id}`);
  }

  // ── Contraprestaciones (informe memoria por universidad) ─
  // Puramente informativo: no afecta presupuesto de redes ni dashboards.
  getContraprestaciones(
    marcoId: number,
  ): Observable<{
    data: Contraprestacion[];
    resumen: ContraprestacionResumen[];
    total: number;
    totalValorizado: number;
  }> {
    return this.http.get<{
      data: Contraprestacion[];
      resumen: ContraprestacionResumen[];
      total: number;
      totalValorizado: number;
    }>(`/api/convenios-marco/${marcoId}/contraprestaciones`);
  }

  cargarContraprestacionesExcel(
    marcoId: number,
    file: File,
    actorNombre: string,
  ): Observable<{
    filas: number;
    universidadDetectada: string | null;
    facultad: string | null;
    periodo: string | null;
  }> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('actor_nombre', actorNombre);

    return this.http.post<{
      filas: number;
      universidadDetectada: string | null;
      facultad: string | null;
      periodo: string | null;
    }>(`/api/convenios-marco/${marcoId}/contraprestaciones/cargar-excel`, formData);
  }

  // Dashboard por convenio
  getDashboardConvenio(marcoId: number): Observable<any> {
    return this.http.get<any>(`/api/convenios-marco/${marcoId}/dashboard`);
  }

  // ── Plantillas descargables ────────────────────────────
  private descargar(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  private estiloEncabezado(row: ExcelJS.Row): void {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3D7C' } };
    });
  }

  /** Plantilla para la carga masiva de convenios marco (hojas UNIVERSIDADES / INSTITUTOS). */
  async descargarPlantillaMarcos(): Promise<void> {
    const wb = new ExcelJS.Workbook();

    const wsU = wb.addWorksheet('UNIVERSIDADES');
    wsU.columns = [
      { header: 'Nº', key: 'n', width: 6 },
      { header: 'INSTITUCION EDUCATIVA', key: 'inst', width: 45 },
      { header: 'SEDE PRINCIPAL', key: 'sede', width: 18 },
      { header: 'SUSCRITO', key: 'inicio', width: 14 },
      { header: 'VIGENTE HASTA: ', key: 'fin', width: 14 },
    ];
    this.estiloEncabezado(wsU.getRow(1));
    wsU.addRow({
      n: 1,
      inst: 'UNIVERSIDAD NACIONAL DE EJEMPLO',
      sede: 'LIMA',
      inicio: new Date(2024, 0, 15),
      fin: new Date(2027, 0, 15),
    });

    const wsI = wb.addWorksheet('INSTITUTOS');
    wsI.columns = [
      { header: 'Nº', key: 'n', width: 6 },
      { header: 'INSTITUCION EDUCATIVA', key: 'inst', width: 45 },
      { header: 'SUSCRITO', key: 'inicio', width: 14 },
      { header: 'VENCIMIENTO', key: 'fin', width: 14 },
      { header: 'SEDE PRINCIPAL', key: 'sede', width: 18 },
    ];
    this.estiloEncabezado(wsI.getRow(1));
    wsI.addRow({
      n: 1,
      inst: 'INSTITUTO SUPERIOR DE EJEMPLO',
      inicio: new Date(2024, 0, 15),
      fin: new Date(2026, 0, 15),
      sede: 'AREQUIPA',
    });

    const buf = await wb.xlsx.writeBuffer();
    this.descargar(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'Plantilla_Convenios_Marco.xlsx',
    );
  }

  /**
   * Plantilla del informe de contraprestaciones (una universidad por archivo).
   * Muestra un bloque de ejemplo (1 red, 1 año) con las filas de cierre
   * "SUBTOTAL <año>" / "TOTAL DEL COMPROMISO CONTRAPRESTACIONAL" / "TOTAL DEL
   * COMPROMISO ESSALUD" que el sistema busca por texto para armar los totales.
   */
  async descargarPlantillaContraprestaciones(universidad: string): Promise<void> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('INFORME MEMORIA');
    ws.columns = [
      { key: 'a', width: 6 },
      { key: 'b', width: 30 },
      { key: 'c', width: 45 },
      { key: 'd', width: 16 },
      { key: 'e', width: 14 },
      { key: 'f', width: 30 },
      { key: 'g', width: 14 },
      { key: 'h', width: 16 },
      { key: 'i', width: 30 },
    ];

    ws.addRow(['INFORME MEMORIA']);
    ws.addRow([
      'CONTRAPRESTACIONES OTORGADAS A ESSALUD EN CUMPLIMIENTO DE LOS CONVENIOS ESPECÍFICOS SUSCRITOS',
    ]);
    ws.addRow([`UNIVERSIDAD: ${universidad}`]);
    ws.addRow(['FACULTAD: ']);
    ws.addRow(['PERÍODO   :  ']);
    ws.addRow([]);

    const filaEncabezado = ws.addRow([
      'N°',
      'UNIDAD ORGANICA',
      'DETALLE DE LA CONTRAPRESTACION OTORGADA',
      'DURACION',
      'Nº BENEFICIARIOS',
      'GRUPO OCUPAC. BENEFICIADO',
      'FECHA DE EJECUCION ',
      'VALORIZACION                                                     S/.   ',
      'OBSERVACIONES',
    ]);
    this.estiloEncabezado(filaEncabezado);

    ws.addRow([1, '', 'PLAN 2024', '', '', '', '', '', '']);
    ws.addRow([
      2,
      'RED ASISTENCIAL EJEMPLO',
      'Descripción de la contraprestación otorgada',
      'Permanente',
      25,
      'Personal asistencial',
      '01/03/2024',
      10000,
      'ENTREGADO',
    ]);
    ws.addRow([3, 'RED ASISTENCIAL EJEMPLO', '', '', '', 'SUBTOTAL 2024', '', 10000, '']);
    ws.addRow(['TOTAL DEL COMPROMISO CONTRAPRESTACIONAL', '', '', '', '', '', '', 10000, '']);
    ws.addRow([]);
    ws.addRow(['TOTAL DEL COMPROMISO ESSALUD', '', '', '', '', '', '', 10000, '']);

    const buf = await wb.xlsx.writeBuffer();
    this.descargar(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `Plantilla_Contraprestaciones_${universidad.replace(/[^\w]+/g, '_').substring(0, 40)}.xlsx`,
    );
  }

  // ── Carga masiva por Excel ───────────────────────
  cargarExcel(
    file: File,
    actorNombre: string,
  ): Observable<{
    marcosCreados: number;
    especificosCreados: number;
    duplicados: number;
    errores: string[];
  }> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('actor_nombre', actorNombre);
    return this.http.post<{
      marcosCreados: number;
      especificosCreados: number;
      duplicados: number;
      errores: string[];
    }>('/api/convenios/cargar-excel', formData);
  }
}
