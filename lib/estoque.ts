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
  quantidade: quantidadeRaw,
  observacao,
  sincronizarVelcro = true,
}: RegistarMovimentacaoParams) {
  try {
    // Forçar conversão estrita para número para evitar concatenação de strings ou NaN
    const quantidade = Number(quantidadeRaw) || 0;

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
    const estoqueAtual = Number(produto?.estoque_atual) || 0;
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

    // 5. Sincronização Automática de Velcro com conversão numérica blindada
    if (sincronizarVelcro && produto?.nome) {
      const nomeLower = produto.nome.toLowerCase();
      if (nomeLower.includes('velcro')) {
        const ePacote = nomeLower.includes('pacote') || nomeLower.includes('pacotes');

        const { data: parceiros, error: erroParceiro } = await supabase
          .from('produtos')
          .select('id, nome')
          .neq('id', produtoId);

        if (!erroParceiro && parceiros) {
          const produtoParceiro = parceiros.find((p) => {
            const pNome = p.nome.toLowerCase();
            if (!pNome.includes('velcro')) return false;
            
            if (ePacote) {
              return pNome.includes('par') || pNome.includes('pares');
            } else {
              return pNome.includes('pacote') || pNome.includes('pacotes');
            }
          });

          if (produtoParceiro) {
            const quantidadeConvertida = ePacote
              ? quantidade * PROPORCAO_VELCRO_PAR_PACOTE
              : quantidade / PROPORCAO_VELCRO_PAR_PACOTE;

            await registarMovimentacaoEstoque({
              produtoId: produtoParceiro.id,
              tipo,
              quantidade: quantidadeConvertida,
              observacao: `Sincronização automática de Velcro (${ePacote ? 'Pacotes ➔ Pares' : 'Pares ➔ Pacotes'})`,
              sincronizarVelcro: false, // Previne loop infinito
            });
          }
        }
      }
    }

    return { success: true, novoEstoque };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error('Erro ao registar movimentação de estoque:', errorObj?.message);
    throw err;
  }
}

// Alias para compatibilidade com outras páginas
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
  registrarOrigem?: boolean;
}

export function ehVelcro(nome: string): boolean {
  return nome.toLowerCase().includes('velcro');
}

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
  quantidade,
  unidadeOrigem,
  tipo,
  observacao,
  registrarOrigem = true,
}: ParametrosVelcro) {
  try {
    const qtdNum = Number(quantidade) || 0;
    let qtdConvertida = 0;

    if (unidadeOrigem === 'pares') {
      qtdConvertida = qtdNum / PROPORCAO_VELCRO_PAR_PACOTE;
    } else {
      qtdConvertida = qtdNum * PROPORCAO_VELCRO_PAR_PACOTE;
    }

    if (registrarOrigem) {
      await registarMovimentacaoEstoque({
        produtoId: produtoIdOrigem,
        tipo,
        quantidade: qtdNum,
        observacao: `${observacao || 'Lançamento de velcro'} (${unidadeOrigem})`,
        sincronizarVelcro: true,
      });
    }

    return { 
      success: true, 
      quantidadeOriginal: qtdNum, 
      quantidadeConvertida: qtdConvertida 
    };

  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error('Erro ao processar lançamento de velcro:', errorObj?.message);
    throw err;
  }
}