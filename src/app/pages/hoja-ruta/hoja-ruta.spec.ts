import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HojaRuta } from './hoja-ruta';

describe('HojaRuta', () => {
  let component: HojaRuta;
  let fixture: ComponentFixture<HojaRuta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HojaRuta],
    }).compileComponents();

    fixture = TestBed.createComponent(HojaRuta);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
