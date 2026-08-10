import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CarpetasDriveService } from '../../services/carpetas-drive.service';
import { PresupuestoService } from '../../services/presupuesto.service';
import { TopMenu } from '../../components/top-menu/top-menu';

interface FilaCarpeta {
  red: string;
  drive_url: string;
  actualizado_por?: string;
  actualizado_at?: string;
  editando: boolean;
  borrador: string;
}

@Component({
  selector: 'app-carpetas-drive',
  standalone: true,
  imports: [CommonModule, FormsModule, TopMenu],
  templateUrl: './carpetas-drive.html',
  styleUrl: './carpetas-drive.css',
})
export class CarpetasDrive implements OnInit {
  private cds = inject(CarpetasDriveService);
  private ps = inject(PresupuestoService);
  private router = inject(Router);

  usuario: any = {};
  inicialUsuario = 'U';
  fechaHoy = '';
  mostrarPerfilMenu = false;

  cargando = true;
  filas: FilaCarpeta[] = [];
  guardandoRed = '';

  ngOnInit(): void {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuario?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    forkJoin({
      redes: this.ps.getTechos(),
      carpetas: this.cds.getTodas(),
    }).subscribe({
      next: ({ redes, carpetas }) => {
        const mapaCarpetas = new Map(carpetas.map((c) => [c.red, c]));
        this.filas = redes
          .map((r) => {
            const c = mapaCarpetas.get(r.red);
            return {
              red: r.red,
              drive_url: c?.drive_url || '',
              actualizado_por: c?.actualizado_por,
              actualizado_at: c?.actualizado_at,
              editando: false,
              borrador: c?.drive_url || '',
            };
          })
          .sort((a, b) => a.red.localeCompare(b.red));
        this.cargando = false;
      },
      error: () => (this.cargando = false),
    });
  }

  editar(fila: FilaCarpeta): void {
    fila.borrador = fila.drive_url;
    fila.editando = true;
  }

  cancelar(fila: FilaCarpeta): void {
    fila.editando = false;
    fila.borrador = fila.drive_url;
  }

  guardar(fila: FilaCarpeta): void {
    const url = fila.borrador.trim();
    if (!url) {
      alert('Ingresa un link de Drive válido.');
      return;
    }
    this.guardandoRed = fila.red;
    this.cds.guardar(fila.red, url, this.usuario.nombre).subscribe({
      next: (r) => {
        fila.drive_url = r.drive_url;
        fila.actualizado_por = r.actualizado_por;
        fila.actualizado_at = r.actualizado_at;
        fila.editando = false;
        this.guardandoRed = '';
      },
      error: (err) => {
        this.guardandoRed = '';
        alert(err.error?.error || 'No se pudo guardar el link.');
      },
    });
  }

  abrir(fila: FilaCarpeta): void {
    if (fila.drive_url) window.open(fila.drive_url, '_blank');
  }

  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  togglePerfilMenu() {
    this.mostrarPerfilMenu = !this.mostrarPerfilMenu;
  }

  volverSomos() {
    window.location.replace('http://localhost:4200/somosessalud/');
  }
}
