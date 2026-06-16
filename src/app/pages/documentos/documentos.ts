import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PdpDataService, Documento } from '../../services/pdp-data.service';

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './documentos.html',
  styleUrl: './documentos.css',
})
export class Documentos implements OnInit {
  private router = inject(Router);
  private pdpData = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  codigoAct = '';
  documentos: Documento[] = [];
  cargando = false;
  buscado = false;

  archivoSeleccionado: File | null = null;
  subiendo = false;
  errorSubida = '';

  // ── Ciclo de vida ─────────────────────────────
  ngOnInit() {
    this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);
  }

  // ── Búsqueda ──────────────────────────────────
  buscar() {
    if (!this.codigoAct.trim()) return;
    this.cargando = true;
    this.buscado = true;
    this.pdpData.getDocumentos(this.codigoAct.trim()).subscribe({
      next: (res) => {
        this.documentos = res;
        this.cargando = false;
      },
      error: (err) => {
        console.error('Error al cargar documentos:', err);
        this.cargando = false;
      },
    });
  }

  // ── Subida ────────────────────────────────────
  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    this.archivoSeleccionado = input.files?.[0] || null;
    this.errorSubida = '';
  }

  subirArchivo() {
    if (!this.codigoAct.trim()) {
      this.errorSubida = 'Ingresa un código de actividad antes de subir un archivo.';
      return;
    }
    if (!this.archivoSeleccionado) {
      this.errorSubida = 'Selecciona un archivo (PDF, Word o Excel).';
      return;
    }

    this.subiendo = true;
    this.errorSubida = '';
    this.pdpData.subirDocumento(this.codigoAct.trim(), this.archivoSeleccionado).subscribe({
      next: () => {
        this.subiendo = false;
        this.archivoSeleccionado = null;
        const inputEl = document.getElementById('archivoInput') as HTMLInputElement;
        if (inputEl) inputEl.value = '';
        this.buscar();
      },
      error: (err) => {
        this.subiendo = false;
        this.errorSubida = 'Error al subir: ' + (err.error?.error || err.message);
      },
    });
  }

  // ── Descarga ──────────────────────────────────
  descargar(doc: Documento) {
    if (!doc.id) return;
    this.pdpData.descargarDocumento(doc.id).subscribe({
      next: (res) => {
        window.open(res.url, '_blank');
      },
      error: (err) => {
        console.error('Error al descargar:', err);
        alert('No se pudo generar el enlace de descarga.');
      },
    });
  }

  // ── Eliminación ───────────────────────────────
  eliminar(doc: Documento) {
    if (!doc.id) return;
    if (!confirm(`¿Eliminar el documento "${doc.nombre_archivo}"?`)) return;
    this.pdpData.eliminarDocumento(doc.id).subscribe(() => this.buscar());
  }

  // ── Utilidades ────────────────────────────────
  iconoArchivo(tipo: string | undefined): string {
    if (!tipo) return '📄';
    if (tipo.includes('pdf')) return '📕';
    if (tipo.includes('word') || tipo.includes('msword') || tipo.includes('officedocument.wordprocessingml')) return '📘';
    if (tipo.includes('excel') || tipo.includes('spreadsheetml') || tipo.includes('ms-excel')) return '📗';
    return '📄';
  }

  formatearTamano(kb: number | undefined): string {
    if (!kb) return '—';
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  formatearFecha(fecha: string | undefined): string {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ── Navegación ────────────────────────────────
  irA(ruta: string) {
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
