import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CarpetaDrive {
  red: string;
  drive_url: string;
  actualizado_por?: string;
  actualizado_at?: string;
}

@Injectable({ providedIn: 'root' })
export class CarpetasDriveService {
  private http = inject(HttpClient);

  getTodas(): Observable<CarpetaDrive[]> {
    return this.http.get<CarpetaDrive[]>('/api/certificados/carpetas');
  }

  getPorRed(red: string): Observable<{ existe: boolean; drive_url?: string }> {
    return this.http.get<{ existe: boolean; drive_url?: string }>(
      `/api/certificados/carpetas/${encodeURIComponent(red)}`,
    );
  }

  guardar(red: string, driveUrl: string, actorNombre: string): Observable<CarpetaDrive> {
    return this.http.put<CarpetaDrive>(`/api/certificados/carpetas/${encodeURIComponent(red)}`, {
      drive_url: driveUrl,
      actualizado_por: actorNombre,
    });
  }
}
