import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccionesCapacitacion } from './acciones-capacitacion';

describe('AccionesCapacitacion', () => {
  let component: AccionesCapacitacion;
  let fixture: ComponentFixture<AccionesCapacitacion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccionesCapacitacion],
    }).compileComponents();

    fixture = TestBed.createComponent(AccionesCapacitacion);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
