import { supabase } from '@/lib/supabase';

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA' | 'AJUSTE' | 'VENDA';

export const PROPORCAO_VELCRO_PAR_PACOTE = 500;

interface RegistarMovimentacaoParams {
  produtoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
  sincronizarVelcro?: boolean;
}

export async function registarMovimentacaoEstoque({
  produtoId,
  tipo,
  quantidade,
  observacao,
  sincronizarVelcro = true,
}: RegistarMovimentacaoParams) {
  try {
    // 1. Buscar dados do produto (nome e estoque atual)
    const { data: produto, error: erroProdBusca } = await supabase
      .from('produtos')
      .select('id, nome, estoque_atual')
      .eq('id', produtoId)
      .single();

    if (erroProdBusca) throw erroProdBusca;

    // 2. Inserir o registo na tabela de movimentações
    const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert([
      {
        produto_id: produtoId,
        tipo,
        quantidade,
        observacao: observacao || null,
      },
    ]);

    if (erroMov) throw erroMov;

    // 3. Buscar o estoque atual e calcular o novo valor
    const estoqueAtual = produto?.estoque_atual ?? 0;
    let novoEstoque = estoqueAtual;

    if (tipo === 'ENTRADA') {
      novoEstoque = estoqueAtual + quantidade;
    } else if (tipo === 'SAIDA' || tipo === 'VENDA') {
      novoEstoque = Math.max(0, estoqueAtual - quantidade);
    } else if (tipo === 'AJUSTE') {
      novoEstoque = quantidade;
    }

    // 4. Atualizar o estoque na tabela de produtos
    const { error: erroProdUpdate } = await supabase
      .from('produtos')
      .update({ estoque_atual: novoEstoque })
      .eq('id', produtoId);

    if (erroProdUpdate) throw erroProdUpdate;

    // 5. Sincronização Automática de Velcro (1 pacote = 500 pares)
    if (sincronizarVelcro && produto?.nome.toLowerCase().includes('velcro')) {
      const nomeLower = produto.nome.toLowerCase();
      const ePacote = nomeLower.includes('pacote');
      const termoBuscaParceiro = ePacote ? 'par' : 'pacote';

      const { data: parceiros } = await supabase
        .from('produtos')
        .select('id, nome')
        .neq('id', produtoId);

      const produtoParceiro = parceiros?.find(
        (p) => p.nome.toLowerCase().includes('velcro') && p.nome.toLowerCase().includes(termoBuscaParceiro)
      );

      if (produtoParceiro) {
        const quantidadeConvertida = ePacote
          ? quantidade * PROPORCAO_VELCRO_PAR_PACOTE
          : quantidade / PROPORCAO_VELCRO_PAR_PACOTE;

        await registarMovimentacaoEstoque({
          produtoId: produtoParceiro.id,
          tipo,
          quantidade: quantidadeConvertida,
          observacao: `Sincronização automática de Velcro (${ePacote ? 'Pacotes ➔ Pares' : 'Pares ➔ Pacotes'})`,
          sincronizarVelcro: false, // Previne loop recursivo
        });
      }
    }

    return { success: true, novoEstoque };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error('Erro ao registar movimentação de estoque:', errorObj?.message);
    throw err;
  }
}

// Alias para compatibilidade com a página de lançamento de vendas
export const movimentarEstoque = registarMovimentacaoEstoque;

// ==========================================
// LÓGICA DE CONVERSÃO E LANÇAMENTO DE VELCRO (MANUAL)
// ==========================================

export type UnidadeVelcro = 'pares' | 'pacotes';

interface ParametrosVelcro {
  produtoIdOrigem: string;
  produtoIdParceiro?: string;
  quantidade: number;
  unidadeOrigem: UnidadeVelcro;
  tipo: TipoMovimentacao;
  observacao?: string;
  /**
   * Quando false, só o produto parceiro é movimentado. Use false quando o produto de origem
   * já teve o estoque atualizado por outra rotina (ex.: função do banco que registra
   * o recebimento de um pedido), para não contar a mesma entrada duas vezes.
   */
  registrarOrigem?: boolean;
}

export function ehVelcro(nome: string): boolean {
  return nome.toLowerCase().includes('velcro');
}

/**
 * Localiza, no catálogo, o produto parceiro do velcro (pacote <-> pares)
 * e informa a unidade em que o produto informado é controlado.
 */
export function encontrarParceiroVelcro<T extends { id: string; nome: string }>(
  produto: { id: string; nome: string },
  catalogo: T[]
): { parceiro: T | undefined; unidadeOrigem: UnidadeVelcro } {
  const ePacote = produto.nome.toLowerCase().includes('pacote');
  const termoParceiro = ePacote ? 'par' : 'pacote';

  const parceiro = catalogo.find(
    (p) =>
      p.id !== produto.id &&
      ehVelcro(p.nome) &&
      p.nome.toLowerCase().includes(termoParceiro)
  );

  return { parceiro, unidadeOrigem: ePacote ? 'pacotes' : 'pares' };
}

export async function processarLancamentoVelcro({
  produtoIdOrigem,
  produtoIdParceiro,
  quantidade,
  unidadeOrigem,
  tipo,
  observacao,
  registrarOrigem = true,
}: ParametrosVelcro) {
  try {
    let qtdParceiro = 0;

    if (unidadeOrigem === 'pares') {
      qtdParceiro = quantidade / PROPORCAO_VELCRO_PAR_PACOTE;
    } else {
      qtdParceiro = quantidade * PROPORCAO_VELCRO_PAR_PACOTE;
    }

    // Movimentação principal usando a função robusta unificada
    if (registrarOrigem) {
      await registarMovimentacaoEstoque({
        produtoId: produtoIdOrigem,
        tipo,
        quantidade,
        observacao: `${observacao || 'Lançamento de velcro'} (${unidadeOrigem})`,
        sincronizarVelcro: false,
      });
    }

    if (produtoIdParceiro) {
      const unidadeDestino = unidadeOrigem === 'pares' ? 'pacotes' : 'pares';
      await registarMovimentacaoEstoque({
        produtoId: produtoIdParceiro,
        tipo,
        quantidade: qtdParceiro,
        observacao: `Conversão automática (${unidadeOrigem} -> ${unidadeDestino}): ${observacao || ''}`,
        sincronizarVelcro: false,
      });
    }

    return { 
      success: true, 
      quantidadeOriginal: quantidade, 
      quantidadeConvertida: qtdParceiro 
    };

  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error('Erro ao processar lançamento de velcro:', errorObj?.message);
    throw err;
  }
}
