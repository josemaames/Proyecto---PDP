export interface ExpedientePDP {
  id: number;

  codigo: string;

  nombreAccionFormacion: string;

  tipoAccionFormacion: string;

  estado: string;

  costoTotal: number;

  cantidadBeneficiarios: number;

  fechaInicio: string;

  fechaFin: string;

  proveedor: string;

  responsable: string;
}
