import { supabase } from "@/lib/supabase";

export type TipoMovimentacao = "ENTRADA" | "SAIDA" | "AJUSTE" | "VENDA";

export const PROPORCAO_VELCRO_PAR_PACOTE = 500;

// ============================================================
// CAIXAS DE DISPLAY: 1 caixa descontada por display produzido
// ============================================================
const CAIXA_POR_DISPLAY: Record<string, string> = {
  "display yerba": "Caixas Yerba",
  "display yerbinha": "Caixas Yerbinha",
};

async function descontarCaixaDoDisplay(
  nomeDisplay: string,
  quantidadeProduzida: number,
): Promise<void> {
  const chave = Object.keys(CAIXA_POR_DISPLAY).find((k) =>
    nomeDisplay.toLowerCase().includes(k),
  );
  if (!chave) return;
  const nomeCaixa = CAIXA_POR_DISPLAY[chave];
  const quantidadeCaixas = Math.max(1, Math.round(quantidadeProduzida));
  const { data: caixas, error: erroCaixa } = await supabase
    .from("produtos")
    .select("id, nome, estoque_atual")
    .ilike("nome", `%${nomeCaixa}%`)
    .eq("ativo", true)
    .limit(1);
  if (erroCaixa) {
    console.error(`Erro ao buscar ${nomeCaixa}:`, erroCaixa);
    return;
  }
  if (!caixas || caixas.length === 0) {
    console.warn(
      `Produto "${nomeCaixa}" não encontrado ou inativo — baixa de caixa ignorada.`,
    );
    return;
  }
  const caixa = caixas[0];
  const { error: erroMov } = await supabase
    .from("movimentacoes_estoque")
    .insert({
      produto_id: caixa.id,
      tipo: "SAIDA",
      quantidade: quantidadeCaixas,
      observacao: `Sincronização automática (Baixa de ${nomeCaixa} para ${nomeDisplay})`,
    });
  if (erroMov) {
    console.error(`Erro ao lançar baixa de ${nomeCaixa}:`, erroMov);
    return;
  }
  await supabase
    .from("produtos")
    .update({ estoque_atual: (caixa.estoque_atual ?? 0) - quantidadeCaixas })
    .eq("id", caixa.id);
}

// ============================================================
// SINCRONIZAÇÃO DESMAROLA: 1 unidade consome 1 rótulo + 1 caixa + 1 frasco
// ============================================================
function extrairSaborDesmarola(nome: string): string | null {
  const lower = nome.toLowerCase();
  if (!lower.includes("desmarola")) return null;
  if (lower.includes("essencia") || lower.includes("essência")) return null;
  if (!lower.includes("unidade")) return null;
  const m = nome.match(/-\s*(.+?)\s*\(/i);
  return m ? m[1].trim() : null;
}

async function descontarInsumosDesmarola(
  nomeProduto: string,
  quantidade: number,
): Promise<void> {
  const sabor = extrairSaborDesmarola(nomeProduto);
  if (!sabor) return;
  const qtd = Math.max(1, Math.round(quantidade));
  const alvos = [
    `Rótulo Desmarola ${sabor}`,
    `Caixa Desmarola ${sabor}`,
    "Frascos Desmarola",
  ];
  for (const nomeAlvo of alvos) {
    const { data: insumos, error: erroBusca } = await supabase
      .from("produtos")
      .select("id, nome, estoque_atual")
      .ilike("nome", `%${nomeAlvo}%`)
      .eq("ativo", true)
      .limit(1);
    if (erroBusca) {
      console.error(`Erro ao buscar ${nomeAlvo}:`, erroBusca);
      continue;
    }
    if (!insumos || insumos.length === 0) {
      console.warn(
        `Insumo "${nomeAlvo}" não encontrado ou inativo. Baixa ignorada.`,
      );
      continue;
    }
    const insumo = insumos[0];
    const { error: erroMov } = await supabase
      .from("movimentacoes_estoque")
      .insert({
        produto_id: insumo.id,
        tipo: "SAIDA",
        quantidade: qtd,
        observacao: `Sincronização automática (Baixa de ${insumo.nome} para ${nomeProduto})`,
      });
    if (erroMov) {
      console.error(`Erro ao lançar baixa de ${insumo.nome}:`, erroMov);
      continue;
    }
    await supabase
      .from("produtos")
      .update({ estoque_atual: (insumo.estoque_atual ?? 0) - qtd })
      .eq("id", insumo.id);
  }
}

// ============================================================
// DISPLAY DE BOLADOS: 1 display consome 10 maços + 120 bolados (12 por maço)
// ============================================================
const MACOS_POR_DISPLAY = 10;
const BOLADOS_POR_DISPLAY = 120;

async function descontarInsumosBolados(
  nomeProduto: string,
  quantidade: number,
): Promise<void> {
  console.log(`[Bolados Sync] chamada: "${nomeProduto}" x${quantidade}`);
  const lower = nomeProduto.toLowerCase();
  if (!lower.includes("display") || !lower.includes("bolado")) return;
  const qtd = Math.round(quantidade);
  if (qtd <= 0) return;
  const alvos = [
    { termo: "Maços", quantidade: qtd * MACOS_POR_DISPLAY },
    { termo: "Bolados", quantidade: qtd * BOLADOS_POR_DISPLAY },
  ];
  for (const alvo of alvos) {
    const { data: insumos, error: erroBusca } = await supabase
      .from("produtos")
      .select("id, nome, estoque_atual")
      .ilike("nome", `%${alvo.termo}%`)
      .eq("ativo", true)
      .limit(5);
    if (erroBusca) {
      console.error(`Erro ao buscar ${alvo.termo}:`, erroBusca);
      continue;
    }
    // Preferência: match exato do nome (evita casar com "Rolo Saco Plástico (bolados)")
    const lowerTermo = alvo.termo.toLowerCase();
    const insumo =
      (insumos ?? []).find((p) => p.nome.toLowerCase() === lowerTermo) ??
      (insumos ?? []).find((p) => !p.nome.toLowerCase().includes("display"));
    if (!insumo) {
      console.warn(
        `Insumo "${alvo.termo}" não encontrado ou inativo. Baixa ignorada.`,
      );
      continue;
    }
    const { error: erroMov } = await supabase
      .from("movimentacoes_estoque")
      .insert({
        produto_id: insumo.id,
        tipo: "SAIDA",
        quantidade: alvo.quantidade,
        observacao: `Sincronização automática (Baixa de ${insumo.nome} para ${nomeProduto})`,
      });
    if (erroMov) {
      console.error(`Erro ao lançar baixa de ${insumo.nome}:`, erroMov);
      continue;
    }
    await supabase
      .from("produtos")
      .update({ estoque_atual: (insumo.estoque_atual ?? 0) - alvo.quantidade })
      .eq("id", insumo.id);
  }
}

interface RegistrarMovimentacaoParams {
  produtoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
  sincronizarVelcro?: boolean;
  sincronizarCaixa?: boolean;
}

export async function registrarMovimentacaoEstoque({
  produtoId,
  tipo,
  quantidade,
  observacao,
  sincronizarVelcro = true,
  sincronizarCaixa = true,
}: RegistrarMovimentacaoParams) {
  try {
    // 1. Buscar dados do produto (nome e estoque atual)
    const { data: produto, error: erroProdBusca } = await supabase
      .from("produtos")
      .select("id, nome, estoque_atual")
      .eq("id", produtoId)
      .single();
    if (erroProdBusca) throw erroProdBusca;
    // 2. Inserir o registo na tabela de movimentações
    const { error: erroMov } = await supabase
      .from("movimentacoes_estoque")
      .insert([
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
    if (tipo === "ENTRADA") {
      novoEstoque = estoqueAtual + quantidade;
    } else if (tipo === "SAIDA" || tipo === "VENDA") {
      novoEstoque = Math.max(0, estoqueAtual - quantidade);
    } else if (tipo === "AJUSTE") {
      novoEstoque = quantidade;
    }
    // 4. Atualizar o estoque na tabela de produtos
    const { error: erroProdUpdate } = await supabase
      .from("produtos")
      .update({ estoque_atual: novoEstoque })
      .eq("id", produtoId);
    if (erroProdUpdate) throw erroProdUpdate;
    // 5. Sincronização Automática de Velcro
    if (sincronizarVelcro && produto?.nome) {
      const nomeLower = produto.nome.toLowerCase();
      if (nomeLower.includes("velcro")) {
        const ePacote =
          nomeLower.includes("pacote") || nomeLower.includes("pacotes");
        const { data: parceiros, error: erroParceiro } = await supabase
          .from("produtos")
          .select("id, nome")
          .eq("ativo", true)
          .neq("id", produtoId);
        if (!erroParceiro && parceiros) {
          const produtoParceiro = parceiros.find((p) => {
            const pNome = p.nome.toLowerCase();
            if (!pNome.includes("velcro")) return false;
            if (ePacote) {
              return pNome.includes("par") || pNome.includes("pares");
            } else {
              return pNome.includes("pacote") || pNome.includes("pacotes");
            }
          });
          if (produtoParceiro) {
            const quantidadeConvertida = ePacote
              ? Math.round(quantidade * PROPORCAO_VELCRO_PAR_PACOTE)
              : Math.round(quantidade / PROPORCAO_VELCRO_PAR_PACOTE);
            await registrarMovimentacaoEstoque({
              produtoId: produtoParceiro.id,
              tipo,
              quantidade: quantidadeConvertida,
              observacao: `Sincronização automática de Velcro (${ePacote ? "Pacotes ➔ Pares" : "Pares ➔ Pacotes"})`,
              sincronizarVelcro: false,
            });
          }
        }
      }
    }
    // 6. Sincronização Desmarola: 1 unidade = 1 rótulo + 1 caixa + 1 frasco
    if (tipo === "ENTRADA" && produto?.nome) {
      await descontarInsumosDesmarola(produto.nome, quantidade);
    }
    // 7. Sincronização Display de Bolados: 1 display = 10 maços + 120 bolados
    if (tipo === "ENTRADA" && produto?.nome) {
      await descontarInsumosBolados(produto.nome, quantidade);
    }
    // 8. Baixa de caixa para displays Yerba/Yerbinha
    if (tipo === "ENTRADA" && produto?.nome && sincronizarCaixa !== false) {
      await descontarCaixaDoDisplay(produto.nome, quantidade);
    }
    return { success: true, novoEstoque };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error(
      "Erro ao registar movimentação de estoque:",
      errorObj?.message,
    );
    throw err;
  }
}

// Alias para compatibilidade com outras páginas
export const movimentarEstoque = registrarMovimentacaoEstoque;
export const registarMovimentacaoEstoque = registrarMovimentacaoEstoque;

// ==========================================
// LÓGICA DE CONVERSÃO E LANÇAMENTO DE VELCRO (MANUAL)
// ==========================================
export type UnidadeVelcro = "pares" | "pacotes";

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
  return nome.toLowerCase().includes("velcro");
}

export function encontrarParceiroVelcro<T extends { id: string; nome: string }>(
  produto: { id: string; nome: string },
  catalogo: T[],
): { parceiro: T | undefined; unidadeOrigem: UnidadeVelcro } {
  const ePacote = produto.nome.toLowerCase().includes("pacote");
  const termoParceiro = ePacote ? "par" : "pacote";
  const parceiro = catalogo.find(
    (p) =>
      p.id !== produto.id &&
      ehVelcro(p.nome) &&
      p.nome.toLowerCase().includes(termoParceiro),
  );
  return { parceiro, unidadeOrigem: ePacote ? "pacotes" : "pares" };
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
    if (unidadeOrigem === "pares") {
      qtdConvertida = qtdNum / PROPORCAO_VELCRO_PAR_PACOTE;
    } else {
      qtdConvertida = qtdNum * PROPORCAO_VELCRO_PAR_PACOTE;
    }
    if (registrarOrigem) {
      await registrarMovimentacaoEstoque({
        produtoId: produtoIdOrigem,
        tipo,
        quantidade: qtdNum,
        observacao: `${observacao || "Lançamento de velcro"} (${unidadeOrigem})`,
        sincronizarVelcro: true,
      });
    }
    return {
      success: true,
      quantidadeOriginal: qtdNum,
      quantidadeConvertida: qtdConvertida,
    };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error("Erro ao processar lançamento de velcro:", errorObj?.message);
    throw err;
  }
}
