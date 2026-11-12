// ============================================================
// PARSER DO PDF DE ORÇAMENTO (formato Dominus e variantes)
// Extraído de app/vendas/lancar/page.tsx — lógica idêntica,
// agora reutilizável e testável isoladamente.
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

function ehDinheiroComCentavos(txt: string): boolean {
  return /^(?:R\$)?\s*[\d.]+,\d{2}$/.test(txt.trim());
}

function limparNome(nomeLinha: string): string {
  return nomeLinha
    .replace(/^\s*\d{1,4}\s*[-–]\s*/, "") // remove código inicial "1002 - "
    .replace(/\s+/g, " ")
    .trim();
}

function extrairItensModoLinha(texto: string): ItemBruto[] {
  const itens: ItemBruto[] = [];
  // Ordem A: NOME ... QTD ... VALOR ... VALOR
  const reNomeQtd =
    /^\s*(?:\d{1,4}\s*[-–]\s*)?(.+?)\s+(\d{1,6})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s*$/;
  // Ordem B: QTD ... NOME ... VALOR ... VALOR
  const reQtdNome =
    /^\s*(\d{1,6})\s+(.+?)\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s*$/;
  // Ordem C: QTD VALOR VALOR NOME — nome por último (layout "Orçamento" do WhatsApp)
  const reQtdValValNome =
    /^\s*(\d{1,6})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(?:R\$)?\s*([\d.]+,\d{2})\s+(.+)$/;
  for (const linhaBruta of texto.split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha || LINHA_PROIBIDA.test(linha)) continue;
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
    // Descobre qual valor é unitário e qual é subtotal (mesmo com colunas trocadas)
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

function extrairItensModoSequencia(texto: string): ItemBruto[] {
  const itens: ItemBruto[] = [];
  const linhas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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
// (rateado entre os itens) — os valores por pacote são líquidos e não
// são usados como preço. Quantidade = a do pedido (1ª linha de cada
// produto; o ML repete o produto em vários pacotes).
// Resumo: "Preço dos produtos R$ 46,72", "Tarifa de venda total -R$ 7,70",
// "Envios -R$ 15,66".
// ============================================================
function extrairDadosMercadoLivre(texto: string): DadosPdf {
  const linhas = texto.split("\n").map((l) => l.trim());

  // 1ª passada: linhas de item ("... R$ 23,36   1 unidade")
  const reLinhaUnidade = /^(.*?)(?:R\$)?\s*([\d.]+,\d{2})\s+(\d+)\s+unidad/i;
  const linhasItem: { nomePdf: string; quantidade: number; valorLinha: number }[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(reLinhaUnidade);
    if (!m) continue;
    // Nome do produto: a 1ª linha útil acima da linha de valores
    let nomeLinha = "";
    for (let j = i - 1; j >= 0 && i - j <= 3; j--) {
      const candidata = linhas[j];
      if (!candidata) continue;
      if (/R\$|envio|pacote|entregue|despache|recebimento|reputação|venda #|cpf|nf-e|emissão|vendedores/i.test(candidata)) break;
      if (candidata.length >= 5 && /[A-Za-zÀ-ÿ]/.test(candidata)) {
        nomeLinha = candidata;
        break;
      }
    }
    const nomePdf = limparNome(nomeLinha || m[1]);
    const valorLinha = parseNumeroBR(m[2]);
    const quantidadeLinha = Number(m[3]);
    if (!nomePdf || nomePdf.length < 3 || valorLinha <= 0 || quantidadeLinha <= 0) continue;
    linhasItem.push({ nomePdf, quantidade: quantidadeLinha, valorLinha });
  }

  // Agrega por produto: soma os valores repetidos por pacote,
  // mas mantém a quantidade da 1ª linha (a do pedido)
  const produtos: { nomePdf: string; quantidade: number; valorLinha: number }[] = [];
  for (const li of linhasItem) {
    const existente = produtos.find((p) => p.nomePdf === li.nomePdf);
    if (existente) {
      existente.valorLinha += li.valorLinha;
    } else {
      produtos.push({ nomePdf: li.nomePdf, quantidade: li.quantidade, valorLinha: li.valorLinha });
    }
  }

  // Resumo financeiro do ML
  let precoProdutos = 0;
  const mPreco = texto.match(/pre[çc]o dos produtos\s+(?:R\$)?\s*([\d.,]+)/i);
  if (mPreco) precoProdutos = parseNumeroBR(mPreco[1]);
  let tarifa = 0;
  const mTarifa = texto.match(/tarifa de venda[^\d\n-]*-?\s*(?:R\$)?\s*([\d.,]+)/i);
  if (mTarifa) tarifa = parseNumeroBR(mTarifa[1]);
  let frete = 0;
  const mEnvios = texto.match(/envios\s+-?\s*(?:R\$)?\s*([\d.,]+)/i);
  if (mEnvios) frete = parseNumeroBR(mEnvios[1]);

  // Itens finais: subtotal real = "Preço dos produtos" rateado proporcionalmente
  // pelos valores das linhas; quantidade = a do pedido (1ª linha de cada produto)
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

  // Nº da venda ("Venda #2000015846945191") → observação
  let obsAuto: string | null = null;
  const mVenda = texto.match(/venda\s*#(\d{6,})/i);
  if (mVenda) obsAuto = `#${mVenda[1]}`;

  // Cliente fixo: todas as vendas do ML entram como "Mercado Livre"
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
export function extrairDadosDoPdf(texto: string): DadosPdf {
  // Layout da Central de Vendedores do Mercado Livre tem formato próprio
  if (/venda\s*#\d{8,}/i.test(texto) && /central de vendedores|ebazar/i.test(texto)) {
    return extrairDadosMercadoLivre(texto);
  }
  // Itens primeiro (o desconto implícito depende deles)
  let itens = extrairItensModoLinha(texto);
  if (itens.length === 0) {
    itens = extrairItensModoSequencia(texto);
  }
  // Número do orçamento (ex: "Orçamento 6315")
  let numeroOrcamento: string | null = null;
  const mNumero = texto.match(/or[cç]amento\s*(\d{2,6})/i);
  if (mNumero) numeroOrcamento = mNumero[1];
  // Cliente: linha "Cliente: X" OU a linha seguinte a "Orçamento NNNN data"
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
  // Data dd/mm/aaaa (mantida como referência — o histórico usa a data de gravação)
  let dataTexto: string | null = null;
  const mData = texto.match(/(\d{2}\/\d{2}\/\d{2,4})/);
  if (mData) dataTexto = mData[1];
  // Desconto explícito ("Desconto: ...")
  let desconto = 0;
  const mDesconto = texto.match(/desconto[^\d\n]*([\d.,]+)/i);
  if (mDesconto) desconto = parseNumeroBR(mDesconto[1]);
  // Desconto implícito: soma dos itens - valor líquido (PDFs sem linha de desconto)
  if (desconto === 0 && itens.length > 0) {
    const mLiquido = texto.match(/valor\s+l[ií]quido[^\d\n]*([\d.,]+)/i);
    if (mLiquido) {
      const liquido = parseNumeroBR(mLiquido[1]);
      const bruto = itens.reduce(
        (s, it) => s + it.quantidade * it.precoUnit,
        0,
      );
      const implicito = Number((bruto - liquido).toFixed(2));
      if (liquido > 0 && implicito > 0.99 && implicito < bruto) {
        desconto = implicito;
      }
    }
  }
    return { numeroOrcamento, clienteNome, dataTexto, desconto, tarifa: 0, frete: 0, obsAuto: null, itens };
}

// ============================================================
// LEITURA DO PDF (pdfjs-dist)
// ============================================================
export async function extrairTextoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker servido do CDN, fixado na versão exata da biblioteca instalada
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const dados = await arquivo.arrayBuffer();
  // Worker do pdfjs na thread principal — imune a caminho/404, compatível com Turbopack
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
export function encontrarMelhorProduto(
  nomePdf: string,
  produtos: ProdutoCatalogo[],
): ProdutoCatalogo | null {
  const alvo = normalizar(nomePdf);
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return null;
  let melhor: ProdutoCatalogo | null = null;
  let melhorScore = 0;
  for (const p of produtos) {
    const nomeP = normalizar(p.nome);
    let score = 0;
    for (const t of tokens) {
      if (nomeP.includes(t)) score++;
    }
    if (score === tokens.length) score += 2; // bônus: casou tudo
    if (score > melhorScore) {
      melhorScore = score;
      melhor = p;
    }
  }
  return melhorScore >= 2 ? melhor : null;
}