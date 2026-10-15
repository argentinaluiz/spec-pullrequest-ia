/** A sessão de envio criada: para onde o navegador manda os bytes e até quando ela vale. */
export class UploadDto {
  itemId: string;
  uploadUrl: string;
  expiresAt: Date;
}
