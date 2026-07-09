import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SolicitudPresupuesto {
  id: number;
  tipo: 'aumento' | 'reduccion' | 'reasignacion';
  red: string;
  red_destino?: string | null;
  monto: number;
  motivo?: string;
  estado: 'pendiente' | 'aprobado' | 'denegado';
  solicitante_dni?: string;
  solicitante_nombre?: string;
  revisor_nombre?: string;
  respuesta?: string;
  created_at?: string;
  resolved_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PresupuestoService {
  private http = inject(HttpClient);

  getTechos(): Observable<any[]> {
    return this.http.get<any[]>('/api/presupuesto-redes');
  }

  getResumenRedes(): Observable<any[]> {
    return this.http.get<any[]>('/api/resumen-redes');
  }

  crearSolicitud(body: {
    tipo: string;
    red: string;
    red_destino?: string | null;
    monto: number;
    motivo?: string;
    solicitante_dni?: string;
    solicitante_nombre?: string;
  }): Observable<SolicitudPresupuesto> {
    return this.http.post<SolicitudPresupuesto>('/api/solicitudes-presupuesto', body);
  }

  getSolicitudes(opts: { estado?: string; solicitante_dni?: string } = {}): Observable<SolicitudPresupuesto[]> {
    const p = new URLSearchParams();
    if (opts.estado) p.set('estado', opts.estado);
    if (opts.solicitante_dni) p.set('solicitante_dni', opts.solicitante_dni);
    const qs = p.toString();
    return this.http.get<SolicitudPresupuesto[]>('/api/solicitudes-presupuesto' + (qs ? `?${qs}` : ''));
  }

  revisar(id: number, body: { decision: string; revisor_dni?: string; revisor_nombre?: string; respuesta?: string }): Observable<SolicitudPresupuesto> {
    return this.http.put<SolicitudPresupuesto>(`/api/solicitudes-presupuesto/${id}/revisar`, body);
  }

  /** Modifica el presupuesto directamente (sin aprobación). */
  modificar(body: {
    tipo: string;
    red: string;
    red_destino?: string | null;
    monto: number;
    motivo?: string;
    actor_dni?: string;
    actor_nombre?: string;
  }): Observable<any> {
    return this.http.post<any>('/api/presupuesto/modificar', body);
  }
}
