// Fator de conversão: 1 pacote de velcro equivale a 500 pares[cite: 4]
export const PROPORCAO_VELCRO_PAR_PACOTE = 500;

type TipoUnidade = 'pares' | 'pacotes';

export interface ResultadoConversao {
  quantidadeConvertida: number;
  unidadeDestino: TipoUnidade;
}