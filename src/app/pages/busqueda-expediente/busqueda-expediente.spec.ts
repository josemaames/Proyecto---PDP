import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusquedaExpediente } from './busqueda-expediente';

describe('BusquedaExpediente', () => {
 let component: BusquedaExpediente;
 let fixture: ComponentFixture<BusquedaExpediente>;

 beforeEach(async () => {
 await TestBed.configureTestingModule({
 imports: [BusquedaExpediente],
 }).compileComponents();

 fixture = TestBed.createComponent(BusquedaExpediente);
 component = fixture.componentInstance;
 await fixture.whenStable();
 });

 it('should create', () => {
 expect(component).toBeTruthy();
 });
});
