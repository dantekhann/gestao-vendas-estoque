import { supabase } from "@/lib/supabase";

export interface LinhaRelatorio {
  nome: string;
  quantidade: number;
  categoria: string;
  minimo?: number | null;
}

export interface DiaHistorico {
  chave: string;
  data: string;
  total: number;
  itens: { nome: string; quantidade: number }[];
}

export interface DadosRelatorio {
  faltaProduzir: LinhaRelatorio[];
  producaoHoje: LinhaRelatorio[];
  estoqueAtual: LinhaRelatorio[];
  historicoSemana: DiaHistorico[];
}

// ============================================================
// ORDEM FIXA DOS GRUPOS — produtos para venda primeiro.
// chave = prefixo (minúsculo) da classificação gravada no cadastro.
// Qualquer classificação fora da lista cai no bloco ⚠️ OUTROS.
// ============================================================
const ORDEM_CATEGORIAS: { chave: string; rotulo: string }[] = [
  { chave: "produto finalizado", rotulo: "PRODUTO FINALIZADO" },
  { chave: "insumo", rotulo: "INSUMO (MATÉRIA-PRIMA)" },
  { chave: "embalagem", rotulo: "EMBALAGEM" },
  { chave: "almoxarifado", rotulo: "ALMOXARIFADO (CONSUMO INTERNO)" },
  { chave: "epi", rotulo: "EPI" },
];

// Segunda-feira da semana corrente, 00:00 — usada na coleta E no cabeçalho,
// para os dois nunca divergirem
function segundaFeiraCorrente(): Date {
  const agoraRef = new Date();
  const segunda = new Date(
    agoraRef.getFullYear(),
    agoraRef.getMonth(),
    agoraRef.getDate(),
  );
  const diaSemana = segunda.getDay(); // 0=dom, 1=seg, ..., 6=sáb
  segunda.setDate(segunda.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
  segunda.setHours(0, 0, 0, 0);
  return segunda;
}

function inicioDoDia(): Date {
  const agora = new Date();
  return new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
    0,
    0,
    0,
  );
}

function extrairData(linha: Record<string, unknown>): Date | null {
  const candidatos = [
    "created_at",
    "criado_em",
    "data",
    "data_movimentacao",
    "data_hora",
    "registrado_em",
    "timestamp",
  ];
  for (const campo of candidatos) {
    const valor = linha[campo];
    if (valor) {
      const d = new Date(String(valor));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function extrairTipo(linha: Record<string, unknown>): string {
  const candidatos = ["tipo", "tipo_movimentacao", "movimento"];
  for (const campo of candidatos) {
    const valor = linha[campo];
    if (typeof valor === "string" && valor.trim() !== "") {
      return valor.trim().toUpperCase();
    }
  }
  return "";
}

function extrairQuantidade(linha: Record<string, unknown>): number {
  const candidatos = ["quantidade", "qtd", "quantidade_movimentada", "qtde"];
  for (const campo of candidatos) {
    const valor = linha[campo];
    if (valor !== undefined && valor !== null) {
      const n = Number(valor);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function extrairEstoque(produto: Record<string, unknown>): number {
  const candidatos = [
    "estoque_atual",
    "quantidade_estoque",
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

// Detecta UUID (relacionamento) — não é classificação legível
function pareceUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    valor.trim(),
  );
}

// Traduz TODAS as variantes — nomes bonitos da tela E códigos brutos do banco
function normalizarClassificacao(valor: string): string {
  const v = valor.trim().toLowerCase();
  if (v.includes("finalizado") || v.includes("acabado"))
    return "PRODUTO FINALIZADO";
  if (
    v.includes("insumo") ||
    v.includes("materia_prima") ||
    v.includes("matéria-prima")
  ) {
    return "INSUMO (MATÉRIA-PRIMA)";
  }
  if (v.includes("embalagem")) return "EMBALAGEM";
  if (v.includes("almoxarifado") || v.includes("consumo_interno")) {
    return "ALMOXARIFADO (CONSUMO INTERNO)";
  }
  if (v.includes("epi")) return "EPI";
  return valor.trim().toUpperCase();
}

function extrairCategoria(produto: Record<string, unknown>): string {
  // "classificacao" é a coluna real do banco (confirmada pela query SQL)
  const candidatos = [
    "classificacao",
    "classificacao_produto",
    "categoria",
    "categoria_produto",
    "tipo",
  ];
  for (const campo of candidatos) {
    const valor = produto[campo];
    if (
      typeof valor === "string" &&
      valor.trim() !== "" &&
      !pareceUuid(valor)
    ) {
      return normalizarClassificacao(valor);
    }
  }
  return "SEM CLASSIFICAÇÃO";
}

export async function buscarDadosRelatorio(): Promise<DadosRelatorio> {
  const { data: produtos, error: erroProdutos } = await supabase
    .from("produtos")
    .select("*");
  if (erroProdutos) throw erroProdutos;
  // Tabela correta do banco: movimentacoes_estoque (igual ao lib/estoque.ts)
  const { data: movimentacoes, error: erroMovs } = await supabase
    .from("movimentacoes_estoque")
    .select("*");
  if (erroMovs) throw erroMovs;
  const { data: metas, error: erroMetas } = await supabase
    .from("metas_producao")
    .select("produto_id, quantidade_alvo");
  if (erroMetas) throw erroMetas;

  const listaProdutos = (produtos ?? []) as Record<string, unknown>[];
  const nomePorId = new Map<string, string>();
  const categoriaPorId = new Map<string, string>();
  for (const p of listaProdutos) {
    const id = String(p.id);
    nomePorId.set(id, String(p.nome ?? "Produto"));
    categoriaPorId.set(id, extrairCategoria(p));
  }
  const ativos = listaProdutos.filter((p) => p.ativo !== false);

  const faltaProduzir: LinhaRelatorio[] = (
    (metas ?? []) as Record<string, unknown>[]
  )
    .map((m) => {
      const id = String(m.produto_id);
      return {
        nome: nomePorId.get(id) ?? "Produto",
        quantidade: Number(m.quantidade_alvo) || 0,
        categoria: categoriaPorId.get(id) ?? "SEM CLASSIFICAÇÃO",
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Produtos que têm meta no painel "Precisa Produzir"
  const idsComMeta = new Set(
    ((metas ?? []) as Record<string, unknown>[]).map((m) =>
      String(m.produto_id),
    ),
  );

  const inicio = inicioDoDia();
  const produzidosHoje = new Map<string, number>();
  for (const mov of (movimentacoes ?? []) as Record<string, unknown>[]) {
    const data = extrairData(mov);
    if (!data || data < inicio) continue;
    const tipo = extrairTipo(mov);
    if (!tipo.includes("ENTRADA")) continue;
    // Produção = ENTRADA de produto que tem meta no painel.
    // Estorno de venda excluída devolve itens como ENTRADA — não é produção
    const id = String(mov.produto_id);
    if (!idsComMeta.has(id)) continue;
    const obs = String(mov.observacao ?? mov.observacoes ?? "").toLowerCase();
    if (obs.includes("estorno")) continue;
    const qtd = extrairQuantidade(mov);
    produzidosHoje.set(id, (produzidosHoje.get(id) ?? 0) + qtd);
  }
  const producaoHoje: LinhaRelatorio[] = [...produzidosHoje.entries()]
    .map(([id, quantidade]) => ({
      nome: nomePorId.get(id) ?? "Produto",
      quantidade,
      categoria: "PRODUÇÃO",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const estoqueAtual: LinhaRelatorio[] = ativos
    .map((p) => ({
      nome: String(p.nome ?? "Produto"),
      quantidade: extrairEstoque(p),
      categoria: extrairCategoria(p),
      minimo: extrairMinimo(p),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  // Histórico: produção da semana comercial corrente (segunda a sexta)
  const segunda = segundaFeiraCorrente();
  const sabado = new Date(segunda);
  sabado.setDate(sabado.getDate() + 5); // 00:00 de sábado = limite da sexta
  const producaoPorDia = new Map<string, Map<string, number>>();
  for (const mov of (movimentacoes ?? []) as Record<string, unknown>[]) {
    const data = extrairData(mov);
    if (!data || data < segunda || data >= sabado) continue;
    const tipo = extrairTipo(mov);
    if (!tipo.includes("ENTRADA")) continue;
    const id = String(mov.produto_id);
    if (!idsComMeta.has(id)) continue;
    const obs = String(mov.observacao ?? mov.observacoes ?? "").toLowerCase();
    if (obs.includes("estorno")) continue;
    const qtd = extrairQuantidade(mov);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    if (!producaoPorDia.has(chave)) producaoPorDia.set(chave, new Map());
    const porProduto = producaoPorDia.get(chave)!;
    porProduto.set(id, (porProduto.get(id) ?? 0) + qtd);
  }
  const historicoSemana: DiaHistorico[] = [...producaoPorDia.entries()]
    .map(([chave, porProduto]) => {
      const [ano, mes, dia] = chave.split("-").map(Number);
      const dataLegivel = new Date(ano, mes - 1, dia).toLocaleDateString(
        "pt-BR",
        {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        },
      );
      const itens = [...porProduto.entries()]
        .map(([id, quantidade]) => ({
          nome: nomePorId.get(id) ?? "Produto",
          quantidade,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      const total = itens.reduce((s, i) => s + i.quantidade, 0);
      return { chave, data: dataLegivel, total, itens };
    })
    .sort((a, b) => b.chave.localeCompare(a.chave));

  return { faltaProduzir, producaoHoje, estoqueAtual, historicoSemana };
}

// ============================================================
// MONTAGEM DA MENSAGEM
// ============================================================
function linhaEstoqueTexto(l: LinhaRelatorio): string {
  return `• ${l.nome}: ${l.quantidade.toLocaleString("pt-BR")} un.`;
}

function linhasPorCategoria(itens: LinhaRelatorio[]): string {
  if (!itens || itens.length === 0) return "";

  const grupos = new Map<string, LinhaRelatorio[]>();
  const outros: LinhaRelatorio[] = [];

  for (const item of itens) {
    const classNorm = (item.categoria ?? "").trim().toLowerCase();
    const categoria = ORDEM_CATEGORIAS.find((c) =>
      classNorm.startsWith(c.chave),
    );
    if (categoria) {
      if (!grupos.has(categoria.rotulo)) grupos.set(categoria.rotulo, []);
      grupos.get(categoria.rotulo)!.push(item);
    } else {
      outros.push(item);
    }
  }

  const blocos: string[] = [];
  for (const categoria of ORDEM_CATEGORIAS) {
    const itensDoGrupo = (grupos.get(categoria.rotulo) ?? []).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    if (itensDoGrupo.length === 0) continue;
    blocos.push(
      `*${categoria.rotulo}*\n` +
        itensDoGrupo.map(linhaEstoqueTexto).join("\n"),
    );
  }

  if (outros.length > 0) {
    blocos.push(
      `*⚠️ OUTROS (classificação a revisar no cadastro)*\n` +
        outros
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
          .map(linhaEstoqueTexto)
          .join("\n"),
    );
  }

  return blocos.join("\n\n");
}

export function montarMensagemRelatorio(dados: DadosRelatorio): string {
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const partes: string[] = [];
  partes.push(`📊 *Relatório OrC Brasil — ${hoje}*`);

  partes.push(
    "🏭 *Produção de hoje*\n" +
      (dados.producaoHoje.length === 0
        ? "• Nenhuma produção registrada hoje"
        : dados.producaoHoje
            .map(
              (l) => `• ${l.nome}: ${l.quantidade.toLocaleString("pt-BR")} un.`,
            )
            .join("\n")),
  );

  // Produção da semana comercial: dias detalhados + total discriminado
  const totaisPorProduto = new Map<string, number>();
  for (const d of dados.historicoSemana) {
    for (const i of d.itens) {
      totaisPorProduto.set(
        i.nome,
        (totaisPorProduto.get(i.nome) ?? 0) + i.quantidade,
      );
    }
  }
  const semanaTexto =
    dados.historicoSemana.length === 0
      ? ""
      : dados.historicoSemana
          .map(
            (d) =>
              `*${d.data}*\n` +
              d.itens
                .map(
                  (i) =>
                    `• ${i.nome}: ${i.quantidade.toLocaleString("pt-BR")} un.`,
                )
                .join("\n"),
          )
          .join("\n\n");
  const totalTexto =
    totaisPorProduto.size === 0
      ? "• Nenhuma produção na semana"
      : "*Total da semana*\n" +
        [...totaisPorProduto.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
          .map(([nome, qtd]) => `• ${nome}: ${qtd.toLocaleString("pt-BR")} un.`)
          .join("\n");
  const segundaRef = segundaFeiraCorrente();
  const sextaRef = new Date(segundaRef);
  sextaRef.setDate(sextaRef.getDate() + 4);
  const fmtDia = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const intervaloTexto = `${fmtDia(segundaRef)} a ${fmtDia(sextaRef)}`;
  const corpoProducao =
    dados.historicoSemana.length === 0
      ? totalTexto
      : semanaTexto + "\n\n" + totalTexto;
  partes.push(`📅 *Produção — ${intervaloTexto}*\n\n${corpoProducao}`);

  const estoqueTexto = linhasPorCategoria(dados.estoqueAtual);
  partes.push(
    "📦 *Estoque atual*\n\n" +
      (estoqueTexto === "" ? "• Nenhum produto ativo" : estoqueTexto),
  );

  return partes.join("\n\n");
}
