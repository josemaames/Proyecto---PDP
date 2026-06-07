import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PdpDataService, PersonalEssalud } from '../../services/pdp-data.service';

@Component({
  selector: 'app-personal-pdp',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './personal-pdp.html',
  styleUrl: './personal-pdp.css',
})
export class PersonalPdp implements OnInit {
  private router  = inject(Router);
  private pdpData = inject(PdpDataService);

  usuario: any = {};
  fechaHoy = '';
  inicialUsuario = 'U';

  busqueda    = '';
  pagina      = 1;
  limit       = 50;
  totalRegistros = 0;
  cargando    = false;

  personal: PersonalEssalud[] = [];

  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.totalRegistros / this.limit));
  }

  ngOnInit() {
    this.usuario       = JSON.parse(localStorage.getItem('usuario') || '{}');
    this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';
    const f = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

    this.cargarPersonal();
  }

  cargarPersonal() {
    this.cargando = true;
    this.pdpData.getPersonalEssalud(this.busqueda, this.pagina, this.limit)
      .subscribe({
        next: (res) => {
          this.personal       = res.data;
          this.totalRegistros = res.total;
          this.cargando       = false;
        },
        error: (err) => {
          console.error('Error al cargar personal:', err);
          this.cargando = false;
        }
      });
  }

  buscar() {
    this.pagina = 1;
    this.cargarPersonal();
  }

  paginaAnterior() {
    if (this.pagina > 1) { this.pagina--; this.cargarPersonal(); }
  }

  paginaSiguiente() {
    if (this.pagina < this.totalPaginas) { this.pagina++; this.cargarPersonal(); }
  }

  irA(ruta: string) { this.router.navigate([ruta]); }

  cerrarSesion() {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
