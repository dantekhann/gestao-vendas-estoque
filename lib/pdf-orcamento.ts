// ============================================================
// PARSER DO PDF DE ORÇAMENTO (formato Dominus e variantes)
// ============================================================
// Carrega o worker do pdfjs na inicialização — exigência do pdfjs 6 + Turbopack
// @ts-expect-error — módulo do worker não tem declarações de tipo
import("pdfjs-dist/build/pdf.worker.mjs").then((worker) => {
  (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
});

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  sku?: string | null;
  estoque_atual: number | null;
}

export interface ItemBruto {
  nomePdf: string;
  quantidade: number;
  precoUnit: number;
  subtotal: number;
}

export interface DadosPdf {
  numeroOrcamento: string | null;
  clienteNome: string | null;
  dataTexto: string | null;
  desconto: number;
  tarifa: number;
  frete: number;
  obsAuto: string | null;
  itens: ItemBruto[];
}

// ============================================================
// HELPERS DE NÚMERO E TEXTO
// ============================================================

function parseNumeroBR(valor: string): number {
  const limpo = valor.replace(/[^\d.,-]/g, "");
  if (limpo.includes(",") && limpo.includes(".")) {
    return Number(limpo.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (limpo.includes(",")) {
    return Number(limpo.replace(",", ".")) || 0;
  }
  if (limpo.includes(".")) {
    const partes = limpo.split(".");
    const ultima = partes[partes.length - 1];
    if (partes.length > 2 || (ultima.length === 3 && limpo.length > 6)) {
      return Number(limpo.replace(/\./g, "")) || 0;
    }
    return Number(limpo) || 0;
  }
  return Number(limpo) || 0;
}

export function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ============================================================
// RECONHECIMENTO DE ITENS
// ============================================================

const LINHA_PROIBIDA =
  /desconto|sub\s?total|total|líquido|liquido|condição|condicao|vendedor|forma de pagamento/i;

// Dois valores em R$ no fim da linha (layout "NOME ... UNIT SUBTOTAL")
const VALORES_FINAIS =
  /(\s+(?:R\$)?\s*[\d.]+,\d{2}\s+(?:R\$)?\s*[\d.]+,\d{2}\s*)$/;

// Linha que contém dois valores monetários em qualquer posição
const TEM_DOIS_VALORES = /[\d.]+,\d{2}[^\d]*[\d.]+,\d{2}/;

// Continuação do nome quebrada no PDF: termina em variante entre parênteses
// Ex.: "Limão (Unidade)", "(Unidade)", "Utopia (Unidade)"
const CONTINUACAO_VARIANTE = /^[^\d()]*\([^)]*\)\s*$/;

function ehDinheiroComCentavos(txt: string): boolean {
  return /^(?:R\$)?\s*[\d.]+,\d{2}$/.test(txt.trim());
}

function limparNome(nomeLinha: string): string {
  return nomeLinha
    .replace(/^\s*\d{1,4}\s*[-–]\s*/, "") // remove código inicial "1002 - "
    .replace(/\s+/g, " ")
    .trim();
}

// Junta o nome de um item que o PDF quebrou em duas linhas.
// Se a linha de valores vier antes do nome, a continuação entra antes dos valores.
function montarLinhasDeItens(texto: string): string[] {
  const saida: string[] = [];

  for (const bruta of texto.split("\n")) {
    const linha = bruta.trim();
    if (!linha) continue;

    const anterior = saida[saida.length - 1];
    const ehContinuacao =
      anterior !== undefined &&
      TEM_DOIS_VALORES.test(anterior) &&
      !anterior.includes("(") &&
      !LINHA_PROIBIDA.test(anterior) &&
      CONTINUACAO_VARIANTE.test(linha);

    if (ehContinuacao) {
      const m = anterior.match(VALORES_FINAIS);
      saida[saida.length - 1] = m
        ? `${anterior.slice(0, m.index)} ${linha}${m[1]}`
        : `${anterior} ${linha}`;
    } else {
      saida.push(linha);
    }
  }

  return saida;
}

// Layouts por linha:
//  A) NOME ... QTD ... UNIT ... SUBTOTAL
//  B) QTD ... NOME ... UNIT ... SUBTOTAL
//  C) QTD UNIT SUBTOTAL NOME  (layout do WhatsApp / Dominus com código no nome)
function extrairItensModoLinha(linhas: string[]): ItemBruto[] {
  const itens: ItemBruto[] = [];

  const reNomeQtd =
    /^\s*(?:\d{1,4}\s*[-–]\s*)?(.+?)\s+(\d{1,6})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s*$/;
  const reQtdNome =
    /^\s*(\d{1,6})\s+(.+?)\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s*$/;
  const reQtdValValNome =
    /^\s*(\d{1,6})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(.+)$/;

  for (const linha of linhas) {
    if (LINHA_PROIBIDA.test(linha)) continue;

    let nomePdf: string | null = null;
    let quantidade = 0;
    let valorA = 0;
    let valorB = 0;

    const mA = linha.match(reNomeQtd);
    const mB = mA ? null : linha.match(reQtdNome);
    const mC = !mA && !mB ? linha.match(reQtdValValNome) : null;

    if (mA) {
      nomePdf = limparNome(mA[1]);
      quantidade = Number(mA[2]);
      valorA = parseNumeroBR(mA[3]);
      valorB = parseNumeroBR(mA[4]);
    } else if (mB) {
      nomePdf = limparNome(mB[2]);
      quantidade = Number(mB[1]);
      valorA = parseNumeroBR(mB[3]);
      valorB = parseNumeroBR(mB[4]);
    } else if (mC) {
      quantidade = Number(mC[1]);
      valorA = parseNumeroBR(mC[2]);
      valorB = parseNumeroBR(mC[3]);
      nomePdf = limparNome(mC[4]);
    }

    if (!nomePdf || nomePdf.length < 3 || quantidade <= 0) continue;

    // Descobre qual valor é unitário e qual é subtotal
    let precoUnit = valorA;
    let subtotal = valorB;
    const okNormal =
      Math.abs(quantidade * valorA - valorB) <=
      Math.max(1, quantidade * valorA * 0.01);
    const okTrocado =
      Math.abs(quantidade * valorB - valorA) <=
      Math.max(1, quantidade * valorB * 0.01);

    if (okTrocado && !okNormal) {
      precoUnit = valorB;
      subtotal = valorA;
    } else if (!okNormal && !okTrocado) {
      continue; // valores não batem com a quantidade — não é linha de item
    }

    if (precoUnit <= 0) continue;
    itens.push({ nomePdf, quantidade, precoUnit, subtotal });
  }

  return itens;
}

// Fallback: cada valor e quantidade em linhas separadas
function extrairItensModoSequencia(linhas: string[]): ItemBruto[] {
  const itens: ItemBruto[] = [];

  let nomePendente: string | null = null;
  let qtdPendente: number | null = null;
  let valor1: number | null = null;
  let valor2: number | null = null;

  const emitir = () => {
    if (nomePendente && qtdPendente && valor1 !== null && valor2 !== null) {
      const nomePdf = limparNome(nomePendente);
      if (nomePdf && nomePdf.length >= 3) {
        let precoUnit = valor1;
        let subtotal = valor2;
        if (
          Math.abs(qtdPendente * valor2 - valor1) <=
          Math.max(1, qtdPendente * valor2 * 0.01)
        ) {
          precoUnit = valor2;
          subtotal = valor1;
        }
        itens.push({ nomePdf, quantidade: qtdPendente, precoUnit, subtotal });
      }
    }
    nomePendente = null;
    qtdPendente = null;
    valor1 = null;
    valor2 = null;
  };

  for (const linha of linhas) {
    if (LINHA_PROIBIDA.test(linha)) continue;

    if (ehDinheiroComCentavos(linha)) {
      const v = parseNumeroBR(linha);
      if (valor1 === null) valor1 = v;
      else {
        valor2 = v;
        emitir();
      }
      continue;
    }

    if (/^\d{1,6}$/.test(linha)) {
      qtdPendente = Number(linha);
      continue;
    }

    if (valor1 !== null || valor2 !== null) {
      nomePendente = null;
      qtdPendente = null;
      valor1 = null;
      valor2 = null;
    }

    const candidato = limparNome(linha);
    if (candidato.length >= 3 && /[A-Za-zÀ-ÿ]/.test(candidato)) {
      nomePendente = linha;
    }
  }

  return itens;
}

// ============================================================
// MERCADO LIVRE — Central de Vendedores (detalhe da venda)
// Regra OrC: cliente fixo "Mercado Livre"; o nº da venda (#...) vai
// pra observação. O valor unitário real vem de "Preço dos produtos"
// (rateado entre os itens).
// ============================================================

function extrairDadosMercadoLivre(texto: string): DadosPdf {
  const linhas = texto.split("\n").map((l) => l.trim());

  // 1ª passada: linhas de item ("... R$ 23,36   1 unidade")
  const reLinhaUnidade = /^(.*?)(?:R\$)?\s*([\d.]+,\d{2})\s+(\d+)\s+unidad/i;
  const linhasItem: { nomePdf: string; quantidade: number; valorLinha: number }[] =
    [];

  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(reLinhaUnidade);
    if (!m) continue;

    let nomeLinha = "";
    for (let j = i - 1; j >= 0 && i - j <= 3; j--) {
      const candidata = linhas[j];
      if (!candidata) continue;
      if (
        /R\$|envio|pacote|entregue|despache|recebimento|reputação|venda #|cpf|nf-e|emissão|vendedores/i.test(
          candidata,
        )
      )
        break;
      if (candidata.length >= 5 && /[A-Za-zÀ-ÿ]/.test(candidata)) {
        nomeLinha = candidata;
        break;
      }
    }

    const nomePdf = limparNome(nomeLinha || m[1]);
    const valorLinha = parseNumeroBR(m[2]);
    const quantidadeLinha = Number(m[3]);
    if (!nomePdf || nomePdf.length < 3 || valorLinha <= 0 || quantidadeLinha <= 0)
      continue;

    linhasItem.push({ nomePdf, quantidade: quantidadeLinha, valorLinha });
  }

  // Agrega por produto: soma os valores repetidos, mantém a quantidade da 1ª linha
  const produtos: { nomePdf: string; quantidade: number; valorLinha: number }[] =
    [];
  for (const li of linhasItem) {
    const existente = produtos.find((p) => p.nomePdf === li.nomePdf);
    if (existente) {
      existente.valorLinha += li.valorLinha;
    } else {
      produtos.push({
        nomePdf: li.nomePdf,
        quantidade: li.quantidade,
        valorLinha: li.valorLinha,
      });
    }
  }

  let precoProdutos = 0;
  const mPreco = texto.match(/pre[çc]o dos produtos\s+(?:R\$)?\s*([\d.,]+)/i);
  if (mPreco) precoProdutos = parseNumeroBR(mPreco[1]);

  let tarifa = 0;
  const mTarifa = texto.match(/tarifa de venda[^\d\n-]*-?\s*(?:R\$)?\s*([\d.,]+)/i);
  if (mTarifa) tarifa = parseNumeroBR(mTarifa[1]);

  let frete = 0;
  const mEnvios = texto.match(/envios\s+-?\s*(?:R\$)?\s*([\d.,]+)/i);
  if (mEnvios) frete = parseNumeroBR(mEnvios[1]);

  const somaValores = produtos.reduce((s, p) => s + p.valorLinha, 0);
  const itens: ItemBruto[] = produtos.map((p) => {
    const subtotalBruto =
      precoProdutos > 0 && somaValores > 0
        ? (precoProdutos * p.valorLinha) / somaValores
        : p.valorLinha;
    const quantidade = Math.max(1, Math.round(p.quantidade));
    const precoUnit = Number((subtotalBruto / quantidade).toFixed(2));
    const subtotal = Number((quantidade * precoUnit).toFixed(2));
    return { nomePdf: p.nomePdf, quantidade, precoUnit, subtotal };
  });

  let obsAuto: string | null = null;
  const mVenda = texto.match(/venda\s*#(\d{6,})/i);
  if (mVenda) obsAuto = `#${mVenda[1]}`;

  return {
    numeroOrcamento: null,
    clienteNome: "Mercado Livre",
    dataTexto: null,
    desconto: 0,
    tarifa,
    frete,
    obsAuto,
    itens,
  };
}

// ============================================================
// EXTRAÇÃO PRINCIPAL
// ============================================================

export function extrairDadosDoPdf(texto: string): DadosPdf {
  if (
    /venda\s*#\d{8,}/i.test(texto) &&
    /central de vendedores|ebazar/i.test(texto)
  ) {
    return extrairDadosMercadoLivre(texto);
  }

  // Itens: junta nomes quebrados e lê linha a linha
  const linhas = montarLinhasDeItens(texto);
  let itens = extrairItensModoLinha(linhas);
  if (itens.length === 0) {
    itens = extrairItensModoSequencia(linhas);
  }

  let numeroOrcamento: string | null = null;
  const mNumero = texto.match(/or[cç]amento\s*(\d{2,6})/i);
  if (mNumero) numeroOrcamento = mNumero[1];

  let clienteNome: string | null = null;
  const mCliente = texto.match(/cliente[:\s]+([^\n]+)/i);
  if (mCliente) {
    clienteNome =
      mCliente[1]
        .replace(/cnpj.*$/i, "")
        .replace(/contato.*$/i, "")
        .replace(/[-–].*$/, "")
        .trim()
        .slice(0, 80) || null;
  }
  if (!clienteNome) {
    const mOrc = texto.match(/or[cç]amento\s*\d{2,6}[^\n]*\n+([^\n]+)/i);
    if (mOrc) clienteNome = mOrc[1].trim().slice(0, 80) || null;
  }

  let dataTexto: string | null = null;
  const mData = texto.match(/(\d{2}\/\d{2}\/\d{2,4})/);
  if (mData) dataTexto = mData[1];

  let desconto = 0;
  const mDesconto = texto.match(/desconto[^\d\n]*([\d.,]+)/i);
  if (mDesconto) desconto = parseNumeroBR(mDesconto[1]);

  // Desconto implícito: soma dos itens - valor líquido
  if (desconto === 0 && itens.length > 0) {
    const mLiquido = texto.match(/valor\s+l[ií]quido[^\d\n]*([\d.,]+)/i);
    if (mLiquido) {
      const liquido = parseNumeroBR(mLiquido[1]);
      const bruto = itens.reduce((s, it) => s + it.quantidade * it.precoUnit, 0);
      const implicito = Number((bruto - liquido).toFixed(2));
      if (liquido > 0 && implicito > 0.99 && implicito < bruto) {
        desconto = implicito;
      }
    }
  }

  return {
    numeroOrcamento,
    clienteNome,
    dataTexto,
    desconto,
    tarifa: 0,
    frete: 0,
    obsAuto: null,
    itens,
  };
}

// ============================================================
// LEITURA DO PDF (pdfjs-dist)
// ============================================================

export async function extrairTextoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const dados = await arquivo.arrayBuffer();

  const globalWorker = globalThis as unknown as { pdfjsWorker?: unknown };
  if (!globalWorker.pdfjsWorker) {
    // @ts-expect-error — o módulo do worker não tem declarações de tipo
    globalWorker.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
  }

  const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    for (const item of conteudo.items) {
      const it = item as { str?: string; hasEOL?: boolean };
      texto += (it.str || "") + (it.hasEOL ? "\n" : " ");
    }
    texto += "\n";
  }
  return texto;
}

// ============================================================
// CASAMENTO COM O CATÁLOGO DE PRODUTOS
// ============================================================

// Nomes do PDF (normalizados) → nome atual no cadastro
const APELIDOS_PRODUTO: Record<string, string> = {
  "yerba bolado (display)": "Display de Bolados",
  "yerba tabaco 30g (caixa)": "Display Yerba",
  "yerbinha tabaco 15g (caixa)": "Display Yerbinha",
};

const PALAVRAS_IGNORADAS = new Set(["de", "da", "do", "dos", "das", "e", "com"]);

// Sem parênteses, a variante é "unidade" (padrão do catálogo)
const VARIANTE_PADRAO = "unidade";

function chaveNome(nome: string): string {
  return normalizar(nome).replace(/\s+/g, " ").trim();
}

function tokensNome(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t && !PALAVRAS_IGNORADAS.has(t));
}

function separarVariante(nome: string): { base: string; variante: string } {
  const norm = normalizar(nome);
  const m = norm.match(/\(([^)]*)\)/);
  const variante = m ? m[1].trim() : VARIANTE_PADRAO;
  const base = norm.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return { base, variante };
}

export function encontrarMelhorProduto(
  nomePdf: string,
  produtos: ProdutoCatalogo[],
): ProdutoCatalogo | null {
  // 1) Apelido conhecido: resolve direto pelo nome atual do cadastro
  const nomeAtual = APELIDOS_PRODUTO[chaveNome(nomePdf)];
  if (nomeAtual) {
    const alvo = chaveNome(nomeAtual);
    return produtos.find((p) => chaveNome(p.nome) === alvo) ?? null;
  }

  // 2) Busca rígida: mesma variante e mesmos termos nos dois sentidos
  const pdf = separarVariante(nomePdf);
  const tokensPdf = tokensNome(pdf.base);
  if (tokensPdf.length === 0) return null;

  for (const p of produtos) {
    const cand = separarVariante(p.nome);
    if (pdf.variante !== cand.variante) continue;

    const tokensCand = tokensNome(cand.base);
    const faltando = tokensPdf.some((t) => !tokensCand.includes(t));
    const sobrando = tokensCand.some((t) => !tokensPdf.includes(t));
    if (faltando || sobrando) continue;

    return p;
  }
  return null;
}