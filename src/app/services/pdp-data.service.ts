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
  getStats(red = ''): Observable<Stats> {
    const params = red ? new HttpParams().set('red', red) : new HttpParams();
    return this.http.get<Stats>(`${this.api}/stats`, { params });
  }

  getResumenRedes(redes = ''): Observable<ResumenRed[]> {
    const params = redes ? new HttpParams().set('redes', redes) : new HttpParams();
    return this.http.get<ResumenRed[]>(`${this.api}/resumen-redes`, { params });
  }

  // ── Participantes ─────────────────────────────
  getParticipantes(
    q = '',
    codigo_act = '',
    page = 1,
    limit = 50,
    red = '',
  ): Observable<ApiResponse<Participante>> {
    const params = new HttpParams()
      .set('q', q)
      .set('codigo_act', codigo_act)
      .set('page', String(page))
      .set('limit', String(limit))
      .set('red', red);
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
  ): Observable<ApiResponse<Actividad>> {
    const params = new HttpParams()
      .set('q', q)
      .set('red', red)
      .set('modalidad', modalidad)
      .set('page', String(page))
      .set('limit', String(limit));
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
  ): Observable<ApiResponse<PersonalEssalud>> {
    const params = new HttpParams()
      .set('q', q)
      .set('page', String(page))
      .set('limit', String(limit))
      .set('red', red);
    return this.http.get<ApiResponse<PersonalEssalud>>(`${this.api}/personal-essalud`, { params });
  }

  // Buscar por DNI para autocompletar formulario
  getPersonalPorDni(dni: string): Observable<PersonalEssalud> {
    return this.http.get<PersonalEssalud>(`${this.api}/personal-essalud/dni/${dni}`);
  }

  getDashboard(red = ''): Observable<any> {
    const params = red ? new HttpParams().set('red', red) : new HttpParams();

    return this.http.get<any>(`${this.api}/dashboard`, { params });
  }
}
