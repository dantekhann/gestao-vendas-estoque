import { supabase } from '@/lib/supabase';

export interface LinhaRelatorio {
  nome: string;
  quantidade: number;
  categoria: string;
  minimo?: number | null;
}

export interface DadosRelatorio {
  faltaProduzir: LinhaRelatorio[];
  producaoHoje: LinhaRelatorio[];
  estoqueAtual: LinhaRelatorio[];
}

// Ordem fixa dos grupos — produtos para venda primeiro
const ORDEM_CATEGORIAS = [
  'PRODUTO FINALIZADO',
  'INSUMO (MATÉRIA-PRIMA)',
  'EMBALAGEM',
  'ALMOXARIFADO (CONSUMO INTERNO)',
  'EPI',
  'SEM CLASSIFICAÇÃO',
];

function inicioDoDia(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
}

function extrairData(linha: Record<string, unknown>): Date | null {
  const candidatos = ['criado_em', 'created_at', 'data', 'data_movimentacao'];
  for (const campo of candidatos) {
    const valor = linha[campo];
    if (valor) {
      const d = new Date(String(valor));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function extrairEstoque(produto: Record<string, unknown>): number {
  const candidatos = ['quantidade_estoque', 'estoque_atual', 'quantidade', 'saldo'];
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
  const candidatos = ['estoque_minimo', 'quantidade_minima', 'minimo'];
  for (const campo of candidatos) {
    const valor = produto[campo];
    if (valor !== undefined && valor !== null) {
      const n = Number(valor);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

// Converte o valor salvo no banco (ex.: "Insumo (Matéria-Prima)")
// no nome padronizado do grupo, qualquer que seja a grafia
function normalizarClassificacao(valor: string): string {
  const v = valor.trim().toLowerCase();
  if (v.includes('finalizado')) return 'PRODUTO FINALIZADO';
  if (v.includes('insumo')) return 'INSUMO (MATÉRIA-PRIMA)';
  if (v.includes('embalagem')) return 'EMBALAGEM';
  if (v.includes('almoxarifado')) return 'ALMOXARIFADO (CONSUMO INTERNO)';
  if (v.includes('epi')) return 'EPI';
  return valor.trim().toUpperCase();
}

function extrairCategoria(produto: Record<string, unknown>): string {
  // A coluna real do seu banco é a "Classificação" do /produtos
  const candidatos = [
    'classificacao',
    'classificacao_produto',
    'categoria',
    'tipo',
    'categoria_produto',
  ];
  for (const campo of candidatos) {
    const valor = produto[campo];
    if (typeof valor === 'string' && valor.trim() !== '') {
      return normalizarClassificacao(valor);
    }
  }
  return 'SEM CLASSIFICAÇÃO';
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
    .from('produtos')
    .select('*');
  if (erroProdutos) throw erroProdutos;

  const { data: movimentacoes, error: erroMovs } = await supabase
    .from('movimentacoes')
    .select('*');
  if (erroMovs) throw erroMovs;

  const { data: metas, error: erroMetas } = await supabase
    .from('metas_producao')
    .select('produto_id, quantidade_alvo');
  if (erroMetas) throw erroMetas;

  const listaProdutos = (produtos ?? []) as Record<string, unknown>[];
  const nomePorId = new Map<string, string>();
  for (const p of listaProdutos) {
    nomePorId.set(String(p.id), String(p.nome ?? 'Produto'));
  }

  const ativos = listaProdutos.filter((p) => p.ativo !== false);

  const faltaProduzir: LinhaRelatorio[] = ((metas ?? []) as Record<string, unknown>[])
    .map((m) => {
      const id = String(m.produto_id);
      const produto = listaProdutos.find((p) => String(p.id) === id);
      return {
        nome: nomePorId.get(id) ?? 'Produto',
        quantidade: Number(m.quantidade_alvo) || 0,
        categoria: produto ? extrairCategoria(produto) : 'SEM CLASSIFICAÇÃO',
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const inicio = inicioDoDia();
  const produzidosHoje = new Map<string, number>();
  for (const mov of (movimentacoes ?? []) as Record<string, unknown>[]) {
    const data = extrairData(mov);
    if (!data || data < inicio) continue;
    const tipo = String(mov.tipo ?? '').toUpperCase();
    if (!tipo.includes('ENTRADA')) continue;
    const id = String(mov.produto_id);
    const qtd = Number(mov.quantidade) || 0;
    produzidosHoje.set(id, (produzidosHoje.get(id) ?? 0) + qtd);
  }

  const producaoHoje: LinhaRelatorio[] = [...produzidosHoje.entries()]
    .map(([id, quantidade]) => ({
      nome: nomePorId.get(id) ?? 'Produto',
      quantidade,
      categoria: 'PRODUÇÃO',
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const estoqueAtual: LinhaRelatorio[] = ativos
    .map((p) => ({
      nome: String(p.nome ?? 'Produto'),
      quantidade: extrairEstoque(p),
      categoria: extrairCategoria(p),
      minimo: extrairMinimo(p),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { faltaProduzir, producaoHoje, estoqueAtual };
}

function linhasPorCategoria(linhas: LinhaRelatorio[]): string {
  if (linhas.length === 0) return '';

  const grupos = new Map<string, LinhaRelatorio[]>();
  for (const linha of linhas) {
    const chave = linha.categoria;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(linha);
  }

  const blocos: string[] = [];
  for (const chave of ordenarCategorias([...grupos.keys()])) {
    const linhasGrupo = grupos.get(chave)!
      .sort((a, b) => a.nome.localeCompare(b.nome));
    blocos.push(
      `*${chave}*\n` +
      linhasGrupo
        .map((l) => `• ${l.nome}: ${l.quantidade.toLocaleString('pt-BR')} un.`)
        .join('\n')
    );
  }
  return blocos.join('\n\n');
}

// Marca em ⚠️ o que está abaixo do mínimo (igual ao "Mín" do /produtos)
function linhaEstoqueTexto(l: LinhaRelatorio): string {
  const base = `• ${l.nome}: ${l.quantidade.toLocaleString('pt-BR')} un.`;
  const min = l.minimo;
  if (min !== undefined && min !== null && min > 0 && l.quantidade < min) {
    return `${base} ⚠️ (Mín: ${min.toLocaleString('pt-BR')})`;
  }
  return base;
}

export function montarMensagemRelatorio(dados: DadosRelatorio): string {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const partes: string[] = [];
  partes.push(`📊 *Relatório OrC Brasil — ${hoje}*`);

  partes.push(
    '🎯 *Falta produzir*\n' +
    (dados.faltaProduzir.length === 0
      ? '• Nenhuma meta registrada'
      : dados.faltaProduzir
          .map((l) => `• ${l.nome}: ${l.quantidade.toLocaleString('pt-BR')} un.`)
          .join('\n'))
  );

  partes.push(
    '🏭 *Produção de hoje*\n' +
    (dados.producaoHoje.length === 0
      ? '• Nenhuma produção registrada hoje'
      : dados.producaoHoje
          .map((l) => `• ${l.nome}: ${l.quantidade.toLocaleString('pt-BR')} un.`)
          .join('\n'))
  );

  const estoqueTexto = linhasPorCategoria(dados.estoqueAtual);
  partes.push(
    '📦 *Estoque atual*\n\n' +
    (estoqueTexto === '' ? '• Nenhum produto ativo' : estoqueTexto)
  );

  return partes.join('\n\n');
}