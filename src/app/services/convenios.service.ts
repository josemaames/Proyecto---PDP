import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  actualizarEspecifico(id: number, body: Partial<ConvenioEspecifico>): Observable<ConvenioEspecifico> {
    return this.http.put<ConvenioEspecifico>(`/api/convenios-especifico/${id}`, body);
  }

  eliminarEspecifico(id: number): Observable<any> {
    return this.http.delete(`/api/convenios-especifico/${id}`);
  }

  // ── Documentos (PDF) ─────────────────────────────
  getDocumentos(convenioTipo: 'marco' | 'especifico', convenioId: number): Observable<ConvenioDocumento[]> {
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
    return this.http.get<{ url: string; nombre_archivo: string }>(`/api/convenios/documentos/${id}/descargar`);
  }

  eliminarDocumento(id: number): Observable<any> {
    return this.http.delete(`/api/convenios/documentos/${id}`);
  }

  // ── Contraprestaciones (informe memoria por universidad) ─
  // Puramente informativo: no afecta presupuesto de redes ni dashboards.
  getContraprestaciones(
    marcoId: number,
  ): Observable<{ data: Contraprestacion[]; resumen: ContraprestacionResumen[]; total: number; totalValorizado: number }> {
    return this.http.get<{ data: Contraprestacion[]; resumen: ContraprestacionResumen[]; total: number; totalValorizado: number }>(
      `/api/convenios-marco/${marcoId}/contraprestaciones`,
    );
  }

  cargarContraprestacionesExcel(
    marcoId: number,
    file: File,
    actorNombre: string,
  ): Observable<{ filas: number; universidadDetectada: string | null; facultad: string | null; periodo: string | null }> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('actor_nombre', actorNombre);
    return this.http.post<{ filas: number; universidadDetectada: string | null; facultad: string | null; periodo: string | null }>(
      `/api/convenios-marco/${marcoId}/contraprestaciones/cargar-excel`,
      formData,
    );
  }

  // ── Carga masiva por Excel ───────────────────────
  cargarExcel(
    file: File,
    actorNombre: string,
  ): Observable<{ marcosCreados: number; especificosCreados: number; duplicados: number; errores: string[] }> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('actor_nombre', actorNombre);
    return this.http.post<{ marcosCreados: number; especificosCreados: number; duplicados: number; errores: string[] }>(
      '/api/convenios/cargar-excel',
      formData,
    );
  }
}
