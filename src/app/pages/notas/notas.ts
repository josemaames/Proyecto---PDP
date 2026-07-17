import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NotasService } from '../../services/notas.service';
import { CertificadoService } from '../../services/certificado.service';
import { CarpetasDriveService } from '../../services/carpetas-drive.service';
import { tieneRol } from '../../utils/roles.util';

@Component({
  selector: 'app-notas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notas.html',
  styleUrl: './notas.css',
})
export class Notas implements OnInit {
  private ns = inject(NotasService);
  private cert = inject(CertificadoService);
  private cds = inject(CarpetasDriveService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  carpetaDriveUrl: string | null = null;

  usuario: any = {};
  inicialUsuario = 'U';
  fechaHoy = '';
  mostrarPerfilMenu = false;
  esEjecutor = false;

  codigoAct = '';
  cargando = true;
  data: any = null;

  subiendo = false;
  mensaje = '';
  errorSubida = '';
  noEncontrados: any[] = [];

  ngOnInit(): void {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = (this.usuario?.nombre as string)?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
    this.esEjecutor = tieneRol(this.usuario, 'Ejecutor');
    this.codigoAct = this.route.snapshot.paramMap.get('codigo_act') || '';
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.ns.getResultados(this.codigoAct).subscribe({
      next: (d) => {
        this.data = d;
        this.cargando = false;
        if (d.red_asistencial) {
          this.cds.getPorRed(d.red_asistencial).subscribe({
            next: (c) => (this.carpetaDriveUrl = c.existe ? c.drive_url! : null),
          });
        }
      },
      error: () => { this.cargando = false; },
    });
  }

  abrirCarpetaDrive(): void {
    if (this.carpetaDriveUrl) window.open(this.carpetaDriveUrl, '_blank');
  }

  get puedeSubir(): boolean {
    return this.esEjecutor && !!this.data?.ventana?.puedeSubir;
  }

  async descargarPlantilla(): Promise<void> {
    if (!this.data) return;
    await this.ns.descargarPlantilla(this.codigoAct, this.data.nombre_actividad, this.data.participantes || []);
  }

  async onArchivo(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.subiendo = true;
    this.errorSubida = '';
    this.mensaje = '';
    this.noEncontrados = [];
    try {
      const notas = await this.ns.leerExcel(file);
      const validas = notas.filter((n) => n.nota !== null && n.nota !== undefined && n.nota !== '');
      if (!validas.length) {
        this.errorSubida = 'El archivo no tiene notas. Llena la columna "Nota" en la plantilla.';
        this.subiendo = false;
        input.value = '';
        return;
      }
      this.ns.guardarNotas(this.codigoAct, validas, this.usuario.nombre).subscribe({
        next: (r) => {
          this.subiendo = false;
          this.noEncontrados = r.noEncontrados || [];
          this.mensaje = `Notas guardadas: ${r.actualizados}${r.fueraPlazo ? ' — registrado FUERA DE PLAZO' : ''}.`;
          this.cargar();
        },
        error: (err) => {
          this.subiendo = false;
          this.errorSubida = err.error?.error || 'No se pudieron guardar las notas.';
        },
      });
    } catch {
      this.subiendo = false;
      this.errorSubida = 'No se pudo leer el archivo. Usa la plantilla descargada (.xlsx).';
    }
    input.value = '';
  }

  get aprobados(): any[] {
    return (this.data?.participantes || []).filter((p: any) => p.condicion === 'Aprobado');
  }

  private fechaCertificado(): string {
    return new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Certificado genérico en PDF — provisional para pruebas. En producción, cada
  // ejecutor diseña su propio certificado y lo sube manualmente a Drive (ver
  // abrirCarpetaDrive), así que este generador dejará de usarse.
  descargarCertificados(): void {
    const fecha = this.fechaCertificado();
    const datos = this.aprobados.map((p) => ({
      nombre: p.nombre, dni: p.dni, nota: p.nota, curso: this.data.nombre_actividad, fecha,
    }));
    if (!datos.length) return;
    this.cert.descargarCurso(datos, this.codigoAct);
  }

  descargarCertificado(p: any): void {
    const d = { nombre: p.nombre, dni: p.dni, nota: p.nota, curso: this.data.nombre_actividad, fecha: this.fechaCertificado() };
    this.cert.descargarIndividual(d);
  }

  get gradoDona(): string {
    const pct = this.data?.pctAprobacion || 0;
    return `conic-gradient(#16a34a 0% ${pct}%, #dc2626 ${pct}% 100%)`;
  }

  get maxBucket(): number {
    return Math.max(1, ...(this.data?.distribucion || []).map((b: any) => b.cantidad));
  }

  togglePerfilMenu(): void { this.mostrarPerfilMenu = !this.mostrarPerfilMenu; }
  cerrarSesion(): void { localStorage.removeItem('usuario'); this.router.navigate(['/login']); }
  volver(): void { this.router.navigate(['/expedientes']); }
}
