import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Participante {
  id?: number;
  numero?: number;
  codigo_act?: string;
  dni_ce?: string;
  cod_planilla?: string;
  apellidos?: string;
  nombre?: string;
  sexo?: string;
  red?: string;
  sub_programa?: string;
  servicio_area?: string;
  cargo?: string;
  regimen_laboral?: string;
}

export interface Actividad {
  id?: number;
  numero?: number;
  codigo_act: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  mes_termino?: string;
  red_asistencial?: string;
  servicio_area?: string;
  nombre_actividad?: string;
  total_horas?: number;
  horas_fuera_horario?: number;
  frecuencia?: string;
  hora_inicio?: string;
  hora_termino?: string;
  modalidad?: string;
  publico?: string;
  nivel_evaluacion?: string;
  objetivo_estrategico?: string;
  total_participantes?: number;
  ruc_proveedor?: string;
  nombre_proveedor?: string;
  sector_proveedor?: string;
  presupuesto_ejecutado?: number;
  eje_tematico?: string;
}

export interface PersonalEssalud {
  id?: number;
  dni_ce?: string;
  cod_planilla?: string;
  apellidos?: string;
  nombre?: string;
  sexo?: string;
  red?: string;
  sub_programa?: string;
  servicio_area?: string;
  cargo?: string;
  regimen_laboral?: string;
  estado?: string;
}

export interface ResultadoActualizarPersonal {
  altas: number;
  cambiosRed: number;
  ceses: number;
  alertasGeneradas: number;
}

export interface AlertaPersonal {
  id: number;
  dni_ce: string;
  codigo_act: string;
  tipo: 'CESE' | 'CAMBIO_RED';
  nombre_completo: string;
  red_anterior: string;
  red_nueva: string | null;
  detectado_at: string;
  resuelto: boolean;
  resuelto_at: string | null;
  resuelto_por: string | null;
  motivo: string | null;
}

export interface ResumenRed {
  red: string;
  capacitaciones: number;
  horas: number;
  participantes: number;
  presupuesto: number;
}

export interface ApiResponse<T> {
  data: T[];
  total: number;
}

export interface Stats {
  actividades: number;
  participantes: number;
  presupuesto_total: number;
  redes: number;
  por_modalidad: { modalidad: string; total: number }[];
}

export interface Documento {
  id?: number;
  codigo_act: string;
  nombre_archivo: string;
  tipo_archivo: string;
  ruta_storage?: string;
  tamano_kb?: number;
  fecha_subida?: string;
}

@Injectable({ providedIn: 'root' })
export class PdpDataService {
  private api = '/api';

  constructor(private http: HttpClient) {}

  private normalizarSede(sede: string): string {
    const mapa: Record<string, string> = {
      'red asistencial arequipa': 'RA AREQUIPA',
      'red asistencial cusco': 'RA CUSCO',
      'red asistencial piura': 'RA PIURA',
      'red asistencial la libertad': 'RA LA LIBERTAD',
      'red asistencial ancash': 'RA ANCASH',
      'red asistencial tacna': 'RA TACNA',
      'red asistencial ica': 'RA ICA',
      'red asistencial puno': 'RA PUNO',
      'red asistencial loreto': 'RA LORETO',
      'red asistencial pasco': 'RA PASCO',
      'red asistencial junin': 'RA JUNIN',
      'red asistencial juliaca': 'RA JULIACA',
      'red asistencial apurimac': 'RA APURIMAC',
      'red asistencial ayacucho': 'RA AYACUCHO',
      'red asistencial cajamarca': 'RA CAJAMARCA',
      'red asistencial tarapoto': 'RA TARAPOTO',
      'red asistencial moyobamba': 'RA MOYOBAMBA',
      'red asistencial moquegua': 'RA MOQUEGUA',
      'red asistencial madre de dios': 'RA MADRE DE DIOS',
      'red asistencial tumbes': 'RA TUMBES',
      'red asistencial huanuco': 'RA HUANUCO',
      'red asistencial huaraz': 'RA HUARAZ',
      'red asistencial ucayali': 'RA UCAYALI',
      'red asistencial huancavelica': 'RA HUANCAVELICA',
      'red asistencial amazonas': 'RA AMAZONAS',
      'red asistencial jaen': 'RA JAEN',
      'red prestacional rebagliati': 'RP REBAGLIATI',
      'red prestacional almenara': 'RP ALMENARA',
      'red prestacional lambayeque': 'RP LAMBAYEQUE',
      'red prestacional sabogal': 'RP SABOGAL',
      lurin: 'RP REBAGLIATI',
    };
    return mapa[sede.toLowerCase().trim()] ?? sede;
  }

  /** Devuelve el filtro de red para el usuario logueado.
   *  Admin → '' (sin filtro), Sectorista → sedes separadas por coma, Ejecutor → su sede. */
  getRedFiltro(): string {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    if (!usuario.rol) return '';
    if (usuario.rol === 'Administrador' || usuario.rol === 'Administrativo') return '';
    if (usuario.rol === 'Sectorista') {
      let sedesArr: string[];
      if (Array.isArray(usuario.sedes)) {
        sedesArr = usuario.sedes;
      } else if (usuario.sedes) {
        sedesArr = (usuario.sedes as string)
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else {
        sedesArr = [];
      }
      return sedesArr.map((s) => this.normalizarSede(s)).join(',');
    }
    if (usuario.rol === 'Ejecutor') {
      let sede: string;
      if (Array.isArray(usuario.sedes)) {
        sede = usuario.sedes[0] || '';
      } else {
        sede = (usuario.sedes as string) || usuario.sede || '';
      }
      return this.normalizarSede(sede.split(',')[0].trim());
    }
    return '';
  }

  // ── Estadísticas ──────────────────────────────
  getStats(red = '', ejeTematico = '', anio = ''): Observable<Stats> {
    let params = new HttpParams();
    if (red) params = params.set('red', red);
    if (ejeTematico) params = params.set('eje_tematico', ejeTematico);
    if (anio) params = params.set('anio', anio);
    return this.http.get<Stats>(`${this.api}/stats`, { params });
  }

  getResumenRedes(redes = '', ejeTematico = '', anio = ''): Observable<ResumenRed[]> {
    let params = new HttpParams();
    if (redes) params = params.set('redes', redes);
    if (ejeTematico) params = params.set('eje_tematico', ejeTematico);
    if (anio) params = params.set('anio', anio);
    return this.http.get<ResumenRed[]>(`${this.api}/resumen-redes`, { params });
  }

  // ── Participantes ─────────────────────────────
  getParticipantes(
    q = '',
    codigo_act = '',
    page = 1,
    limit = 50,
    red = '',
    regimen_laboral = '',
  ): Observable<ApiResponse<Participante>> {
    const params = new HttpParams()
      .set('q', q)
      .set('codigo_act', codigo_act)
      .set('page', String(page))
      .set('limit', String(limit))
      .set('red', red)
      .set('regimen_laboral', regimen_laboral);
    return this.http.get<ApiResponse<Participante>>(`${this.api}/participantes`, { params });
  }

  crearParticipante(data: any): Observable<Participante> {
    return this.http.post<Participante>(`${this.api}/participantes`, data);
  }

  eliminarParticipante(id: number): Observable<any> {
    return this.http.delete(`${this.api}/participantes/${id}`);
  }

  // ── Actividades ───────────────────────────────
  getActividades(
    q = '',
    red = '',
    modalidad = '',
    page = 1,
    limit = 50,
    ejeTematico = '',
  ): Observable<ApiResponse<Actividad>> {
    let params = new HttpParams()
      .set('q', q)
      .set('red', red)
      .set('modalidad', modalidad)
      .set('page', String(page))
      .set('limit', String(limit));
    if (ejeTematico) params = params.set('eje_tematico', ejeTematico);
    return this.http.get<ApiResponse<Actividad>>(`${this.api}/actividades`, { params });
  }

  crearActividad(data: Actividad): Observable<Actividad> {
    return this.http.post<Actividad>(`${this.api}/actividades`, data);
  }

  actualizarActividad(id: number, data: Actividad): Observable<Actividad> {
    return this.http.put<Actividad>(`${this.api}/actividades/${id}`, data);
  }

  eliminarActividad(id: number): Observable<any> {
    return this.http.delete(`${this.api}/actividades/${id}`);
  }

  // ── Personal ESSALUD ──────────────────────────
  getPersonalEssalud(
    q = '',
    page = 1,
    limit = 50,
    red = '',
    regimen_laboral = '',
  ): Observable<ApiResponse<PersonalEssalud>> {
    const params = new HttpParams()
      .set('q', q)
      .set('page', String(page))
      .set('limit', String(limit))
      .set('red', red)
      .set('regimen_laboral', regimen_laboral);
    return this.http.get<ApiResponse<PersonalEssalud>>(`${this.api}/personal-essalud`, { params });
  }

  // Buscar por DNI para autocompletar formulario
  getPersonalPorDni(dni: string): Observable<PersonalEssalud> {
    return this.http.get<PersonalEssalud>(`${this.api}/personal-essalud/dni/${dni}`);
  }

  getDashboard(red = '', ejeTematico = '', anio = ''): Observable<any> {
    let params = new HttpParams();
    if (red) params = params.set('red', red);
    if (ejeTematico) params = params.set('eje_tematico', ejeTematico);
    if (anio) params = params.set('anio', anio);
    return this.http.get<any>(`${this.api}/dashboard`, { params });
  }

  // ── Documentos ────────────────────────────────
  getDocumentos(codigo_act: string): Observable<Documento[]> {
    const params = new HttpParams().set('codigo_act', codigo_act);
    return this.http.get<Documento[]>(`${this.api}/documentos`, { params });
  }

  subirDocumento(codigo_act: string, file: File): Observable<Documento> {
    const formData = new FormData();
    formData.append('codigo_act', codigo_act);
    formData.append('archivo', file);
    return this.http.post<Documento>(`${this.api}/documentos`, formData);
  }

  descargarDocumento(id: number): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.api}/documentos/${id}/descargar`);
  }

  eliminarDocumento(id: number): Observable<any> {
    return this.http.delete(`${this.api}/documentos/${id}`);
  }

  actualizarPersonal(file: File, actorNombre: string, actorRol: string): Observable<ResultadoActualizarPersonal> {
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('actor_nombre', actorNombre);
    formData.append('actor_rol', actorRol);
    return this.http.post<ResultadoActualizarPersonal>(`${this.api}/personal/actualizar`, formData);
  }

  getAlertasPersonal(codigoAct?: string, red?: string): Observable<AlertaPersonal[]> {
    let params = new HttpParams();
    if (codigoAct) params = params.set('codigo_act', codigoAct);
    if (red) params = params.set('red', red);
    return this.http.get<AlertaPersonal[]>(`${this.api}/personal/alertas`, { params });
  }

  resolverAlertaPersonal(id: number, actorNombre: string, motivo?: string): Observable<any> {
    return this.http.put(`${this.api}/personal/alertas/${id}/resolver`, {
      actor_nombre: actorNombre,
      motivo: motivo || '',
    });
  }
}
