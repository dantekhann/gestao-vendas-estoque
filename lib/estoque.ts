import { supabase } from '@/lib/supabase';

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'VENDA';

interface RegistarMovimentacaoParams {
  produtoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
}

export async function registarMovimentacaoEstoque({
  produtoId,
  tipo,
  quantidade,
  observacao,
}: RegistarMovimentacaoParams) {
  try {
    // 1. Inserir o registo na tabela de movimentações
    const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert([
      {
        produto_id: produtoId,
        tipo,
        quantidade,
        observacao: observacao || null,
      },
    ]);

    if (erroMov) throw erroMov;

    // 2. Buscar o estoque atual do produto
    const { data: produto, error: erroProdBusca } = await supabase
      .from('produtos')
      .select('estoque_atual')
      .eq('id', produtoId)
      .single();

    if (erroProdBusca) throw erroProdBusca;

    const estoqueAtual = produto?.estoque_atual ?? 0;
    let novoEstoque = estoqueAtual;

    if (tipo === 'ENTRADA') {
      novoEstoque = estoqueAtual + quantidade;
    } else if (tipo === 'SAIDA' || tipo === 'VENDA') {
      novoEstoque = Math.max(0, estoqueAtual - quantidade);
    } else if (tipo === 'AJUSTE') {
      novoEstoque = quantidade;
    }

    // 3. Atualizar o estoque na tabela de produtos
    const { error: erroProdUpdate } = await supabase
      .from('produtos')
      .update({ estoque_atual: novoEstoque })
      .eq('id', produtoId);

    if (erroProdUpdate) throw erroProdUpdate;

    return { success: true, novoEstoque };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error('Erro ao registar movimentação de estoque:', errorObj?.message);
    throw err;
  }
}

// Alias para compatibilidade com a página de lançamento de vendas
export const movimentarEstoque = registarMovimentacaoEstoque;