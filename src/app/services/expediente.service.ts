import { Injectable } from '@angular/core';
import { ExpedientePDP } from '../models/expediente-pdp.model';

@Injectable({
  providedIn: 'root',
})
export class ExpedienteService {
  // Datos de ejemplo - En producción vendrían de una API
  private expedientes: any[] = [
    {
      expediente: 'PDP-2026-001',
      capacitacion: 'Seguridad del Paciente',
      estado: 'Finalizado',
      responsable: 'Oficina Central',
      semaforo: 'verde',
      beneficiarios: 150,
      presupuesto: 25000,
    },
    {
      expediente: 'PDP-2026-002',
      capacitacion: 'Atención al Usuario',
      estado: 'Logística',
      responsable: 'Red Rebagliati',
      semaforo: 'amarillo',
      beneficiarios: 85,
      presupuesto: 18000,
    },
    {
      expediente: 'PDP-2026-003',
      capacitacion: 'Gestión Hospitalaria',
      estado: 'Convocatoria',
      responsable: 'Red Almenara',
      semaforo: 'rojo',
      beneficiarios: 120,
      presupuesto: 32000,
    },
    {
      expediente: 'PDP-2026-004',
      capacitacion: 'Resolución de Conflictos',
      estado: 'TDR',
      responsable: 'Oficina Central',
      semaforo: 'verde',
      beneficiarios: 95,
      presupuesto: 16000,
    },
    {
      expediente: 'PDP-2026-005',
      capacitacion: 'Tecnología Médica',
      estado: 'Finalizado',
      responsable: 'Red Vitarte',
      semaforo: 'verde',
      beneficiarios: 200,
      presupuesto: 45000,
    },
    {
      expediente: 'PDP-2026-006',
      capacitacion: 'Comunicación Efectiva',
      estado: 'Convocatoria',
      responsable: 'Red Rebagliati',
      semaforo: 'amarillo',
      beneficiarios: 110,
      presupuesto: 22000,
    },
  ];

  constructor() {}

  // Obtener todos los expedientes
  getExpedientes(): any[] {
    return this.expedientes;
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
  getEstadisticasPorResponsable(): { responsable: string; cantidad: number }[] {
    const responsables = new Map();

    this.expedientes.forEach((exp) => {
      const responsable = exp.responsable;
      responsables.set(responsable, (responsables.get(responsable) || 0) + 1);
    });

    return Array.from(responsables.entries()).map(([responsable, cantidad]) => ({
      responsable,
      cantidad,
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
      beneficiarios.set(
        estado,
        (beneficiarios.get(estado) || 0) + exp.beneficiarios,
      );
    });

    return Array.from(beneficiarios.entries()).map(([estado, beneficiarios]) => ({
      estado,
      beneficiarios,
    }));
  }
}
