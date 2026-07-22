import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ExpedienteService } from '../../services/expediente.service';
import { PdpDataService, AlertaPersonal } from '../../services/pdp-data.service';

@Component({
 selector: 'app-ejecutor',
 standalone: true,
 imports: [FormsModule, DecimalPipe, DatePipe],
 templateUrl: './ejecutor.html',
 styleUrl: './ejecutor.css',
})
export class Ejecutor implements OnInit {
 private router = inject(Router);
 private http = inject(HttpClient);
 private expedienteService = inject(ExpedienteService);
 private pdpData = inject(PdpDataService);

 usuario: any = {};
 fechaHoy = '';
 inicialUsuario = 'U';
 mostrarPerfilMenu = false;
 buscandoRuc = false;
 errorRuc = '';
 capacitacionExtranjero = false;
 errorFormulario = '';
 camposInvalidos: string[] = [];

 // BÚSQUEDA DE EXPEDIENTES
 mostrarBusqueda = false;
 textoBusqueda = '';
 expedientes: any[] = [];
 expedienteDetalle: any = null;

 // TABLA DE ACTIVIDADES
 actividades: any[] = [];
 busquedaAct = '';
 paginaAct = 1;
 limitAct = 50;
 totalAct = 0;
 cargandoAct = false;

 redEjecutor = '';

 presupuestoRed = 0;
 presupuestoGastado = 0;

 get saldoRestante(): number {
 return this.presupuestoRed - this.presupuestoGastado - (Number(this.formulario.presupuestoEjecutado) || 0);
 }

 get porcentajeUsado(): number {
 if (!this.presupuestoRed) return 0;
 const usado = this.presupuestoGastado + (Number(this.formulario.presupuestoEjecutado) || 0);
 return Math.min((usado / this.presupuestoRed) * 100, 100);
 }

 // COMPROBANTE DE PAGO
 comprobantes: any[] = [];
 archivoComprobante: File | null = null;
 subiendoComprobante = false;
 errorComprobante = '';

 private PRESUPUESTOS_RED: Record<string, number> = {
 'RA ALMENARA': 240000,
 'RA AREQUIPA': 120000,
 'RA CAJAMARCA': 80000,
 'RA CUSCO': 160000,
 'RA ICA': 175000,
 'RA JUNIN': 54000,
 'RA LA LIBERTAD': 114960,
 'RA LAMBAYEQUE': 140000,
 'RA PIURA': 45000,
 'RA REBAGLIATI': 240000,
 'RA SABOGAL': 195000,
 'RA TACNA': 90000,

 'RP REBAGLIATI': 240000,

 'RA AMAZONAS': 30000,
 'RA ANCASH': 158640,
 'RA APURIMAC': 66000,
 'RA AYACUCHO': 65000,
 'RA HUANCAVELICA': 32000,
 'RA HUANUCO': 74000,
 'RA HUARAZ': 40000,
 'RA JAEN': 32000,
 'RA JULIACA': 65760,
 'RA LORETO': 60000,
 'RA MADRE DE DIOS': 60000,
 'RA MOQUEGUA': 91020,
 'RA MOYOBAMBA': 62000,
 'RA PASCO': 72000,
 'RA PUNO': 122524,
 'RA TARAPOTO': 58000,
 'RA TUMBES': 36130,
 'RA UCAYALI': 45000,

 'CENTRO NACIONAL DE SALUD RENAL': 72000,
 'INSTITUTO NACIONAL CARDIOVASCULAR': 52000,
 };

 // MODAL PARTICIPANTES
 mostrarModalParticipantes = false;
 participantesSeleccionados: any[] = [];
 nuevoPartic = this.particVacio();
 errorPartic = '';
 estadoAC: 'idle' | 'buscando' | 'encontrado' | 'no_encontrado' = 'idle';
 estadoACCorr: 'idle' | 'buscando' | 'encontrado' | 'no_encontrado' = 'idle';
 private dniTimer: any;
 private planillaTimer: any;


 particVacio() {
 return {
 codigo_act: '',
 red: '',
 dni_ce: '',
 cod_planilla: '',
 apellidos: '',
 nombre: '',
 sexo: '',
 sub_programa: '',
 servicio_area: '',
 cargo: '',
 regimen_laboral: '',
 };
 }

 // MIS ENVÍOS
 misEnvios: any[] = [];
 cargandoEnvios = false;
 enviando = false;

 // CORRECCIONES PENDIENTES
 mostrarModalCorreccion = false;
 solicitudCorrigiendo: any = null;
 formularioCorreccion: any = {};
 participantesCorreccion: any[] = [];
 nuevoParticCorreccion = this.particVacio();
 errorParticCorreccion = '';
 enviandoCorreccion = false;
 errorCorreccion = '';

 get correccionesPendientes(): any[] {
 return this.misEnvios.filter(e => e.correccion_pendiente);
 }

 get totalPaginasAct(): number {
 return Math.max(1, Math.ceil(this.totalAct / this.limitAct));
 }

 formulario = {
 codigoAct: '',
 fechaInicio: '',
 fechaFin: '',
 mesTermino: '',
 redAsistencial: '',
 servicioArea: '',
 nombreActividad: '',
 totalHoras: 0,
 horasFueraHorario: 0,
 frecuencia: '',
 horaInicio: '',
 horaTermino: '',
 modalidad: '',
 publico: '',
 nivelEvaluacion: '',
 totalParticipantes: 0,
 ejeTematico: '',
 objetivoEstrategico: '',
 rucProveedor: '',
 nombreProveedor: '',
 sectorProveedor: '',
 presupuestoEjecutado: 0,
 };

 ngOnInit() {
 this.usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
 this.inicialUsuario = this.usuario?.nombre?.charAt(0)?.toUpperCase() || 'U';

 // Pre-cargar red asistencial del ejecutor (sedes puede ser string o array)
 const sedes = this.usuario?.sedes;
 this.redEjecutor = Array.isArray(sedes)
 ? sedes[0] || ''
 : typeof sedes === 'string'
 ? sedes.split(',')[0].trim()
 : '';
 this.formulario.redAsistencial = this.redEjecutor;
 this.cargarPresupuestoRed();

 this.cargarMisEnvios();

 const f = new Date().toLocaleDateString('es-PE', {
 weekday: 'long',
 day: 'numeric',
 month: 'long',
 year: 'numeric',
 });

 this.fechaHoy = f.charAt(0).toUpperCase() + f.slice(1);

 this.cargarActividades();
 this.cargarAlertasPersonal();
 }

 // ── Alertas de personal (cese / cambio de red) ────
 alertasPersonal: AlertaPersonal[] = [];

 cargarAlertasPersonal() {
 this.pdpData.getAlertasPersonal(undefined, this.redEjecutor).subscribe({
 next: (alertas) => (this.alertasPersonal = alertas),
 error: () => (this.alertasPersonal = []),
 });
 }

 descripcionAlertaPersonal(a: AlertaPersonal): string {
 return a.tipo === 'CESE'
 ? `${a.nombre_completo} ya no pertenece al personal activo (capacitación ${a.codigo_act}).`
 : `${a.nombre_completo} cambió de red: ${a.red_anterior} → ${a.red_nueva} (capacitación ${a.codigo_act}).`;
 }

 resolverAlertaPersonal(a: AlertaPersonal) {
 if (!confirm('¿Marcar esta alerta como revisada?')) return;
 this.pdpData.resolverAlertaPersonal(a.id, this.usuario?.nombre || '').subscribe(() => {
 this.cargarAlertasPersonal();
 });
 }

 irARevisarAlertaPersonal(a: AlertaPersonal) {
 this.router.navigate(['/lista-participantes'], { queryParams: { codigo_act: a.codigo_act } });
 }

 private cargarPresupuestoRed() {
 const red = (this.redEjecutor || '').toUpperCase().trim();
 this.presupuestoRed = this.PRESUPUESTOS_RED[red] ?? 0;

 if (!red) return;
 this.http.get<any[]>(`http://localhost:3001/api/resumen-redes?redes=${encodeURIComponent(red)}`).subscribe({
 next: (rows) => {
 const fila = rows.find(r =>
 (r.red || '').toUpperCase().includes(red) || red.includes((r.red || '').toUpperCase())
 );
 this.presupuestoGastado = fila ? Number(fila.presupuesto) : 0;
 },
 error: () => { this.presupuestoGastado = 0; },
 });
 }

 // COMPROBANTE DE PAGO
 cargarComprobantes() {
 const codigo = this.formulario.codigoAct.trim();
 if (!codigo) {
 this.comprobantes = [];
 return;
 }
 this.pdpData.getDocumentos(codigo).subscribe({
 next: (docs) => (this.comprobantes = docs),
 error: () => (this.comprobantes = []),
 });
 }

 onArchivoComprobante(event: Event) {
 const input = event.target as HTMLInputElement;
 this.archivoComprobante = input.files?.[0] || null;
 this.errorComprobante = '';
 }

 eliminarComprobante(doc: any) {
 if (!doc.id) return;
 if (!confirm(`¿Eliminar el documento "${doc.nombre_archivo}"?`)) return;
 this.pdpData.eliminarDocumento(doc.id).subscribe(() => this.cargarComprobantes());
 }

 abrirBusqueda() {
 this.expedientes = this.expedienteService.getExpedientesPorRol();

 console.log('EXPEDIENTES EJECUTOR:', this.expedientes);

 this.textoBusqueda = '';
 this.expedienteDetalle = null;
 this.mostrarBusqueda = true;
 }

 cerrarBusqueda() {
 this.mostrarBusqueda = false;
 this.expedienteDetalle = null;
 }

 verDetalleExpediente(exp: any) {
 this.expedienteDetalle = exp;
 }

 get expedientesFiltrados(): any[] {
 const texto = this.textoBusqueda.toLowerCase().trim();

 if (!texto) {
 return this.expedientes;
 }

 return this.expedientes.filter(
 (e) =>
 e.expediente.toLowerCase().includes(texto) ||
 e.capacitacion.toLowerCase().includes(texto) ||
 e.responsable.toLowerCase().includes(texto) ||
 e.estado.toLowerCase().includes(texto),
 );
 }

 cargarActividades() {
 this.actividades = [];
 this.totalAct = 0;
 this.cargandoAct = false;
 }

 cargarMisEnvios() {
 const dni = this.usuario?.dni;
 if (!dni) return;
 this.cargandoEnvios = true;
 this.http.get<any[]>(`http://localhost:3001/api/solicitudes/mis-envios?dni=${dni}`).subscribe({
 next: (data) => {
 this.misEnvios = data;
 this.cargandoEnvios = false;
 },
 error: () => {
 this.cargandoEnvios = false;
 },
 });
 }

 buscarAct() {
 this.paginaAct = 1;
 }

 paginaActAnterior() {
 if (this.paginaAct > 1) {
 this.paginaAct--;
 }
 }

 paginaActSiguiente() {
 if (this.paginaAct < this.totalPaginasAct) {
 this.paginaAct++;
 }
 }

 irA(ruta: string) {
 if (ruta === '/busqueda-expediente') {
 this.abrirBusqueda();
 return;
 }

 this.router.navigate([ruta]);
 }

 togglePerfilMenu() {
 this.mostrarPerfilMenu = !this.mostrarPerfilMenu;
 }

 cerrarSesion() {
 localStorage.removeItem('usuario');
 this.router.navigate(['/login']);
 }

 actualizarMesTermino() {
 if (!this.formulario.fechaFin) return;
 const meses = [
 'Enero',
 'Febrero',
 'Marzo',
 'Abril',
 'Mayo',
 'Junio',
 'Julio',
 'Agosto',
 'Septiembre',
 'Octubre',
 'Noviembre',
 'Diciembre',
 ];
 const mes = new Date(this.formulario.fechaFin + 'T00:00:00').getMonth();
 this.formulario.mesTermino = meses[mes];
 }

 toggleExtranjero() {
 this.capacitacionExtranjero = !this.capacitacionExtranjero;
 if (this.capacitacionExtranjero) {
 this.formulario.rucProveedor = '';
 this.errorRuc = '';
 }
 }

 buscarRuc() {
 const ruc = this.formulario.rucProveedor.trim();

 if (ruc.length !== 11 || !/^\d+$/.test(ruc)) {
 this.errorRuc = 'El RUC debe tener exactamente 11 dígitos numéricos.';
 return;
 }

 this.errorRuc = '';
 this.buscandoRuc = true;

 this.http.get<any>(`http://localhost:3001/api/sunat/ruc?numero=${ruc}`).subscribe({
 next: (data) => {
 this.formulario.nombreProveedor =
 data.razon_social || data.razonSocial || data.nombre || '';
 this.buscandoRuc = false;
 },
 error: () => {
 this.errorRuc = 'No se encontró información para ese RUC.';
 this.buscandoRuc = false;
 },
 });
 }

 abrirSeleccionParticipantes() {
 this.errorFormulario = '';
 this.camposInvalidos = [];

 const f = this.formulario;
 const errores: string[] = [];

 if (!f.codigoAct.trim()) errores.push('Código de actividad');
 if (!f.fechaInicio) errores.push('Fecha de inicio');
 if (!f.fechaFin) errores.push('Fecha de finalización');
 if (!f.mesTermino) errores.push('Mes de término');
 if (!f.redAsistencial.trim()) errores.push('Red asistencial / Unidad orgánica');
 if (!f.nombreActividad.trim()) errores.push('Nombre de la actividad');
 if (!f.totalHoras || f.totalHoras <= 0) errores.push('Total horas ejecutadas');
 if (!f.frecuencia) errores.push('Frecuencia de desarrollo');
 if (!f.modalidad) errores.push('Modalidad');
 if (!f.nivelEvaluacion) errores.push('Nivel de evaluación');
 if (!f.totalParticipantes || f.totalParticipantes <= 0) errores.push('Total de participantes');

 if (errores.length > 0) {
 this.camposInvalidos = errores;
 this.errorFormulario = 'Debe completar los siguientes campos obligatorios:';
 setTimeout(() => {
 document
 .querySelector('.error-formulario-ej')
 ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
 }, 50);
 return;
 }

 if (this.archivoComprobante) {
 this.subiendoComprobante = true;
 this.errorComprobante = '';
 this.pdpData.subirDocumento(f.codigoAct.trim(), this.archivoComprobante).subscribe({
 next: () => {
 this.subiendoComprobante = false;
 this.archivoComprobante = null;
 const inputEl = document.getElementById('comprobanteInput') as HTMLInputElement;
 if (inputEl) inputEl.value = '';
 this.cargarComprobantes();
 this.continuarASeleccionParticipantes();
 },
 error: (err) => {
 this.subiendoComprobante = false;
 this.errorComprobante = 'Error al subir el comprobante: ' + (err.error?.error || err.message);
 },
 });
 return;
 }

 this.continuarASeleccionParticipantes();
 }

 private continuarASeleccionParticipantes() {
 this.participantesSeleccionados = [];
 this.errorPartic = '';
 this.estadoAC = 'idle';
 this.nuevoPartic = {
 ...this.particVacio(),
 codigo_act: this.formulario.codigoAct,
 red: this.redEjecutor,
 };
 this.mostrarModalParticipantes = true;
 }

 agregarParticipante() {
 const p = this.nuevoPartic;
 if (!p.dni_ce.trim() || !p.apellidos.trim() || !p.nombre.trim()) {
 this.errorPartic = 'DNI/CE, Apellidos y Nombre son obligatorios.';
 return;
 }
 if (this.participantesSeleccionados.length >= this.formulario.totalParticipantes) {
 this.errorPartic = `Ya alcanzó el límite de ${this.formulario.totalParticipantes} participante(s).`;
 return;
 }
 this.errorPartic = '';
 this.estadoAC = 'idle';
 this.participantesSeleccionados.push({ ...p });
 // Mantener código y red fijos para el siguiente participante
 this.nuevoPartic = {
 ...this.particVacio(),
 codigo_act: this.formulario.codigoAct,
 red: this.redEjecutor,
 };
 }

 quitarParticipante(idx: number) {
 this.participantesSeleccionados.splice(idx, 1);
 }

 cerrarModalParticipantes() {
 this.mostrarModalParticipantes = false;
 }

 abrirCorreccion(envio: any) {
 this.solicitudCorrigiendo = envio;
 this.formularioCorreccion = { ...(envio.datos || {}) };
 this.participantesCorreccion = Array.isArray(envio.datos?.participantesDetalle)
 ? envio.datos.participantesDetalle.map((p: any) => ({ ...p }))
 : [];
 this.nuevoParticCorreccion = { ...this.particVacio(), codigo_act: envio.datos?.codigoAct || '', red: this.redEjecutor };
 this.errorParticCorreccion = '';
 this.errorCorreccion = '';
 this.estadoACCorr = 'idle';
 this.mostrarModalCorreccion = true;
 }

 cerrarCorreccion() {
 this.mostrarModalCorreccion = false;
 this.solicitudCorrigiendo = null;
 }

 agregarParticCorreccion() {
 const p = this.nuevoParticCorreccion;
 if (!p.dni_ce.trim() || !p.apellidos.trim() || !p.nombre.trim()) {
 this.errorParticCorreccion = 'DNI/CE, Apellidos y Nombre son obligatorios.';
 return;
 }
 this.errorParticCorreccion = '';
 this.estadoACCorr = 'idle';
 this.participantesCorreccion.push({ ...p });
 this.nuevoParticCorreccion = { ...this.particVacio(), codigo_act: this.formularioCorreccion.codigoAct || '', red: this.redEjecutor };
 }

 quitarParticCorreccion(idx: number) {
 this.participantesCorreccion.splice(idx, 1);
 }

 // ── AUTOCOMPLETE PARTICIPANTES ────────────────────────────────────────────

 private llenarDesdePersonal(p: any, target: 'nuevo' | 'correccion') {
 const obj = target === 'nuevo' ? this.nuevoPartic : this.nuevoParticCorreccion;
 obj.apellidos = p.apellidos || '';
 obj.nombre = p.nombre || '';
 obj.sexo = p.sexo || '';
 obj.sub_programa = p.sub_programa || '';
 obj.servicio_area = p.servicio_area || '';
 obj.cargo = p.cargo || '';
 obj.regimen_laboral = p.regimen_laboral || '';
 if (!obj.cod_planilla) obj.cod_planilla = p.cod_planilla || '';
 if (!obj.dni_ce) obj.dni_ce = p.dni_ce || '';
 }

 autocompletarPorDni(dni: string, target: 'nuevo' | 'correccion' = 'nuevo') {
 clearTimeout(this.dniTimer);
 if (target === 'nuevo') this.estadoAC = 'idle';
 else this.estadoACCorr = 'idle';
 if (dni.trim().length < 8) return;
 if (target === 'nuevo') this.estadoAC = 'buscando';
 else this.estadoACCorr = 'buscando';
 this.dniTimer = setTimeout(() => {
 this.http.get(`http://localhost:3001/api/personal-essalud/dni/${dni.trim()}`).subscribe({
 next: (p: any) => {
 this.llenarDesdePersonal(p, target);
 if (target === 'nuevo') this.estadoAC = 'encontrado';
 else this.estadoACCorr = 'encontrado';
 },
 error: () => {
 if (target === 'nuevo') this.estadoAC = 'no_encontrado';
 else this.estadoACCorr = 'no_encontrado';
 },
 });
 }, 400);
 }

 autocompletarPorPlanilla(cod: string, target: 'nuevo' | 'correccion' = 'nuevo') {
 clearTimeout(this.planillaTimer);
 if (target === 'nuevo') this.estadoAC = 'idle';
 else this.estadoACCorr = 'idle';
 if (cod.trim().length < 3) return;
 if (target === 'nuevo') this.estadoAC = 'buscando';
 else this.estadoACCorr = 'buscando';
 this.planillaTimer = setTimeout(() => {
 this.http.get(`http://localhost:3001/api/personal-essalud/planilla/${cod.trim()}`).subscribe({
 next: (p: any) => {
 this.llenarDesdePersonal(p, target);
 if (target === 'nuevo') this.estadoAC = 'encontrado';
 else this.estadoACCorr = 'encontrado';
 },
 error: () => {
 if (target === 'nuevo') this.estadoAC = 'no_encontrado';
 else this.estadoACCorr = 'no_encontrado';
 },
 });
 }, 400);
 }

 enviarCorreccion() {
 this.enviandoCorreccion = true;
 this.errorCorreccion = '';
 const datos = {
 ...this.formularioCorreccion,
 participantesDetalle: this.participantesCorreccion,
 totalParticipantes: this.participantesCorreccion.length,
 };
 this.http.put(`http://localhost:3001/api/solicitudes/${this.solicitudCorrigiendo.id}/reenviar`, {
 datos,
 ejecutor_nombre: this.usuario?.nombre || '',
 }).subscribe({
 next: () => {
 this.enviandoCorreccion = false;
 this.cerrarCorreccion();
 this.cargarMisEnvios();
 },
 error: () => {
 this.enviandoCorreccion = false;
 this.errorCorreccion = 'Error al reenviar. Intente nuevamente.';
 },
 });
 }

 enviarFormulario() {
 this.enviando = true;
 this.mostrarModalParticipantes = false;
 const payload = {
 datos: { ...this.formulario, participantesDetalle: this.participantesSeleccionados },
 ejecutor_nombre: this.usuario?.nombre || '',
 ejecutor_dni: this.usuario?.dni || '',
 };

 this.http.post('http://localhost:3001/api/solicitudes', payload).subscribe({
 next: () => {
 this.enviando = false;
 this.mostrarModalParticipantes = false;
 this.errorFormulario = '';
 this.camposInvalidos = [];
 this.participantesSeleccionados = [];
 this.formulario = {
 codigoAct: '',
 fechaInicio: '',
 fechaFin: '',
 mesTermino: '',
 redAsistencial: this.redEjecutor,
 servicioArea: '',
 nombreActividad: '',
 totalHoras: 0,
 horasFueraHorario: 0,
 frecuencia: '',
 horaInicio: '',
 horaTermino: '',
 modalidad: '',
 publico: '',
 nivelEvaluacion: '',
 totalParticipantes: 0,
 ejeTematico: '',
 objetivoEstrategico: '',
 rucProveedor: '',
 nombreProveedor: '',
 sectorProveedor: '',
 presupuestoEjecutado: 0,
 };
 this.comprobantes = [];
 this.archivoComprobante = null;
 this.cargarMisEnvios();
 setTimeout(() => {
 document
 .querySelector('.mis-envios-section')
 ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }, 100);
 },
 error: () => {
 this.enviando = false;
 this.errorFormulario = 'Error al enviar el formulario. Intente nuevamente.';
 },
 });
 }
}
