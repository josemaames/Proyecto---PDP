import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface NotasStats {
  total: number;
  aprobados: number;
  desaprobados: number;
  promedio: number;
  pctAprobacion: number;
  porRed: { red: string; total: number; aprobados: number; desaprobados: number }[];
  porCapacitacion: { codigo_act: string; nombre_actividad: string; total: number; aprobados: number; desaprobados: number }[];
  porSexo: { sexo: string; total: number; aprobados: number; desaprobados: number }[];
  distribucion: { rango: string; cantidad: number }[];
  capacitacionesDisponibles: { codigo_act: string; nombre_actividad: string }[];
}

@Injectable({ providedIn: 'root' })
export class NotasStatsService {
  private http = inject(HttpClient);

  getStats(filtros: { red?: string; codigo_act?: string; sexo?: string } = {}): Observable<NotasStats> {
    const p = new URLSearchParams();
    if (filtros.red) p.set('red', filtros.red);
    if (filtros.codigo_act) p.set('codigo_act', filtros.codigo_act);
    if (filtros.sexo) p.set('sexo', filtros.sexo);
    const qs = p.toString();
    return this.http.get<NotasStats>('/api/notas/stats' + (qs ? `?${qs}` : ''));
  }
}
