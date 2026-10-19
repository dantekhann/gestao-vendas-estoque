import { supabase } from "@/lib/supabase";
import { registarMovimentacaoEstoque } from "@/lib/estoque";

export interface MetaProducao {
  id: string;
  produto_id: string;
  nome_produto: string;
  quantidade_alvo: number;
  estoque_atual: number;
  estoque_minimo: number | null;
  atualizado_em: string;
}

export interface ResultadoMeta {
  produziu: number; // unidades lançadas como produção (0 se não caiu)
  aumentouDemanda: boolean; // true se o número subiu
}

// Mesmas leitoras defensivas do lib/relatorio.ts — já validadas pelo seu banco
function extrairEstoque(produto: Record<string, unknown>): number {
  const candidatos = [
    "quantidade_estoque",
    "estoque_atual",
    "quantidade",
    "saldo",
  ];
  for (const campo of candidatos) {
    const valor = produto[campo];
    if (valor !== undefined && valor !== null) {
      const n = Number(valor);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function extrairMinimo(produto: Record<string, unknown>): number | null {
  const candidatos = ["estoque_minimo", "quantidade_minima", "minimo"];
  for (const campo of candidatos) {
    const valor = produto[campo];
    if (valor !== undefined && valor !== null) {
      const n = Number(valor);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

export async function listarMetasProducao(): Promise<MetaProducao[]> {
  const { data, error } = await supabase
    .from("metas_producao")
    .select("id, produto_id, quantidade_alvo, atualizado_em, produtos(*)");

  if (error) throw error;

  return (data ?? [])
    .map((linha) => {
      // O Supabase pode devolver o produto relacionado como objeto OU lista.
      const relacionamento = linha.produtos as unknown;
      const produto = Array.isArray(relacionamento)
        ? (relacionamento[0] as Record<string, unknown> | undefined)
        : (relacionamento as Record<string, unknown> | null);

      return {
        id: linha.id as string,
        produto_id: linha.produto_id as string,
        nome_produto: String(produto?.nome ?? "Produto"),
        quantidade_alvo: Number(linha.quantidade_alvo) || 0,
        estoque_atual: produto ? extrairEstoque(produto) : 0,
        estoque_minimo: produto ? extrairMinimo(produto) : null,
        atualizado_em: linha.atualizado_em as string,
      };
    })
    .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto));
}

export async function atualizarMetaProducao(
  meta: MetaProducao,
  novoValor: number,
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
      tipo: "ENTRADA",
      quantidade: produziu,
      observacao: `Produção registrada pela meta "precisa produzir" (${anterior} → ${novo})`,
    });
  }

  const { error } = await supabase
    .from("metas_producao")
    .update({ quantidade_alvo: novo, atualizado_em: new Date().toISOString() })
    .eq("id", meta.id);

  if (error) throw error;

  return { produziu, aumentouDemanda: novo > anterior };
}
