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
}

export interface DadosRelatorio {
  faltaProduzir: LinhaRelatorio[];
  producaoHoje: LinhaRelatorio[];
  estoqueAtual: LinhaRelatorio[];
  historicoSemana: DiaHistorico[];
}

// Ordem fixa dos grupos — produtos para venda primeiro
const ORDEM_CATEGORIAS = [
  "PRODUTO FINALIZADO",
  "INSUMO (MATÉRIA-PRIMA)",
  "EMBALAGEM",
  "ALMOXARIFADO (CONSUMO INTERNO)",
  "EPI",
  "SEM CLASSIFICAÇÃO",
];

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
  const candidatos = [
    "categoria",
    "tipo",
    "classificacao",
    "classificacao_produto",
    "categoria_produto",
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

function ordenarCategorias(chaves: string[]): string[] {
  return [...chaves].sort((a, b) => {
    const ia = ORDEM_CATEGORIAS.indexOf(a);
    const ib = ORDEM_CATEGORIAS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
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
    ((metas ?? []) as Record<string, unknown>[]).map((m) => String(m.produto_id))
  );

  const inicio = inicioDoDia();
  const produzidosHoje = new Map<string, number>();
  for (const mov of (movimentacoes ?? []) as Record<string, unknown>[]) {
    const data = extrairData(mov);
    if (!data || data < inicio) continue;

    const tipo = extrairTipo(mov);
    if (!tipo.includes("ENTRADA")) continue;

        // Produção = ENTRADA de produto que tem meta no painel.
    // (Display Yerba/Yerbinha estão com código EMBALAGEM gravado numa
    // das colunas do banco — o filtro por classificação os cortava.)
    const id = String(mov.produto_id);
    if (!idsComMeta.has(id)) continue;

    // Estorno de venda excluída devolve itens como ENTRADA — não é produção
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

    // Histórico: produção dos últimos 7 dias (mesmas regras do relatório)
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
  seteDiasAtras.setHours(0, 0, 0, 0);

  const totaisPorDia = new Map<string, number>();
  for (const mov of (movimentacoes ?? []) as Record<string, unknown>[]) {
    const data = extrairData(mov);
    if (!data || data < seteDiasAtras) continue;

    const tipo = extrairTipo(mov);
    if (!tipo.includes('ENTRADA')) continue;

    const id = String(mov.produto_id);
    if (!idsComMeta.has(id)) continue;

    const obs = String(mov.observacao ?? mov.observacoes ?? '').toLowerCase();
    if (obs.includes('estorno')) continue;

    const qtd = extrairQuantidade(mov);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    totaisPorDia.set(chave, (totaisPorDia.get(chave) ?? 0) + qtd);
  }

  const historicoSemana: DiaHistorico[] = [...totaisPorDia.entries()]
    .map(([chave, total]) => {
      const [ano, mes, dia] = chave.split('-').map(Number);
      const dataLegivel = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
      return { chave, data: dataLegivel, total };
    })
    .sort((a, b) => b.chave.localeCompare(a.chave));

  return { faltaProduzir, producaoHoje, estoqueAtual, historicoSemana };
}

function linhasPorCategoria(linhas: LinhaRelatorio[]): string {
  if (linhas.length === 0) return "";

  const grupos = new Map<string, LinhaRelatorio[]>();
  for (const linha of linhas) {
    const chave = linha.categoria;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(linha);
  }

  const blocos: string[] = [];
  for (const chave of ordenarCategorias([...grupos.keys()])) {
    const linhasGrupo = grupos
      .get(chave)!
      .sort((a, b) => a.nome.localeCompare(b.nome));
    blocos.push(
      `*${chave}*\n` + linhasGrupo.map((l) => linhaEstoqueTexto(l)).join("\n"),
    );
  }
  return blocos.join("\n\n");
}

// Marca em ⚠️ o que está abaixo do mínimo (igual ao "Mín" do /produtos)
function linhaEstoqueTexto(l: LinhaRelatorio): string {
  const base = `• ${l.nome}: ${l.quantidade.toLocaleString("pt-BR")} un.`;
  const min = l.minimo;
  if (min !== undefined && min !== null && min > 0 && l.quantidade < min) {
    return `${base} ⚠️ (Mín: ${min.toLocaleString("pt-BR")})`;
  }
  return base;
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
    "🎯 *Falta produzir*\n" +
      (dados.faltaProduzir.length === 0
        ? "• Nenhuma meta registrada"
        : dados.faltaProduzir
            .map(
              (l) => `• ${l.nome}: ${l.quantidade.toLocaleString("pt-BR")} un.`,
            )
            .join("\n")),
  );

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
    const totalSemana = dados.historicoSemana.reduce((s, d) => s + d.total, 0);
  partes.push(
    '📅 *Produção — últimos 7 dias*\n' +
      (dados.historicoSemana.length === 0
        ? '• Nenhuma produção na semana'
        : dados.historicoSemana
            .map((d) => `• ${d.data}: ${d.total.toLocaleString('pt-BR')} un.`)
            .join('\n')) +
      (totalSemana > 0
        ? `\n*Total da semana: ${totalSemana.toLocaleString('pt-BR')} un.*`
        : '')
  );

  const estoqueTexto = linhasPorCategoria(dados.estoqueAtual);
  partes.push(
    "📦 *Estoque atual*\n\n" +
      (estoqueTexto === "" ? "• Nenhum produto ativo" : estoqueTexto),
  );

  return partes.join("\n\n");
}
