// lib/parser-inventario.ts
// Parser mesclado: API da Etapa 2 (testada) + comportamentos validados em produção
// (números BR, qualificadores emb/master/display, parênteses ignorados, % como unidade)

export interface ProdutoInput {
  id: string;
  nome: string;
  estoque_atual: number;
}

export interface ItemProcessado {
  nomeOriginal: string;
  nomeCatalogo: string;
  produto_id?: string;
  quantidade_contada: number;
  encontrado: boolean;
  diferenca: number;
}

// ── Dicionário de acentos (não consolidado cai no formato canônico) ──
const DICIONARIO_ACENTOS: Record<string, string> = {
  limao: 'Limão', capim: 'Capim', cravo: 'Cravo', lavanda: 'Lavanda',
  hortela: 'Hortelã', alecrim: 'Alecrim', canela: 'Canela', anis: 'Anis',
  erva: 'Erva', cidreira: 'Cidreira', melissa: 'Melissa', eucalipto: 'Eucalipto',
  chocolate: 'Chocolate', morango: 'Morango', baunilha: 'Baunilha',
};

const STOPWORDS = new Set([
  'de', 'da', 'do', 'dos', 'das', 'a', 'o', 'e', 'para', 'com',
  'ml', 'l', 'litro', 'litros', 'g', 'gramas', 'kg', 'mililitros',
  'un', 'unidade', 'unidades', 'pares', 'par', 'pacote', 'pacotes',
  'pct', 'cx', 'caixa', 'caixas',
]);

const SINONIMOS: Record<string, string> = {
  emb: 'embalagem', embalagens: 'embalagem',
  displays: 'display', masters: 'master',
};

const QUALIFICADORES = new Set(['embalagem', 'master', 'display']);

const CONECTIVOS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'com', 'para']);

const UNIDADES = new Set([
  'pct', 'un', 'cx', 'emb', 'ml', 'l', 'kg', 'g',
  'pacote', 'pacotes', 'caixa', 'caixas', 'embalagem', 'embalagens',
  'litro', 'litros', 'gramas', 'mililitros',
]);

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ') // remove (mL), (pares), (%)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limparUnidade(t: string): string {
  return t.toLowerCase().replace(/\./g, '');
}

function tokensDe(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => SINONIMOS[t] ?? t);
}

// ── Números em formato BR: 20.400 / 1,5 / 35% / 2 mil / 20.000 mil ──
export function parseNumero(bruto: string): number | null {
  const s = bruto.toLowerCase();
  const temMil = /\bmil\b/.test(s);
  const m = s.match(/-?\d[\d.,]*/);
  if (!m) return null;

  let num = m[0];
  const temVirgula = num.includes(',');
  const temPonto = num.includes('.');

  if (temVirgula && temPonto) {
    num = num.replace(/\./g, '').replace(',', '.');
  } else if (temVirgula) {
    num = /,\d{1,2}$/.test(num) ? num.replace(',', '.') : num.replace(/,/g, '');
  } else if (temPonto) {
    // "20.400" termina em .ddd = milhar; "20.4" = decimal
    if (/(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');
  }

  let valor = parseFloat(num);
  if (isNaN(valor)) return null;
  if (temMil && valor < 1000) valor *= 1000;
  return valor;
}

// ── API Etapa 2: normalização geral (acentos, caixa, espaços) ──
export function normalizarTextoGeral(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── API Etapa 2: restaurar acentos pelo dicionário ──
export function restaurarAcentos(texto: string): string {
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => {
      const chave = normalizar(t);
      return DICIONARIO_ACENTOS[chave] ?? t;
    })
    .join(' ');
}

// ── API Etapa 2: extrair quantidade do início do texto ──
export function extrairQuantidadeComExtenso(
  texto: string
): { quantidade: number; textoRestante: string } {
  const toks = texto.trim().split(/\s+/).filter(Boolean);
  if (toks.length === 0) return { quantidade: 0, textoRestante: '' };

  const primeira = limparUnidade(toks[0]);

  if (primeira === 'metade') {
    const rest = toks.slice(1);
    if (rest.length && UNIDADES.has(limparUnidade(rest[0]))) rest.shift();
    return { quantidade: 1, textoRestante: rest.join(' ') };
  }

  if (/^-?[\d.,]+$/.test(toks[0])) {
    let valor = parseNumero(toks[0]) ?? 0;
    let i = 1;
    if (toks[i] && limparUnidade(toks[i]) === 'mil' && valor < 1000) {
      valor *= 1000;
      i++;
    }
    if (toks[i] && UNIDADES.has(limparUnidade(toks[i]))) i++;
    return { quantidade: Math.round(valor), textoRestante: toks.slice(i).join(' ') };
  }

  return { quantidade: 0, textoRestante: texto.trim() };
}

// ── API Etapa 2: Title Case com conectivos minúsculos ──
export function formatarTitleCase(texto: string): string {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  return palavras
    .map((t, i) => {
      if (i > 0 && CONECTIVOS.has(t.toLowerCase())) return t.toLowerCase();
      return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    })
    .join(' ');
}

// ── API Etapa 2: nome oficial por apelidos ──
export function sugerirNomeOficial(nomeOriginal: string, _nomeNormalizado: string): string {
  const t = normalizar(nomeOriginal);

  if (t.includes('velcro')) return 'Velcro (pares)';
  if (t.includes('diluente') || /\bfrasco\b/.test(t)) return 'Diluente Frasco';

  if (/\bessencia\b/.test(t)) {
    const aroma = t.replace(/^.*?\bessencia\b\s*/, '').trim();
    return 'Essência Desmarola ' + (aroma ? restaurarAcentos(aroma) : 'Desconhecida');
  }

  return formatarTitleCase(nomeOriginal);
}

// ── Distância de Levenshtein (para tolerância a erro de digitação) ──
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[n];
}

function qualsAtendidos(pTok: string[], quals: string[]): boolean {
  return quals.every((q) => pTok.includes(q));
}

function encontrarProduto(nomeTexto: string, produtos: ProdutoInput[]): ProdutoInput | undefined {
  const tTok = tokensDe(nomeTexto);
  if (tTok.length === 0) return undefined;
  const quals = tTok.filter((t) => QUALIFICADORES.has(t));

  let melhor: ProdutoInput | undefined;
  let melhorScore = 0;

  // 1ª passada: sobreposição exata de tokens
  for (const p of produtos) {
    const pTok = tokensDe(p.nome);
    if (pTok.length === 0) continue;
    const inter = pTok.filter((t) => tTok.includes(t)).length;
    if (inter === 0) continue;
    if (!qualsAtendidos(pTok, quals)) continue;

    let score = inter;
    for (const q of quals) if (pTok.includes(q)) score += 1;

    if (score > melhorScore) {
      melhorScore = score;
      melhor = p;
    }
  }
  if (melhor) return melhor;

  // 2ª passada: tolerância a erro de digitação (1 token, distância ≤ 1)
  if (tTok.length === 1 && quals.length === 0 && tTok[0].length >= 3) {
    let melhorDist = 2;
    for (const p of produtos) {
      for (const pTok of tokensDe(p.nome)) {
        const d = levenshtein(tTok[0], pTok);
        if (d < melhorDist) {
          melhorDist = d;
          melhor = p;
        }
      }
    }
    if (melhorDist <= 1) return melhor;
  }

  return undefined;
}

export function parsearInventario(texto: string, produtos: ProdutoInput[]): ItemProcessado[] {
  const mapa = new Map<string, ItemProcessado>();

  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s+/, '');
    if (!l) continue;

    let nomeTexto = '';
    let quantidade = 0;

    if (l.includes(':')) {
      const idx = l.indexOf(':');
      nomeTexto = l.slice(0, idx).trim();
      quantidade = parseNumero(l.slice(idx + 1)) ?? 0;
      if (!nomeTexto || quantidade === 0) continue;
    } else {
      const toks = l.split(/\s+/);
      if (/^-?[\d.,]+$/.test(toks[0])) {
        // "20.400 emb. yerba" / "20.000 mil emb. yerbinha"
        let bruto = toks[0];
        let consumidos = 1;
        if (toks[1] && limparUnidade(toks[1]) === 'mil') {
          bruto += ' mil';
          consumidos = 2;
        }
        quantidade = parseNumero(bruto) ?? 0;
        nomeTexto = toks.slice(consumidos).join(' ').trim();
      } else if (/^-?[\d.,]+$/.test(toks[toks.length - 1])) {
        quantidade = parseNumero(toks[toks.length - 1]) ?? 0;
        nomeTexto = toks.slice(0, -1).join(' ').trim();
      }
      if (!nomeTexto || quantidade === 0) continue;
    }

    const produto = encontrarProduto(nomeTexto, produtos);
    const chave = produto ? produto.id : 'novo:' + normalizar(nomeTexto);

    const existente = mapa.get(chave);
    if (existente) {
      existente.quantidade_contada += quantidade;
      existente.diferenca = produto
        ? existente.quantidade_contada - produto.estoque_atual
        : existente.quantidade_contada;
    } else {
      mapa.set(chave, {
        nomeOriginal: linha.trim(),
        nomeCatalogo: produto ? produto.nome : sugerirNomeOficial(nomeTexto, ''),
        produto_id: produto?.id,
        quantidade_contada: quantidade,
        encontrado: !!produto,
        diferenca: produto ? quantidade - produto.estoque_atual : quantidade,
      });
    }
  }

  return Array.from(mapa.values());
} 