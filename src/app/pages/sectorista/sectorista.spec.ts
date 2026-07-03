import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Sectorista } from './sectorista';

describe('Sectorista', () => {
 let component: Sectorista;
 let fixture: ComponentFixture<Sectorista>;

 beforeEach(async () => {
 await TestBed.configureTestingModule({
 imports: [Sectorista],
 }).compileComponents();

 fixture = TestBed.createComponent(Sectorista);
 component = fixture.componentInstance;
 await fixture.whenStable();
 });

 it('should create', () => {
 expect(component).toBeTruthy();
 });
});
