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

  // ── Estadísticas ──────────────────────────────
  getStats(): Observable<Stats> {
    return this.http.get<Stats>(`${this.api}/stats`);
  }

  // ── Participantes ─────────────────────────────
  getParticipantes(q = '', codigo_act = '', page = 1, limit = 50): Observable<ApiResponse<Participante>> {
    const params = new HttpParams()
      .set('q', q)
      .set('codigo_act', codigo_act)
      .set('page', String(page))
      .set('limit', String(limit));
    return this.http.get<ApiResponse<Participante>>(`${this.api}/participantes`, { params });
  }

  crearParticipante(data: any): Observable<Participante> {
    return this.http.post<Participante>(`${this.api}/participantes`, data);
  }

  eliminarParticipante(id: number): Observable<any> {
    return this.http.delete(`${this.api}/participantes/${id}`);
  }

  // ── Actividades ───────────────────────────────
  getActividades(q = '', red = '', modalidad = '', page = 1, limit = 50): Observable<ApiResponse<Actividad>> {
    const params = new HttpParams()
      .set('q', q).set('red', red).set('modalidad', modalidad)
      .set('page', String(page)).set('limit', String(limit));
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
  getPersonalEssalud(q = '', page = 1, limit = 50): Observable<ApiResponse<PersonalEssalud>> {
    const params = new HttpParams()
      .set('q', q).set('page', String(page)).set('limit', String(limit));
    return this.http.get<ApiResponse<PersonalEssalud>>(`${this.api}/personal-essalud`, { params });
  }

  // Buscar por DNI para autocompletar formulario
  getPersonalPorDni(dni: string): Observable<PersonalEssalud> {
    return this.http.get<PersonalEssalud>(`${this.api}/personal-essalud/dni/${dni}`);
  }
}
