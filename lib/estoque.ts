import { createClient } from '@/utils/supabase/client';

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'VENDA';

interface MovimentarEstoqueParams {
  produtoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
}

/**
 * Executa uma movimentação de estoque atômica no banco de dados (com trava de linha e validação).
 */
export async function movimentarEstoque({
  produtoId,
  tipo,
  quantidade,
  observacao = '',
}: MovimentarEstoqueParams) {
  const supabase = createClient();

  const { error } = await supabase.rpc('movimentar_estoque', {
    p_produto_id: produtoId,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_observacao: observacao,
  });

  if (error) {
    console.error('Erro ao movimentar estoque:', error.message);
    throw new Error(error.message);
  }

  return { success: true };
}