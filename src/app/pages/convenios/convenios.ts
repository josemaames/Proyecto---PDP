import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ConveniosService,
  ConvenioMarco,
  ConvenioEspecifico,
  ConvenioDocumento,
  KpiConvenios,
  Contraprestacion,
  ContraprestacionResumen,
} from '../../services/convenios.service';
import { tieneRol } from '../../utils/roles.util';

@Component({
  selector: 'app-convenios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './convenios.html',
  styleUrl: './convenios.css',
})
export class Convenios implements OnInit {
  private cs = inject(ConveniosService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  usuario: any = {};
  inicialUsuario = 'U';
  fechaHoy = '';
  mostrarPerfilMenu = false;

  esAdmin = false;
  esConvenios = false;
  tieneSectorista = false;

  cargando = true;
  busqueda = '';
  filtroTipo: '' | 'Universidad' | 'Instituto' = '';
  kpis: { marco: KpiConvenios; especifico: KpiConvenios } | null = null;
  marcos: ConvenioMarco[] = [];

  // Dashboard por convenio
  dashboardPorMarco = new Map<number, any>();

  marcosExpandidos = new Set<number>();
  especificosPorMarco = new Map<number, ConvenioEspecifico[]>();
  especificosExpandidos = new Set<number>();
  documentosPorConvenio = new Map<string, ConvenioDocumento[]>();
  subiendoDoc = new Set<string>();

  // Contraprestaciones (informe memoria) por marco — solo informativo, no toca presupuestos.
  contraprestacionesPorMarco = new Map<
    number,
    {
      data: Contraprestacion[];
      resumen: ContraprestacionResumen[];
      total: number;
      totalValorizado: number;
    }
  >();
  subiendoContraprestaciones = new Set<number>();
  errorContraprestaciones = new Map<number, string>();

  // ───────── Modal editar institución ─────────

  mostrarModalInstitucion = false;

  marcoEditar = 0;

  redEditar = '';

  contraprestacionesEditar: any[] = [];

  // ======================================
  // Modal de mensajes
  // ======================================

  mostrarMensaje = false;

  tituloMensaje = '';

  textoMensaje = '';

  tipoMensaje: 'success' | 'error' = 'success';

  // Modal convenio marco
  mostrarModalMarco = false;
  editandoMarco: ConvenioMarco | null = null;
  formMarco: {
    universidad: string;
    numero_convenio: string;
    objeto: string;
    fecha_inicio: string;
    fecha_fin: string;
    tipo: 'Universidad' | 'Instituto';
    sede_principal: string;
  } = {
    universidad: '',
    numero_convenio: '',
    objeto: '',
    fecha_inicio: '',
    fecha_fin: '',
    tipo: 'Universidad',
    sede_principal: '',
  };
  errorMarco = '';
  guardandoMarco = false;

  // Modal convenio específico
  mostrarModalEspecifico = false;
  editandoEspecifico: ConvenioEspecifico | null = null;
  marcoParaEspecifico: ConvenioMarco | null = null;
  formEspecifico = { nombre: '', numero_convenio: '', fecha_inicio: '', fecha_fin: '' };
  errorEspecifico = '';
  guardandoEspecifico = false;

  // Modal carga masiva Excel
  mostrarModalExcel = false;
  archivoExcel: File | null = null;
  subiendoExcel = false;
  errorExcel = '';
  resultadoExcel: {
    marcosCreados: number;
    especificosCreados: number;
    duplicados: number;
    errores: string[];
  } | null = null;

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

    this.esAdmin =
      tieneRol(this.usuario, 'Administrador') || tieneRol(this.usuario, 'Administrativo');
    this.esConvenios = tieneRol(this.usuario, 'Convenios');
    this.tieneSectorista = tieneRol(this.usuario, 'Sectorista');

    this.cargar();
  }

  get puedeGestionar(): boolean {
    return this.esAdmin || this.esConvenios;
  }

  cargar(): void {
    this.cargando = true;
    this.cs.getKpis().subscribe({ next: (k) => (this.kpis = k), error: () => {} });
    this.cs.getMarcos(this.busqueda).subscribe({
      next: (m) => {
        this.marcos = m;
        this.cargando = false;
      },
      error: () => (this.cargando = false),
    });
  }

  // Recarga solo la lista (sin tocar `cargando`) para no ocultar la barra de
  // búsqueda mientras el usuario sigue escribiendo — evita perder el foco del input.
  private recargarLista(): void {
    this.cs.getMarcos(this.busqueda).subscribe({ next: (m) => (this.marcos = m), error: () => {} });
  }

  private buscarTimer: any;
  buscar(): void {
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => this.recargarLista(), 300);
  }

  get marcosFiltrados(): ConvenioMarco[] {
    return this.filtroTipo ? this.marcos.filter((m) => m.tipo === this.filtroTipo) : this.marcos;
  }

  etiquetaVigencia(v: string): string {
    switch (v) {
      case 'vigente':
        return 'Vigente';
      case 'por_vencer':
        return 'Por vencer';
      case 'vencido':
        return 'Vencido';
      default:
        return 'Sin fecha';
    }
  }

  // ── Expandir / colapsar ──────────────────────────
  toggleMarco(m: ConvenioMarco): void {
    if (this.marcosExpandidos.has(m.id)) {
      this.marcosExpandidos.delete(m.id);
      return;
    }

    this.marcosExpandidos.add(m.id);

    this.cargarDashboard(m.id);

    this.cargarEspecificos(m.id);

    this.cargarDocumentos('marco', m.id);

    this.cargarContraprestaciones(m.id);
  }

  // ── Contraprestaciones (informe memoria) ─────────
  // Estructura real del informe: RED > año (PLAN <año>), cerrando cada año con
  // un "SUBTOTAL <año>" y cada red con un "TOTAL DEL COMPROMISO CONTRAPRESTACIONAL".
  // Esos subtotales/totales se muestran tal como vienen declarados en el Excel
  // (tabla `resumen`), no recalculados, para que coincidan con el documento original.
  cargarContraprestaciones(marcoId: number): void {
    this.cs.getContraprestaciones(marcoId).subscribe({
      next: (r) => this.contraprestacionesPorMarco.set(marcoId, r),
      error: () =>
        this.contraprestacionesPorMarco.set(marcoId, {
          data: [],
          resumen: [],
          total: 0,
          totalValorizado: 0,
        }),
    });
  }

  contraprestacionesDe(marcoId: number) {
    return this.contraprestacionesPorMarco.get(marcoId) || null;
  }

  // Filtros de red/año dentro de la tabla de contraprestaciones (uno por marco expandido).
  filtroRedContrap = new Map<number, string>();
  filtroAnioContrap = new Map<number, string>();

  filtroRedDe(marcoId: number): string {
    return this.filtroRedContrap.get(marcoId) || '';
  }

  filtroAnioDe(marcoId: number): string {
    return this.filtroAnioContrap.get(marcoId) || '';
  }

  setFiltroRed(marcoId: number, valor: string): void {
    this.filtroRedContrap.set(marcoId, valor);
  }

  setFiltroAnio(marcoId: number, valor: string): void {
    this.filtroAnioContrap.set(marcoId, valor);
  }

  limpiarFiltrosContrap(marcoId: number): void {
    this.filtroRedContrap.delete(marcoId);
    this.filtroAnioContrap.delete(marcoId);
  }

  hayFiltrosContrap(marcoId: number): boolean {
    return !!this.filtroRedDe(marcoId) || !!this.filtroAnioDe(marcoId);
  }

  redesDe(marcoId: number): string[] {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    if (!r) return [];
    return Array.from(new Set(r.data.map((c) => c.unidad_organica || 'Sin red'))).sort();
  }

  // Todos los años presentes en el informe de esa universidad (para el filtro).
  aniosDe(marcoId: number): string[] {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    if (!r) return [];
    return Array.from(new Set(r.data.map((c) => c.plan_anio || 'Sin año'))).sort();
  }

  // Redes a mostrar respetando los filtros activos (por red y/o por año).
  redesVisibles(marcoId: number): string[] {
    const filtroRed = this.filtroRedDe(marcoId);
    const base = filtroRed
      ? this.redesDe(marcoId).filter((r) => r === filtroRed)
      : this.redesDe(marcoId);
    return base.filter((red) => this.aniosVisiblesDeRed(marcoId, red).length > 0);
  }

  aniosDeRed(marcoId: number, red: string): string[] {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    if (!r) return [];
    const anios = new Set(
      r.data
        .filter((c) => (c.unidad_organica || 'Sin red') === red)
        .map((c) => c.plan_anio || 'Sin año'),
    );
    return Array.from(anios).sort();
  }

  // Años de esa red a mostrar respetando el filtro de año activo.
  aniosVisiblesDeRed(marcoId: number, red: string): string[] {
    const filtroAnio = this.filtroAnioDe(marcoId);
    const anios = this.aniosDeRed(marcoId, red);
    return filtroAnio ? anios.filter((a) => a === filtroAnio) : anios;
  }

  itemsDeRedAnio(marcoId: number, red: string, anio: string): Contraprestacion[] {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    if (!r) return [];
    return r.data.filter(
      (c) => (c.unidad_organica || 'Sin red') === red && (c.plan_anio || 'Sin año') === anio,
    );
  }

  // Subtotal declarado en el Excel para esa red+año; si no vino en el archivo, se calcula.
  subtotalRedAnio(marcoId: number, red: string, anio: string): number {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    const declarado = r?.resumen.find(
      (x) => x.tipo === 'subtotal' && x.red === red && x.anio === anio,
    );
    if (declarado?.monto != null) return Number(declarado.monto);
    return this.itemsDeRedAnio(marcoId, red, anio).reduce(
      (s, c) => s + (Number(c.valorizacion) || 0),
      0,
    );
  }

  // Total declarado del "COMPROMISO CONTRAPRESTACIONAL" de esa red (todos sus años).
  totalRed(marcoId: number, red: string): number {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    const declarado = r?.resumen.find((x) => x.tipo === 'total_red' && x.red === red);
    if (declarado?.monto != null) return Number(declarado.monto);
    return this.aniosDeRed(marcoId, red).reduce(
      (s, a) => s + this.subtotalRedAnio(marcoId, red, a),
      0,
    );
  }

  // Total general declarado ("TOTAL DEL COMPROMISO ESSALUD") de toda la universidad.
  totalGeneral(marcoId: number): number {
    const r = this.contraprestacionesPorMarco.get(marcoId);
    return r?.totalValorizado || 0;
  }

  descargarPlantillaContraprestaciones(m: ConvenioMarco): void {
    this.cs.descargarPlantillaContraprestaciones(m.universidad);
  }

  onArchivoContraprestaciones(event: Event, marcoId: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.errorContraprestaciones.delete(marcoId);
    this.subiendoContraprestaciones.add(marcoId);
    this.cs.cargarContraprestacionesExcel(marcoId, file, this.usuario?.nombre || '').subscribe({
      next: () => {
        this.subiendoContraprestaciones.delete(marcoId);
        this.cargarContraprestaciones(marcoId);
        input.value = '';
      },
      error: (err) => {
        this.subiendoContraprestaciones.delete(marcoId);
        this.errorContraprestaciones.set(
          marcoId,
          err.error?.error || 'No se pudo procesar el archivo.',
        );
        input.value = '';
      },
    });
  }

  cargarDashboard(marcoId: number): void {
    // Si ya se cargó, no volver a consultar
    if (this.dashboardPorMarco.has(marcoId)) {
      return;
    }

    this.cs.getDashboardConvenio(marcoId).subscribe({
      next: (data: any) => {
        this.dashboardPorMarco.set(marcoId, data);
      },

      error: (err: any) => {
        console.error('Error cargando dashboard', err);
      },
    });
  }

  estaSubiendoContraprestaciones(marcoId: number): boolean {
    return this.subiendoContraprestaciones.has(marcoId);
  }

  marcoEstaExpandido(id: number): boolean {
    return this.marcosExpandidos.has(id);
  }

  cargarEspecificos(marcoId: number): void {
    this.cs.getEspecificos(marcoId).subscribe({
      next: (e) => this.especificosPorMarco.set(marcoId, e),
      error: () => this.especificosPorMarco.set(marcoId, []),
    });
  }

  especificosDe(marcoId: number): ConvenioEspecifico[] {
    return this.especificosPorMarco.get(marcoId) || [];
  }

  toggleEspecifico(e: ConvenioEspecifico): void {
    if (this.especificosExpandidos.has(e.id)) {
      this.especificosExpandidos.delete(e.id);
      return;
    }
    this.especificosExpandidos.add(e.id);
    this.cargarDocumentos('especifico', e.id);
  }

  especificoEstaExpandido(id: number): boolean {
    return this.especificosExpandidos.has(id);
  }

  abrirEditarInstitucion(marcoId: number, red: string): void {
    this.marcoEditar = marcoId;

    this.redEditar = red;

    const cp = this.contraprestacionesDe(marcoId);

    if (!cp) {
      this.contraprestacionesEditar = [];
      return;
    }

    // Copia profunda para no modificar la grilla principal
    this.contraprestacionesEditar = cp.data
      .filter((c) => c.unidad_organica === red)
      .map((c) => ({
        ...c,
      }));

    this.mostrarModalInstitucion = true;
  }

  cerrarModalInstitucion(): void {
    this.mostrarModalInstitucion = false;

    this.contraprestacionesEditar = [];
  }

  guardarInstitucion(): void {
    this.cs.guardarContraprestaciones(this.marcoEditar, this.contraprestacionesEditar).subscribe({
      next: () => {
        this.abrirMensaje(
          'Contraprestaciones actualizadas',
          'La información fue guardada correctamente.',
          'success',
        );

        this.cerrarModalInstitucion();

        // Recargar contraprestaciones
        this.cargarContraprestaciones(this.marcoEditar);

        // Volver a cargar el dashboard
        this.dashboardPorMarco.delete(this.marcoEditar);

        this.cargarDashboard(this.marcoEditar);
      },

      error: (err) => {
        console.error('ERROR COMPLETO');

        console.error(err);

        console.error(err.error);

        console.error(err.status);

        console.error(err.message);

        alert(JSON.stringify(err.error));
      },
    });
  }

  abrirMensaje(titulo: string, texto: string, tipo: 'success' | 'error' = 'success'): void {
    this.tituloMensaje = titulo;

    this.textoMensaje = texto;

    this.tipoMensaje = tipo;

    this.mostrarMensaje = true;
  }

  cerrarMensaje(): void {
    this.mostrarMensaje = false;

    this.tituloMensaje = '';

    this.textoMensaje = '';

    this.tipoMensaje = 'success';
  }

  agrupadasPorPlan(): { plan: string; items: any[] }[] {
    const grupos = new Map<string, any[]>();

    for (const c of this.contraprestacionesEditar) {
      const plan = c.plan_anio || 'Sin plan';

      if (!grupos.has(plan)) {
        grupos.set(plan, []);
      }

      grupos.get(plan)!.push(c);
    }

    return Array.from(grupos.entries())
      .map(([plan, items]) => ({ plan, items }))
      .sort((a, b) => a.plan.localeCompare(b.plan));
  }

  itemsDeRed(marcoId: number, red: string) {
    const cp = this.contraprestacionesDe(marcoId);

    if (!cp) return [];

    return cp.data.filter((c) => c.unidad_organica === red);
  }

  // ── Documentos ────────────────────────────────────
  claveDoc(tipo: 'marco' | 'especifico', id: number): string {
    return `${tipo}|${id}`;
  }

  cargarDocumentos(tipo: 'marco' | 'especifico', id: number): void {
    this.cs.getDocumentos(tipo, id).subscribe({
      next: (docs) => this.documentosPorConvenio.set(this.claveDoc(tipo, id), docs),
      error: () => this.documentosPorConvenio.set(this.claveDoc(tipo, id), []),
    });
  }

  documentosDe(tipo: 'marco' | 'especifico', id: number): ConvenioDocumento[] {
    return this.documentosPorConvenio.get(this.claveDoc(tipo, id)) || [];
  }

  onArchivoDoc(event: Event, tipo: 'marco' | 'especifico', id: number): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Solo se aceptan archivos PDF.');
      input.value = '';
      return;
    }
    const clave = this.claveDoc(tipo, id);
    this.subiendoDoc.add(clave);
    this.cs.subirDocumento(tipo, id, file, this.usuario?.nombre || '').subscribe({
      next: () => {
        this.subiendoDoc.delete(clave);
        this.cargarDocumentos(tipo, id);
        input.value = '';
      },
      error: (err) => {
        this.subiendoDoc.delete(clave);
        alert(err.error?.error || 'No se pudo subir el documento.');
        input.value = '';
      },
    });
  }

  estaSubiendoDoc(tipo: 'marco' | 'especifico', id: number): boolean {
    return this.subiendoDoc.has(this.claveDoc(tipo, id));
  }

  descargarDoc(doc: ConvenioDocumento): void {
    this.cs.descargarDocumento(doc.id).subscribe({
      next: (r) => window.open(r.url, '_blank'),
      error: () => alert('No se pudo obtener el archivo.'),
    });
  }

  eliminarDoc(doc: ConvenioDocumento): void {
    if (!confirm(`¿Eliminar el documento "${doc.nombre_archivo}"?`)) return;
    this.cs.eliminarDocumento(doc.id).subscribe(() => {
      this.cargarDocumentos(doc.convenio_tipo, doc.convenio_id);
    });
  }

  // ── Convenio marco: crear / editar / eliminar ────
  abrirNuevoMarco(): void {
    this.editandoMarco = null;
    this.formMarco = {
      universidad: '',
      numero_convenio: '',
      objeto: '',
      fecha_inicio: '',
      fecha_fin: '',
      tipo: 'Universidad',
      sede_principal: '',
    };
    this.errorMarco = '';
    this.mostrarModalMarco = true;
  }

  abrirEditarMarco(m: ConvenioMarco): void {
    this.editandoMarco = m;
    this.formMarco = {
      universidad: m.universidad,
      numero_convenio: m.numero_convenio || '',
      objeto: m.objeto || '',
      fecha_inicio: m.fecha_inicio ? m.fecha_inicio.substring(0, 10) : '',
      fecha_fin: m.fecha_fin ? m.fecha_fin.substring(0, 10) : '',
      tipo: m.tipo || 'Universidad',
      sede_principal: m.sede_principal || '',
    };
    this.errorMarco = '';
    this.mostrarModalMarco = true;
  }

  cerrarModalMarco(): void {
    this.mostrarModalMarco = false;
    this.editandoMarco = null;
  }

  guardarMarco(): void {
    if (!this.formMarco.universidad.trim()) {
      this.errorMarco = 'La universidad es obligatoria.';
      return;
    }
    this.guardandoMarco = true;
    const body = {
      ...this.formMarco,
      created_by: this.usuario?.nombre,
      actor_nombre: this.usuario?.nombre,
    };
    const obs = this.editandoMarco
      ? this.cs.actualizarMarco(this.editandoMarco.id, body)
      : this.cs.crearMarco(body);
    obs.subscribe({
      next: () => {
        this.guardandoMarco = false;
        this.cerrarModalMarco();
        this.cargar();
      },
      error: (err) => {
        this.guardandoMarco = false;
        this.errorMarco = err.error?.error || 'No se pudo guardar el convenio marco.';
      },
    });
  }

  eliminarMarco(m: ConvenioMarco): void {
    if (!confirm(`¿Eliminar el convenio marco con ${m.universidad}?`)) return;
    this.cs.eliminarMarco(m.id).subscribe({
      next: () => this.cargar(),
      error: (err) => alert(err.error?.error || 'No se pudo eliminar.'),
    });
  }

  // ── Convenio específico: crear / editar / eliminar ─
  abrirNuevoEspecifico(marco: ConvenioMarco): void {
    this.marcoParaEspecifico = marco;
    this.editandoEspecifico = null;
    this.formEspecifico = { nombre: '', numero_convenio: '', fecha_inicio: '', fecha_fin: '' };
    this.errorEspecifico = '';
    this.mostrarModalEspecifico = true;
  }

  abrirEditarEspecifico(marco: ConvenioMarco, e: ConvenioEspecifico): void {
    this.marcoParaEspecifico = marco;
    this.editandoEspecifico = e;
    this.formEspecifico = {
      nombre: e.nombre,
      numero_convenio: e.numero_convenio || '',
      fecha_inicio: e.fecha_inicio ? e.fecha_inicio.substring(0, 10) : '',
      fecha_fin: e.fecha_fin ? e.fecha_fin.substring(0, 10) : '',
    };
    this.errorEspecifico = '';
    this.mostrarModalEspecifico = true;
  }

  cerrarModalEspecifico(): void {
    this.mostrarModalEspecifico = false;
    this.editandoEspecifico = null;
    this.marcoParaEspecifico = null;
  }

  guardarEspecifico(): void {
    if (!this.formEspecifico.nombre.trim()) {
      this.errorEspecifico = 'El objeto/nombre es obligatorio.';
      return;
    }
    if (!this.marcoParaEspecifico) return;
    this.guardandoEspecifico = true;
    const body = {
      ...this.formEspecifico,
      marco_id: this.marcoParaEspecifico.id,
      created_by: this.usuario?.nombre,
      actor_nombre: this.usuario?.nombre,
    };
    const obs = this.editandoEspecifico
      ? this.cs.actualizarEspecifico(this.editandoEspecifico.id, body)
      : this.cs.crearEspecifico(body);
    const marcoId = this.marcoParaEspecifico.id;
    obs.subscribe({
      next: () => {
        this.guardandoEspecifico = false;
        this.cerrarModalEspecifico();
        this.cargarEspecificos(marcoId);
        this.cargar();
      },
      error: (err) => {
        this.guardandoEspecifico = false;
        this.errorEspecifico = err.error?.error || 'No se pudo guardar el convenio específico.';
      },
    });
  }

  eliminarEspecifico(marcoId: number, e: ConvenioEspecifico): void {
    if (!confirm(`¿Eliminar el convenio específico "${e.nombre}"?`)) return;
    this.cs.eliminarEspecifico(e.id).subscribe(() => {
      this.cargarEspecificos(marcoId);
      this.cargar();
    });
  }

  // ── Carga masiva Excel ────────────────────────────
  descargarPlantillaMarcos(): void {
    this.cs.descargarPlantillaMarcos();
  }

  abrirModalExcel(): void {
    this.archivoExcel = null;
    this.errorExcel = '';
    this.resultadoExcel = null;
    this.mostrarModalExcel = true;
  }

  cerrarModalExcel(): void {
    this.mostrarModalExcel = false;
  }

  onArchivoExcel(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoExcel = input.files?.[0] || null;
  }

  subirExcel(): void {
    if (!this.archivoExcel) {
      this.errorExcel = 'Selecciona un archivo Excel.';
      return;
    }
    this.errorExcel = '';
    this.subiendoExcel = true;
    this.cs.cargarExcel(this.archivoExcel, this.usuario?.nombre || '').subscribe({
      next: (r) => {
        this.subiendoExcel = false;
        this.resultadoExcel = r;
        this.cargar();
      },
      error: (err) => {
        this.subiendoExcel = false;
        this.errorExcel = err.error?.error || 'No se pudo procesar el archivo.';
      },
    });
  }

  // ── Navegación ────────────────────────────────────
  togglePerfilMenu(): void {
    this.mostrarPerfilMenu = !this.mostrarPerfilMenu;
  }
  irASectorista(): void {
    this.router.navigate(['/sectorista']);
  }
  dashboard(id: number): any {
    return this.dashboardPorMarco.get(id);
  }
  cerrarSesion(): void {
    localStorage.removeItem('usuario');
    this.router.navigate(['/login']);
  }
}
