import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PresupuestoService, SolicitudPresupuesto } from '../../services/presupuesto.service';
import { rolesDe, tieneRol, normalizarRedKey } from '../../utils/roles.util';

interface RedPresupuesto {
  red: string;
  techo: number;
  ejecutado: number;
  saldo: number;
  pct: number;
}

@Component({
  selector: 'app-presupuesto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './presupuesto.html',
  styleUrl: './presupuesto.css',
})
export class Presupuesto implements OnInit {
  private ps = inject(PresupuestoService);
  private router = inject(Router);

  usuario: any = {};
  inicialUsuario = 'U';
  fechaHoy = '';
  mostrarPerfilMenu = false;
  esPresupuesto = false;
  esAdmin = false;
  tieneSectorista = false;

  cargando = true;
  redes: RedPresupuesto[] = [];
  misSolicitudes: SolicitudPresupuesto[] = [];
  pendientes: SolicitudPresupuesto[] = [];

  // Modal crear solicitud
  mostrarModal = false;
  enviando = false;
  errorModal = '';
  form = { tipo: 'aumento', red: '', red_destino: '', monto: null as number | null, motivo: '' };

  // Modal revisar (admin)
  mostrarRevisar = false;
  solicitudRevisar: SolicitudPresupuesto | null = null;
  respuestaRevisar = '';
  procesando = false;

  ngOnInit(): void {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuario?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
    this.esPresupuesto = tieneRol(this.usuario, 'Presupuesto');
    this.esAdmin = tieneRol(this.usuario, 'Administrador') || tieneRol(this.usuario, 'Administrativo');
    this.tieneSectorista = tieneRol(this.usuario, 'Sectorista');
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    forkJoin({
      techos: this.ps.getTechos(),
      resumen: this.ps.getResumenRedes(),
    }).subscribe({
      next: ({ techos, resumen }) => {
        this.redes = (techos || []).map((t) => {
          const match = (resumen || []).find((e) => normalizarRedKey(e.red) === normalizarRedKey(t.red));
          const techo = Number(t.techo) || 0;
          const ejecutado = Number(match?.presupuesto) || 0;
          const saldo = techo - ejecutado;
          const pct = techo > 0 ? Math.min(100, Math.round((ejecutado / techo) * 100)) : 0;
          return { red: t.red, techo, ejecutado, saldo, pct };
        });
        this.cargarSolicitudes();
      },
      error: () => { this.cargando = false; },
    });
  }

  cargarSolicitudes(): void {
    // Historial de cambios de presupuesto (visible para todos los que entran a la página)
    this.ps.getSolicitudes({}).subscribe({
      next: (s) => { this.misSolicitudes = s; this.cargando = false; },
      error: () => (this.cargando = false),
    });
  }

  get puedeModificar(): boolean {
    return this.esPresupuesto || this.esAdmin;
  }

  // ── Crear solicitud (rol Presupuesto) ──────────────
  abrirSolicitud(red: string, tipo = 'aumento'): void {
    this.form = { tipo, red, red_destino: '', monto: null, motivo: '' };
    this.errorModal = '';
    this.mostrarModal = true;
  }

  get otrasRedes(): RedPresupuesto[] {
    return this.redes.filter((r) => normalizarRedKey(r.red) !== normalizarRedKey(this.form.red));
  }

  enviarSolicitud(): void {
    this.errorModal = '';
    if (!this.form.monto || this.form.monto <= 0) { this.errorModal = 'Ingrese un monto válido.'; return; }
    if (this.form.tipo === 'reasignacion' && !this.form.red_destino) { this.errorModal = 'Seleccione la red destino.'; return; }
    this.enviando = true;
    this.ps.modificar({
      tipo: this.form.tipo,
      red: this.form.red,
      red_destino: this.form.tipo === 'reasignacion' ? this.form.red_destino : null,
      monto: this.form.monto,
      motivo: this.form.motivo,
      actor_dni: this.usuario.dni,
      actor_nombre: this.usuario.nombre,
    }).subscribe({
      next: () => {
        this.enviando = false;
        this.mostrarModal = false;
        this.cargar(); // recarga presupuestos (techo actualizado) + historial → se refleja al instante
      },
      error: (err) => {
        this.enviando = false;
        this.errorModal = err.error?.error || 'No se pudo aplicar el cambio.';
      },
    });
  }

  // ── Revisar (rol Administrador) ────────────────────
  abrirRevisar(s: SolicitudPresupuesto): void {
    this.solicitudRevisar = s;
    this.respuestaRevisar = '';
    this.mostrarRevisar = true;
  }

  decidir(decision: 'aprobado' | 'denegado'): void {
    if (!this.solicitudRevisar) return;
    this.procesando = true;
    this.ps.revisar(this.solicitudRevisar.id, {
      decision,
      revisor_dni: this.usuario.dni,
      revisor_nombre: this.usuario.nombre,
      respuesta: this.respuestaRevisar,
    }).subscribe({
      next: () => {
        this.procesando = false;
        this.mostrarRevisar = false;
        this.solicitudRevisar = null;
        this.cargar(); // recarga presupuestos (el techo pudo cambiar) + pendientes
      },
      error: (err) => {
        this.procesando = false;
        alert(err.error?.error || 'No se pudo procesar la solicitud.');
      },
    });
  }

  etiquetaTipo(t: string): string {
    return t === 'aumento' ? 'Aumento' : t === 'reduccion' ? 'Reducción' : 'Reasignación';
  }

  togglePerfilMenu(): void { this.mostrarPerfilMenu = !this.mostrarPerfilMenu; }
  irASectorista(): void { this.router.navigate(['/sectorista']); }
  cerrarSesion(): void { localStorage.removeItem('usuario'); this.router.navigate(['/login']); }
}
