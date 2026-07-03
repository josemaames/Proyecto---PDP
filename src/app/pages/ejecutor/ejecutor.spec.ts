import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ejecutor } from './ejecutor';

describe('Ejecutor', () => {
 let component: Ejecutor;
 let fixture: ComponentFixture<Ejecutor>;

 beforeEach(async () => {
 await TestBed.configureTestingModule({
 imports: [Ejecutor],
 }).compileComponents();

 fixture = TestBed.createComponent(Ejecutor);
 component = fixture.componentInstance;
 await fixture.whenStable();
 });

 it('should create', () => {
 expect(component).toBeTruthy();
 });
});
