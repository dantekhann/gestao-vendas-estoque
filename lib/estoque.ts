import { supabase } from "@/lib/supabase";

export type TipoMovimentacao = "ENTRADA" | "SAIDA" | "AJUSTE" | "VENDA";
export const PROPORCAO_VELCRO_PAR_PACOTE = 500;

// Prefixo das saídas de consumo de produção (filtrável no histórico)
export const PREFIXO_CONSUMO_PRODUCAO = "CONSUMO_PRODUCAO";

type Insumo = { id: string; nome: string; estoque_atual: number | null };

// ============================================================
// BUSCA E BAIXA DE INSUMOS (ponto único de saída automática)
// ============================================================

// Prefere o nome exato; se não houver, usa o primeiro que passar em `aceitar`.
// Evita que "Caixas Yerba" case com "Caixas Yerbinha".
async function buscarInsumo(
  termo: string,
  aceitar: (nome: string) => boolean = () => true,
): Promise<Insumo | null> {
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, estoque_atual")
    .ilike("nome", `%${termo}%`)
    .eq("ativo", true)
    .limit(10);

  if (error) {
    console.error(`Erro ao buscar ${termo}:`, error);
    return null;
  }

  const lista = (data ?? []) as Insumo[];
  const exato = lista.find((p) => p.nome.toLowerCase() === termo.toLowerCase());
  if (exato) return exato;
  return lista.find((p) => aceitar(p.nome)) ?? null;
}

async function lancarSaidaInsumo(
  insumo: Insumo,
  quantidade: number,
  observacao: string,
): Promise<void> {
  const qtd = Math.round(quantidade);
  if (qtd <= 0) return;

  const { error: erroMov } = await supabase
    .from("movimentacoes_estoque")
    .insert({
      produto_id: insumo.id,
      tipo: "SAIDA",
      quantidade: qtd,
      observacao,
    });
  if (erroMov) {
    console.error(`Erro ao lançar baixa de ${insumo.nome}:`, erroMov);
    return;
  }

  await supabase
    .from("produtos")
    .update({ estoque_atual: (Number(insumo.estoque_atual) || 0) - qtd })
    .eq("id", insumo.id);
}

// Chave mais específica primeiro: "display yerbinha" antes de "display yerba"
function chaveDoDisplay(
  nomeDisplay: string,
  mapa: Record<string, unknown>,
): string | null {
  const nome = nomeDisplay.toLowerCase();
  return (
    Object.keys(mapa)
      .sort((a, b) => b.length - a.length)
      .find((k) => nome.includes(k)) ?? null
  );
}

// ============================================================
// CAIXAS DE DISPLAY: 1 caixa por display produzido
// ============================================================
const CAIXA_POR_DISPLAY: Record<string, string> = {
  "display yerba": "Caixas Yerba",
  "display yerbinha": "Caixas Yerbinha",
};

async function descontarCaixaDoDisplay(
  nomeDisplay: string,
  quantidade: number,
): Promise<void> {
  const chave = chaveDoDisplay(nomeDisplay, CAIXA_POR_DISPLAY);
  if (!chave) return;

  const nomeCaixa = CAIXA_POR_DISPLAY[chave];
  const caixa = await buscarInsumo(nomeCaixa);
  if (!caixa) {
    console.warn(
      `Produto "${nomeCaixa}" não encontrado ou inativo — baixa de caixa ignorada.`,
    );
    return;
  }

  await lancarSaidaInsumo(
    caixa,
    Math.max(1, quantidade),
    `Sincronização automática (Baixa de ${caixa.nome} para ${nomeDisplay})`,
  );
}

// ============================================================
// TABACO GRANEL (em gramas): 180 g por Display Yerba, 120 g por Display Yerbinha
// ============================================================
const TABACO_POR_DISPLAY_G: Record<string, number> = {
  "display yerba": 180,
  "display yerbinha": 120,
};
const NOME_GRANEL = "Tabaco a Granel";

async function descontarTabacoDoDisplay(
  nomeDisplay: string,
  quantidade: number,
): Promise<void> {
  const chave = chaveDoDisplay(nomeDisplay, TABACO_POR_DISPLAY_G);
  if (!chave) return;

  const gramasPorUnidade = TABACO_POR_DISPLAY_G[chave];
  const gramas = Math.round(gramasPorUnidade * quantidade);
  if (gramas <= 0) return;

  const granel = await buscarInsumo(NOME_GRANEL);
  if (!granel) {
    console.warn(
      'Produto "Tabaco a Granel" não encontrado ou inativo — consumo de tabaco ignorado.',
    );
    return;
  }

  await lancarSaidaInsumo(
    granel,
    gramas,
    `${PREFIXO_CONSUMO_PRODUCAO} | ${nomeDisplay} | ${quantidade} un × ${gramasPorUnidade} g`,
  );
}

// ============================================================
// SINCRONIZAÇÃO DESMAROLA: 1 unidade = 1 rótulo + 1 caixa + 1 frasco
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
  const termos = [
    `Rótulo Desmarola ${sabor}`,
    `Caixa Desmarola ${sabor}`,
    "Frascos Desmarola",
  ];

  for (const termo of termos) {
    const insumo = await buscarInsumo(termo);
    if (!insumo) {
      console.warn(`Insumo "${termo}" não encontrado ou inativo. Baixa ignorada.`);
      continue;
    }
    await lancarSaidaInsumo(
      insumo,
      qtd,
      `Sincronização automática (Baixa de ${insumo.nome} para ${nomeProduto})`,
    );
  }
}

// ============================================================
// DISPLAY DE BOLADOS: 10 maços + 120 bolados + 1 caixa por display
// ============================================================
const MACOS_POR_DISPLAY = 10;
const BOLADOS_POR_DISPLAY = 120;

async function descontarInsumosBolados(
  nomeProduto: string,
  quantidade: number,
): Promise<void> {
  const lower = nomeProduto.toLowerCase();
  if (!lower.includes("display") || !lower.includes("bolado")) return;
  // "Display Bolados (Caixa)" é embalagem: não dispara a sincronização
  if (lower.includes("caixa")) return;

  const qtd = Math.round(quantidade);
  if (qtd <= 0) return;

  const semDisplay = (nome: string) => !nome.toLowerCase().includes("display");

  const alvos: { termo: string; quantidade: number; aceitar: (n: string) => boolean }[] = [
    { termo: "Maços", quantidade: qtd * MACOS_POR_DISPLAY, aceitar: semDisplay },
    { termo: "Bolados", quantidade: qtd * BOLADOS_POR_DISPLAY, aceitar: semDisplay },
    { termo: "Display Bolados (Caixa)", quantidade: qtd, aceitar: () => true },
  ];

  for (const alvo of alvos) {
    const insumo = await buscarInsumo(alvo.termo, alvo.aceitar);
    if (!insumo) {
      console.warn(`Insumo "${alvo.termo}" não encontrado ou inativo. Baixa ignorada.`);
      continue;
    }
    await lancarSaidaInsumo(
      insumo,
      alvo.quantidade,
      `Sincronização automática (Baixa de ${insumo.nome} para ${nomeProduto})`,
    );
  }
}

// ============================================================
// MOVIMENTAÇÃO PRINCIPAL
// ============================================================
interface RegistrarMovimentacaoParams {
  produtoId: string;
  tipo: TipoMovimentacao;
  quantidade: number;
  observacao?: string;
  sincronizarVelcro?: boolean;
  sincronizarCaixa?: boolean;
  sincronizarTabaco?: boolean;
}

export async function registrarMovimentacaoEstoque({
  produtoId,
  tipo,
  quantidade,
  observacao,
  sincronizarVelcro = true,
  sincronizarCaixa = true,
  sincronizarTabaco = true,
}: RegistrarMovimentacaoParams) {
  try {
    // 1. Dados do produto
    const { data: produto, error: erroProdBusca } = await supabase
      .from("produtos")
      .select("id, nome, estoque_atual")
      .eq("id", produtoId)
      .single();
    if (erroProdBusca) throw erroProdBusca;

    // 2. Registro da movimentação
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

    // 3. Novo saldo
    const estoqueAtual = Number(produto?.estoque_atual) || 0;
    let novoEstoque = estoqueAtual;
    if (tipo === "ENTRADA") {
      novoEstoque = estoqueAtual + quantidade;
    } else if (tipo === "SAIDA" || tipo === "VENDA") {
      novoEstoque = Math.max(0, estoqueAtual - quantidade);
    } else if (tipo === "AJUSTE") {
      novoEstoque = quantidade;
    }

    // 4. Atualiza o saldo do produto
    const { error: erroProdUpdate } = await supabase
      .from("produtos")
      .update({ estoque_atual: novoEstoque })
      .eq("id", produtoId);
    if (erroProdUpdate) throw erroProdUpdate;

    const nome = produto?.nome ?? "";

    // 5. Sincronização de velcro (pares ↔ pacotes)
    if (sincronizarVelcro && nome) {
      const nomeLower = nome.toLowerCase();
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
            return ePacote
              ? pNome.includes("par") || pNome.includes("pares")
              : pNome.includes("pacote") || pNome.includes("pacotes");
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

    // 6. Consumo de insumos na produção (somente em ENTRADA = produção)
    if (tipo === "ENTRADA" && nome) {
      await descontarInsumosDesmarola(nome, quantidade);
      await descontarInsumosBolados(nome, quantidade);
      if (sincronizarCaixa) await descontarCaixaDoDisplay(nome, quantidade);
      if (sincronizarTabaco) await descontarTabacoDoDisplay(nome, quantidade);
    }

    return { success: true, novoEstoque };
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    console.error("Erro ao registar movimentação de estoque:", errorObj?.message);
    throw err;
  }
}

// Aliases para compatibilidade com outras páginas
export const movimentarEstoque = registrarMovimentacaoEstoque;
export const registarMovimentacaoEstoque = registrarMovimentacaoEstoque;

// ==========================================
// CONVERSÃO E LANÇAMENTO DE VELCRO (MANUAL)
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
    const qtdConvertida =
      unidadeOrigem === "pares"
        ? qtdNum / PROPORCAO_VELCRO_PAR_PACOTE
        : qtdNum * PROPORCAO_VELCRO_PAR_PACOTE;

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