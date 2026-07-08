import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpedientesPdp } from './expedientes-pdp';

describe('ExpedientesPdp', () => {
 let component: ExpedientesPdp;
 let fixture: ComponentFixture<ExpedientesPdp>;

 beforeEach(async () => {
 await TestBed.configureTestingModule({
 imports: [ExpedientesPdp],
 }).compileComponents();

 fixture = TestBed.createComponent(ExpedientesPdp);
 component = fixture.componentInstance;
 await fixture.whenStable();
 });

 it('should create', () => {
 expect(component).toBeTruthy();
 });
});
