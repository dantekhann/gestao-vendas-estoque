// lib/constants.ts

export const FORMAS_PAGAMENTO = [
  'PIX',
  'BOLETO',
  'DINHEIRO',
  'CARTÃO',
  'OUTROS',
] as const;

export const TIPOS_MOVIMENTACAO = [
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'SAIDA', label: 'Saída' },
  { value: 'VENDA', label: 'Venda' },
  { value: 'AJUSTE', label: 'Ajuste' },
] as const;