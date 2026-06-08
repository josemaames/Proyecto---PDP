import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ExpedientePDP } from '../models/expediente-pdp.model';

@Injectable({
  providedIn: 'root',
})
export class ExpedienteService {
  private readonly storageKey = 'expedientes';
  private readonly auditKey = 'historialEdiciones';

  private readonly nombreCampo: Record<string, string> = {
    capacitacion: 'Capacitación',
    estado: 'Estado',
    responsable: 'Responsable',
    sede: 'Sede',
    ejecutor: 'Ejecutor',
    semaforo: 'Semáforo',
    presupuesto: 'Presupuesto (S/)',
    beneficiarios: 'Beneficiarios',
    horasLectivas: 'Horas lectivas',
    horasCronologicas: 'Horas cronológicas',
  };

  private expedientes = [
    {
      expediente: 'PDP-2026-001',
      capacitacion: 'GOBIERNO DIGITAL EN LA GESTIÓN PÚBLICA',
      estado: 'Finalizado',
      responsable: 'Oficina Central',
      sede: 'Huancavelica',
      ejecutor: '22222222',
      semaforo: 'verde',
      beneficiarios: 30,
      presupuesto: 15000,
      horasLectivas: 24,
      horasCronologicas: 18,
    },
    {
      expediente: 'PDP-2026-002',
      capacitacion: 'DERECHO ADMINISTRATIVO Y SEGURIDAD SOCIAL',
      estado: 'Logística',
      responsable: 'Oficina Central',
      sede: 'Ica',
      ejecutor: '33333333',
      semaforo: 'amarillo',
      beneficiarios: 19,
      presupuesto: 5000,
      horasLectivas: 32,
      horasCronologicas: 24,
    },
    {
      expediente: 'PDP-2026-003',
      capacitacion: 'ARBITRAJE CON LA NUEVA LEY GENERAL DE CONTRATACIONES PUBLICAS',
      estado: 'Convocatoria',
      responsable: 'Oficina Central',
      sede: 'Ancash',
      ejecutor: '33333333',
      semaforo: 'rojo',
      beneficiarios: 19,
      presupuesto: 5000,
      horasLectivas: 32,
      horasCronologicas: 24,
    },
    {
      expediente: 'PDP-2026-004',
      capacitacion: 'REDACCION DE DOCUMENTOS TECNICOS',
      estado: 'TDR',
      responsable: 'Oficina Central',
      sede: 'Cusco',
      ejecutor: '22222222',
      semaforo: 'verde',
      beneficiarios: 33,
      presupuesto: 15000,
      horasLectivas: 18,
      horasCronologicas: 13.5,
    },
    {
      expediente: 'PDP-2026-005',
      capacitacion: 'TALLER EDUCACION INICIA: JUEGOS, INTERACCIONES Y PROYECTOS',
      estado: 'Finalizado',
      responsable: 'Oficina Central',
      sede: 'Apurimac',
      ejecutor: '44444444',
      semaforo: 'verde',
      beneficiarios: 37,
      presupuesto: 5000,
      horasLectivas: 24,
      horasCronologicas: 18,
    },
    {
      expediente: 'PDP-2026-006',
      capacitacion: 'GESTIÓN FINANCIERA EN INSTITUCIONES DE SEGURIDAD SOCIAL',
      estado: 'Convocatoria',
      responsable: 'Oficina Central',
      sede: 'Arequipa',
      ejecutor: '22222222',
      semaforo: 'amarillo',
      beneficiarios: 55,
      presupuesto: 10000,
      horasLectivas: 36,
      horasCronologicas: 24,
    },
  ];

  private expedientesSubject = new BehaviorSubject<any[]>(this.loadExpedientes());

  constructor() {
    this.saveExpedientes();
  }

  private loadExpedientes(): any[] {
    const expedientesGuardados = localStorage.getItem(this.storageKey);

    if (expedientesGuardados) {
      try {
        const guardados = JSON.parse(expedientesGuardados);
        this.expedientes = guardados;
        return guardados;
      } catch {
        return this.expedientes;
      }
    }

    return this.expedientes;
  }

  private saveExpedientes(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.expedientes));
    this.expedientesSubject.next([...this.expedientes]);
  }

  // Obtener todos los expedientes
  getExpedientes(): any[] {
    return [...this.expedientes];
  }

  getExpedientes$(): Observable<any[]> {
    return this.expedientesSubject.asObservable();
  }

  addExpediente(expediente: any): void {
    this.expedientes = [...this.expedientes, expediente];
    this.saveExpedientes();
    this.registrarAudit('Agregó', expediente.expediente, 'Nuevo expediente creado');
  }

  updateExpediente(expediente: any, originalExpediente?: string): void {
    const codigo = originalExpediente || expediente.expediente;
    const viejo = this.expedientes.find((e) => e.expediente === codigo);

    const v: any = viejo;
    const n: any = expediente;
    const diff = v
      ? Object.keys(this.nombreCampo)
          .filter((k) => String(v[k]) !== String(n[k]))
          .map((k) => `${this.nombreCampo[k]}: "${v[k]}" → "${n[k]}"`)
          .join(' | ')
      : '';

    this.expedientes = this.expedientes.map((item) =>
      item.expediente === codigo ? { ...item, ...expediente } : item,
    );
    this.saveExpedientes();
    this.registrarAudit('Editó', expediente.expediente, diff || 'Sin cambios detectados');
  }

  deleteExpediente(expedienteCodigo: string): void {
    this.expedientes = this.expedientes.filter((item) => item.expediente !== expedienteCodigo);
    this.saveExpedientes();
    this.registrarAudit('Eliminó', expedienteCodigo, 'Expediente eliminado del sistema');
  }

  private registrarAudit(accion: string, expediente: string, detalle: string): void {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    const ahora = new Date();
    const entrada = {
      timestamp: ahora.toISOString(),
      fecha: ahora.toLocaleDateString('es-PE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      hora: ahora.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      usuario: usuario.nombre || usuario.dni || 'Desconocido',
      dni: usuario.dni || '',
      rol: usuario.rol || '',
      accion,
      expediente,
      detalle,
    };
    const historial = this.getHistorial();
    historial.unshift(entrada);
    localStorage.setItem(this.auditKey, JSON.stringify(historial.slice(0, 300)));
  }

  getHistorial(): any[] {
    try {
      return JSON.parse(localStorage.getItem(this.auditKey) || '[]');
    } catch {
      return [];
    }
  }

  // Obtener estadísticas por estado
  getEstadisticasPorEstado(): { estado: string; cantidad: number }[] {
    const estados = new Map();

    this.expedientes.forEach((exp) => {
      const estado = exp.estado;
      estados.set(estado, (estados.get(estado) || 0) + 1);
    });

    return Array.from(estados.entries()).map(([estado, cantidad]) => ({
      estado,
      cantidad,
    }));
  }

  // Obtener estadísticas por responsable
  getEstadisticasPorResponsable(): {
    responsable: string;
    cantidad: number;
    beneficiarios: number;
    presupuesto: number;
  }[] {
    const responsables = new Map();

    this.expedientes.forEach((exp) => {
      const responsable = exp.responsable;
      const actual = responsables.get(responsable) || {
        cantidad: 0,
        beneficiarios: 0,
        presupuesto: 0,
      };

      responsables.set(responsable, {
        cantidad: actual.cantidad + 1,
        beneficiarios: actual.beneficiarios + (exp.beneficiarios || 0),
        presupuesto: actual.presupuesto + (exp.presupuesto || 0),
      });
    });

    return Array.from(responsables.entries()).map(([responsable, datos]) => ({
      responsable,
      cantidad: datos.cantidad,
      beneficiarios: datos.beneficiarios,
      presupuesto: datos.presupuesto,
    }));
  }

  // Obtener estadísticas de semáforo
  getEstadisticasSemaforo(): { color: string; cantidad: number }[] {
    const semaforoCounts = {
      verde: this.expedientes.filter((e) => e.semaforo === 'verde').length,
      amarillo: this.expedientes.filter((e) => e.semaforo === 'amarillo').length,
      rojo: this.expedientes.filter((e) => e.semaforo === 'rojo').length,
    };

    return [
      { color: 'Dentro del plazo', cantidad: semaforoCounts.verde },
      { color: 'Próximo a vencer', cantidad: semaforoCounts.amarillo },
      { color: 'Retrasado', cantidad: semaforoCounts.rojo },
    ];
  }

  // Obtener presupuesto total por estado
  getPresupuestoPorEstado(): { estado: string; presupuesto: number }[] {
    const presupuestos = new Map();

    this.expedientes.forEach((exp) => {
      const estado = exp.estado;
      presupuestos.set(estado, (presupuestos.get(estado) || 0) + exp.presupuesto);
    });

    return Array.from(presupuestos.entries()).map(([estado, presupuesto]) => ({
      estado,
      presupuesto,
    }));
  }

  // Obtener beneficiarios totales por estado
  getBeneficiariosPorEstado(): { estado: string; beneficiarios: number }[] {
    const beneficiarios = new Map();

    this.expedientes.forEach((exp) => {
      const estado = exp.estado;
      beneficiarios.set(estado, (beneficiarios.get(estado) || 0) + exp.beneficiarios);
    });

    return Array.from(beneficiarios.entries()).map(([estado, beneficiarios]) => ({
      estado,
      beneficiarios,
    }));
  }

  getExpedientesPorRol(): any[] {
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

    const expedientes = this.getExpedientes();

    // ADMIN
    if (usuario.rol === 'Administrador' || usuario.rol === 'Administrativo') {
      return expedientes;
    }

    // SECTORISTA
    if (usuario.rol === 'Sectorista') {
      console.log('SEDES DEL USUARIO:', usuario.sedes);

      expedientes.forEach((e) => {
        console.log(e.expediente, e.sede, usuario.sedes?.includes(e.sede));
      });

      return expedientes.filter((e) => usuario.sedes?.includes(e.sede));
    }
    // EJECUTOR
    if (usuario.rol === 'Ejecutor') {
      return expedientes.filter((e) => e.ejecutor === usuario.dni);
    }

    return [];
  }
}
