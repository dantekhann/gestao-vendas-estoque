import { supabase } from '@/lib/supabase';
import { registarMovimentacaoEstoque } from '@/lib/estoque';

export interface MetaProducao {
  id: string;
  produto_id: string;
  nome_produto: string;
  quantidade_alvo: number;
  atualizado_em: string;
}

export interface ResultadoMeta {
  produziu: number;        // unidades lançadas como produção (0 se não caiu)
  aumentouDemanda: boolean; // true se o número subiu
}

export async function listarMetasProducao(): Promise<MetaProducao[]> {
  const { data, error } = await supabase
    .from('metas_producao')
    .select('id, produto_id, quantidade_alvo, atualizado_em, produtos(nome)');

  if (error) throw error;

  return (data ?? [])
    .map((linha) => {
      // O Supabase pode devolver o produto relacionado como objeto OU lista.
      // Aceitamos os dois formatos e extraímos o nome.
      const relacionamento = linha.produtos as unknown;
      const produto = Array.isArray(relacionamento)
        ? (relacionamento[0] as { nome?: string } | undefined)
        : (relacionamento as { nome?: string } | null);

      return {
        id: linha.id as string,
        produto_id: linha.produto_id as string,
        nome_produto: produto?.nome ?? 'Produto',
        quantidade_alvo: Number(linha.quantidade_alvo) || 0,
        atualizado_em: linha.atualizado_em as string,
      };
    })
    .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto));
}

export async function atualizarMetaProducao(
  meta: MetaProducao,
  novoValor: number
): Promise<ResultadoMeta> {
  const novo = Math.max(0, Math.floor(Number(novoValor) || 0));
  const anterior = Math.max(0, Math.floor(Number(meta.quantidade_alvo) || 0));

  // Associação inversa: número caiu → a diferença É produção
  const produziu = novo < anterior ? anterior - novo : 0;

  if (produziu > 0) {
    // Reaproveita a função de produzir: ENTRADA sobe o estoque do display
    // E desconta a Caixa Yerba/Yerbinha automaticamente (lógica já existente)
    await registarMovimentacaoEstoque({
      produtoId: meta.produto_id,
      tipo: 'ENTRADA',
      quantidade: produziu,
      observacao: `Produção registrada pela meta "precisa produzir" (${anterior} → ${novo})`,
    });
  }

  const { error } = await supabase
    .from('metas_producao')
    .update({ quantidade_alvo: novo, atualizado_em: new Date().toISOString() })
    .eq('id', meta.id);

  if (error) throw error;

  return { produziu, aumentouDemanda: novo > anterior };
}