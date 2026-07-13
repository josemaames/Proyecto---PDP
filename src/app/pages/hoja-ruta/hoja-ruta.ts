import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API = 'http://localhost:3001';

@Component({
 selector: 'app-hoja-ruta',
 imports: [FormsModule],
 templateUrl: './hoja-ruta.html',
 styleUrl: './hoja-ruta.css',
})
export class HojaRuta implements OnInit {
 busqueda = '';
 resultados: any[] = [];
 buscando = false;
 debounceTimer: any;

 capacitacionSeleccionada: any = null;
 pasos: { paso: string; completado: boolean; completado_at: string | null }[] = [];
 cargandoPasos = false;
 guardandoPaso: string | null = null;

 usuarioNombre = '';

 constructor(private http: HttpClient) {}

 ngOnInit() {
 const u = localStorage.getItem('usuario_pdp');
 if (u) this.usuarioNombre = JSON.parse(u).nombre || 'Administrador';
 this.buscarCapacitaciones();
 }

 onBusqueda() {
 clearTimeout(this.debounceTimer);
 this.debounceTimer = setTimeout(() => this.buscarCapacitaciones(), 350);
 }

 buscarCapacitaciones() {
 this.buscando = true;
 const q = encodeURIComponent(this.busqueda.trim());
 this.http.get<any>(`${API}/api/actividades?q=${q}&limit=20&page=1`).subscribe({
 next: (r) => {
 this.resultados = r.data ?? r;
 this.buscando = false;
 },
 error: () => (this.buscando = false),
 });
 }

 seleccionar(cap: any) {
 this.capacitacionSeleccionada = cap;
 this.cargandoPasos = true;
 this.http.get<any[]>(`${API}/api/hoja-ruta/${cap.id}/pasos`).subscribe({
 next: (p) => {
 this.pasos = p;
 this.cargandoPasos = false;
 },
 error: () => (this.cargandoPasos = false),
 });
 }

 get porcentajeAvance(): number {
 if (!this.pasos.length) return 0;
 const completados = this.pasos.filter((p) => p.completado).length;
 return Math.round((completados / this.pasos.length) * 100);
 }

 get pasoActual(): string {
 const en = this.pasos.find((p) => !p.completado);
 return en ? en.paso : 'Finalizado';
 }

 get semaforo(): 'verde' | 'amarillo' | 'rojo' | 'gris' {
 const cap = this.capacitacionSeleccionada;
 if (!cap?.mes_termino) return 'gris';
 const hoy = new Date();
 const [mes, anio] = cap.mes_termino.toString().split('/').length === 2
 ? cap.mes_termino.toString().split('/')
 : [cap.mes_termino.toString().slice(5, 7), cap.mes_termino.toString().slice(0, 4)];
 const limite = new Date(parseInt(anio), parseInt(mes) - 1 + 1, 0); // último día del mes
 const dias = Math.ceil((limite.getTime() - hoy.getTime()) / 86400000);
 if (dias > 60) return 'verde';
 if (dias > 15) return 'amarillo';
 return 'rojo';
 }

 get diasRestantes(): number {
 const cap = this.capacitacionSeleccionada;
 if (!cap?.mes_termino) return 0;
 const [mes, anio] = cap.mes_termino.toString().split('/').length === 2
 ? cap.mes_termino.toString().split('/')
 : [cap.mes_termino.toString().slice(5, 7), cap.mes_termino.toString().slice(0, 4)];
 const limite = new Date(parseInt(anio), parseInt(mes) - 1 + 1, 0);
 return Math.ceil((limite.getTime() - new Date().getTime()) / 86400000);
 }

 togglePaso(paso: { paso: string; completado: boolean }) {
 if (this.guardandoPaso) return;
 const idx = this.pasos.findIndex((p) => p.paso === paso.paso);
 const nuevoEstado = !paso.completado;

 // Los pasos se completan EN ORDEN.
 if (nuevoEstado) {
 // Para marcar: el paso anterior debe estar completado.
 if (idx > 0 && !this.pasos[idx - 1].completado) {
 alert('Debes completar los pasos en orden. Marca primero el paso anterior.');
 return;
 }
 } else {
 // Para desmarcar: el paso siguiente no debe estar completado (para no dejar huecos).
 if (idx < this.pasos.length - 1 && this.pasos[idx + 1].completado) {
 alert('Para desmarcar este paso, primero desmarca los pasos posteriores.');
 return;
 }
 }

 this.guardandoPaso = paso.paso;

 const pasoEncoded = encodeURIComponent(paso.paso);
 this.http
 .put(`${API}/api/hoja-ruta/${this.capacitacionSeleccionada.id}/pasos/${pasoEncoded}`, {
 completado: nuevoEstado,
 actor_nombre: this.usuarioNombre,
 })
 .subscribe({
 next: () => {
 paso.completado = nuevoEstado;
 this.guardandoPaso = null;
 },
 error: () => (this.guardandoPaso = null),
 });
 }

 formatFecha(f: string | null): string {
 if (!f) return '—';
 const d = new Date(f);
 if (isNaN(d.getTime())) return f;
 return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
 }
}
