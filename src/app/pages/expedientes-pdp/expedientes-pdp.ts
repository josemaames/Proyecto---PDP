import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
 private router = inject(Router);
 private http = inject(HttpClient);

 verNotas(cap: any) {
 this.router.navigate(['/notas', cap.codigo_act]);
 }

 capacitaciones: Actividad[] = [];
 seleccionada: Actividad | null = null;
 documentosSeleccionada: any[] = [];

 busqueda = '';
 filtrored = '';
 filtroMod = '';
 filtroEje = '';
 pagina = 1;
 limit = 20;
 total = 0;
 cargando = false;
 redFiltro = '';

 redesDisponibles: string[] = [];
 readonly ejesTematicos = [
 'Atención Especializada',
 'Atención primaria',
 'Control interno o auditoría',
 'Ética, integridad, lucha contra la corrupción',
 'Gestión institucional',
 'Salud Mental',
 'Otros',
 ];

 // Gestión de ejecutores (solo sectorista) — refleja los usuarios reales
 // (con su 'sedes') administrados en la pantalla de Administración. Por ahora
 // es de solo lectura salvo para ejecutores que aún no tienen ninguna red
 // asignada; reasignar/quitar una red ya asignada se hace desde Administración.
 rolUsuario = '';
 mostrarModalAsignar = false;
 redesSectorista: string[] = [];
 ejecutoresDisponibles: any[] = [];
 asignRedSeleccionada = '';
 asignEjecutorDni = '';
 asigExito = false;

 get totalPaginas(): number {
 return Math.max(1, Math.ceil(this.total / this.limit));
 }

 get redesAsignadas(): string[] {
 return this.redFiltro
 .split(',')
 .map((r) => r.trim())
 .filter(Boolean);
 }

 ngOnInit() {
 this.redFiltro = this.pdpData.getRedFiltro();
 const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
 this.rolUsuario = usuario.rol || '';
 if (this.rolUsuario === 'Sectorista') {
 this.redesSectorista = this.redFiltro
 .split(',')
 .map((r) => r.trim())
 .filter(Boolean);
 this.cargarEjecutores();
 }
 if (!this.redFiltro) {
 this.pdpData.getResumenRedes().subscribe((redes) => {
 this.redesDisponibles = redes.map((r) => r.red).sort();
 });
 }
 this.cargar();
 }

 private cargarEjecutores() {
 this.http.get<any[]>('/api/usuarios').subscribe({
 next: (usuarios) => {
 this.ejecutoresDisponibles = usuarios.filter(
 (u) => u.rol === 'Ejecutor' && u.estado !== 'Inactivo',
 );
 },
 error: () => (this.ejecutoresDisponibles = []),
 });
 }

 private redesDe(ejecutor: any): string[] {
 return (ejecutor.sedes || '')
 .split(',')
 .map((r: string) => r.trim())
 .filter(Boolean);
 }

 get ejecutoresSinRed(): any[] {
 return this.ejecutoresDisponibles.filter((e) => this.redesDe(e).length === 0);
 }

 abrirModalAsignar() {
 this.cargarEjecutores();
 this.asignRedSeleccionada = '';
 this.asignEjecutorDni = '';
 this.asigExito = false;
 this.mostrarModalAsignar = true;
 }

 cerrarModalAsignar() {
 this.mostrarModalAsignar = false;
 this.asignRedSeleccionada = '';
 this.asignEjecutorDni = '';
 }

 getEjecutorAsignado(red: string): { nombre: string; dni: string } | null {
 const ejecutor = this.ejecutoresDisponibles.find((e) => this.redesDe(e).includes(red));
 return ejecutor ? { nombre: ejecutor.nombre, dni: ejecutor.dni } : null;
 }

 // Solo se puede asignar una red que todavía no tiene ejecutor, y solo a un
 // ejecutor que todavía no está a cargo de ninguna red (ver ejecutoresSinRed).
 // Reasignar una red ya cubierta se hace desde Administración por ahora.
 prepararAsignacion(red: string) {
 if (this.getEjecutorAsignado(red)) return;
 this.asignRedSeleccionada = red;
 this.asignEjecutorDni = '';
 this.asigExito = false;
 }

 guardarAsignacion() {
 if (!this.asignRedSeleccionada || !this.asignEjecutorDni) return;
 this.http
 .put<any>(`/api/usuarios/${this.asignEjecutorDni}`, { sedes: this.asignRedSeleccionada })
 .subscribe({
 next: () => {
 this.cargarEjecutores();
 this.asignRedSeleccionada = '';
 this.asignEjecutorDni = '';
 this.asigExito = true;
 setTimeout(() => (this.asigExito = false), 2500);
 },
 error: () => alert('No se pudo guardar la asignación.'),
 });
 }

 cargar() {
 this.cargando = true;
 const red = this.filtrored || this.redFiltro;
 this.pdpData
 .getActividades(this.busqueda, red, this.filtroMod, this.pagina, this.limit, this.filtroEje)
 .subscribe({
 next: (res) => {
 this.capacitaciones = res.data;
 this.total = res.total;
 this.cargando = false;
 },
 error: () => {
 this.cargando = false;
 },
 });
 }

 buscar() {
 this.pagina = 1;
 this.cargar();
 }

 anterior() {
 if (this.pagina > 1) {
 this.pagina--;
 this.cargar();
 }
 }
 siguiente() {
 if (this.pagina < this.totalPaginas) {
 this.pagina++;
 this.cargar();
 }
 }

 ver(cap: Actividad) {
 this.seleccionada = cap;
 this.documentosSeleccionada = [];
 if (cap.codigo_act) {
 this.pdpData.getDocumentos(cap.codigo_act).subscribe({
 next: (docs) => (this.documentosSeleccionada = docs),
 error: () => (this.documentosSeleccionada = []),
 });
 }
 }
 cerrarModal() {
 this.seleccionada = null;
 }

 descargarDocumentoSeleccionada(doc: any) {
 if (!doc.id) return;
 this.pdpData.descargarDocumento(doc.id).subscribe({
 next: (res) => window.open(res.url, '_blank'),
 error: () => alert('No se pudo generar el enlace de descarga.'),
 });
 }

 formatMoneda(v: number | undefined): string {
 if (v == null) return '—';
 return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(v);
 }
}
