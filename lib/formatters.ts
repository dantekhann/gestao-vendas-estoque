// lib/formatters.ts

/**
 * Formata um número para o padrão de moeda brasileira (R$).
 */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/**
 * Formata uma data ISO (YYYY-MM-DD ou datetime) para o formato brasileiro (DD/MM/YYYY).
 */
export function formatarData(dataIso?: string): string {
  if (!dataIso) return '—';
  const dataPart = dataIso.split('T')[0];
  const partes = dataPart.split('-');
  if (partes.length !== 3) return dataIso;
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}