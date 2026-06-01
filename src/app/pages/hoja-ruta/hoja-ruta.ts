import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-hoja-ruta',
  imports: [],
  templateUrl: './hoja-ruta.html',
  styleUrl: './hoja-ruta.css',
})
export class HojaRuta implements OnInit {
  expediente: string = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.expediente = params['expediente'] || '';
    });
  }
}
