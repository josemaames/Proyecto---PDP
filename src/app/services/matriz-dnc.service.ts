import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class MatrizDncService {
  private apiUrl = '/api/actividades';

  constructor(private http: HttpClient) {}

  guardar(matriz: any) {
    return this.http.post(this.apiUrl, matriz);
  }
}
