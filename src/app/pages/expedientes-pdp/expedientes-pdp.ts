import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { PdpDataService, Actividad } from '../../services/pdp-data.service';

@Component({
  selector: 'app-expedientes-pdp',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './expedientes-pdp.html',
  styleUrl: './expedientes-pdp.css',
})
export class ExpedientesPdp implements OnInit {
  private pdpData = inject(PdpDataService);

  capacitaciones: Actividad[] = [];
  seleccionada: Actividad | null = null;

  busqueda   = '';
  filtrored  = '';
  filtroMod  = '';
  pagina     = 1;
  limit      = 20;
  total      = 0;
  cargando   = false;
  redFiltro  = '';

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  ngOnInit() {
    this.redFiltro = this.pdpData.getRedFiltro();
    this.cargar();
  }

  cargar() {
    this.cargando = true;
    const red = this.filtrored || this.redFiltro;
    this.pdpData.getActividades(this.busqueda, red, this.filtroMod, this.pagina, this.limit)
      .subscribe({
        next: (res) => {
          this.capacitaciones = res.data;
          this.total          = res.total;
          this.cargando       = false;
        },
        error: () => { this.cargando = false; }
      });
  }

  buscar() { this.pagina = 1; this.cargar(); }

  anterior() { if (this.pagina > 1) { this.pagina--; this.cargar(); } }
  siguiente() { if (this.pagina < this.totalPaginas) { this.pagina++; this.cargar(); } }

  ver(cap: Actividad) { this.seleccionada = cap; }
  cerrarModal() { this.seleccionada = null; }

  formatMoneda(v: number | undefined): string {
    if (v == null) return '—';
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
  }
}
