"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registarMovimentacaoEstoque } from "@/lib/estoque";

// ============================================================
// TIPOS
// ============================================================
interface Produto {
  id: string;
  nome: string;
  sku?: string | null;
  estoque_atual: number | null;
}

interface ItemVenda {
  produtoId: string | null;
  nomePdf: string;
  quantidade: number;
  precoUnit: number;
  subtotal: number;
}

interface Cliente {
  id: string;
  nome: string;
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

function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ============================================================
// PARSER DO PDF (formato Orçamento/Dominus e variantes)
// ============================================================
interface ItemBruto {
  nomePdf: string;
  quantidade: number;
  precoUnit: number;
  subtotal: number;
}

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

function extrairDadosDoPdf(texto: string) {
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

  return { numeroOrcamento, clienteNome, dataTexto, desconto, itens };
}

// ============================================================
// LEITURA DO PDF (pdfjs-dist)
// ============================================================
async function extrairTextoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Worker servido do CDN, fixado na versão exata da biblioteca instalada (3.11.174)
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const dados = await arquivo.arrayBuffer();
  // Worker do pdfjs na thread principal — imune a caminho/404, compatível com Turbopack
const globalWorker = globalThis as unknown as { pdfjsWorker?: unknown };
if (!globalWorker.pdfjsWorker) {
  // @ts-expect-error — o módulo do worker não tem declarações de tipo
  globalWorker.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
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
// CASAMENTO PRODUTO DO CATÁLOGO
// ============================================================
function encontrarMelhorProduto(
  nomePdf: string,
  produtos: Produto[],
): Produto | null {
  const alvo = normalizar(nomePdf);
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  if (tokens.length === 0) return null;
  let melhor: Produto | null = null;
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

// ============================================================
// PÁGINA
// ============================================================
export default function LancarVendaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [novoClienteNome, setNovoClienteNome] = useState<string>("");
  const [usarNovoCliente, setUsarNovoCliente] = useState<boolean>(false);
  const [clientePdfNome, setClientePdfNome] = useState<string | null>(null);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [desconto, setDesconto] = useState<number>(0);
  const [formaPagamento, setFormaPagamento] = useState<string>("PIX");
  const [observacao, setObservacao] = useState<string>("");
  const [numeroOrcamento, setNumeroOrcamento] = useState<string | null>(null);

  const [buscaProduto, setBuscaProduto] = useState<string>("");
  const [qtdNovoItem, setQtdNovoItem] = useState<number>(1);
  const [precoNovoItem, setPrecoNovoItem] = useState<number>(0);
  const [mostrarDropdown, setMostrarDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [importando, setImportando] = useState<boolean>(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    try {
      const [
        { data: dataClientes, error: errClientes },
        { data: dataProdutos, error: errProdutos },
      ] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nome")
          .order("nome", { ascending: true }),
        supabase
          .from("produtos")
          .select("id, nome, sku, estoque_atual")
          .eq("ativo", true)
          .order("nome", { ascending: true }),
      ]);
      if (errClientes)
        console.warn("Tabela clientes indisponível:", errClientes.message);
      if (dataClientes) setClientes(dataClientes);
      if (errProdutos) throw errProdutos;
      if (dataProdutos) setProdutos(dataProdutos);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErro(e?.message || "Erro ao carregar clientes/produtos.");
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      if (isMounted) await carregarDados();
    }
    init();
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setMostrarDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      isMounted = false;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [carregarDados]);

  const produtosFiltrados = produtos.filter(
    (p) =>
      p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(buscaProduto.toLowerCase())),
  );

  const subtotalItens = itens.reduce((soma, it) => soma + it.subtotal, 0);
  const totalLiquido = Math.max(0, subtotalItens - desconto);
  const itensSemProduto = itens.filter((it) => !it.produtoId).length;

  // ---------- IMPORTAÇÃO DO PDF ----------
  const handleImportarPdf = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;
    setImportando(true);
    setErro(null);
    setImportInfo(null);
    try {
      const texto = await extrairTextoDoPdf(arquivo);
      // Depuração: útil se um PDF de layout diferente falhar; pode remover depois
      console.log("[PDF EXTRAÍDO]", texto);
      const dados = extrairDadosDoPdf(texto);

      if (dados.itens.length === 0) {
        setImportInfo(
          "O PDF foi lido, mas nenhum item foi reconhecido. Preencha manualmente abaixo.",
        );
        setImportando(false);
        return;
      }

      const itensConvertidos: ItemVenda[] = dados.itens.map((it) => ({
        produtoId: encontrarMelhorProduto(it.nomePdf, produtos)?.id ?? null,
        nomePdf: it.nomePdf,
        quantidade: it.quantidade,
        precoUnit: it.precoUnit,
        subtotal: it.subtotal,
      }));

      setItens(itensConvertidos);
      setNumeroOrcamento(dados.numeroOrcamento);
      setClientePdfNome(dados.clienteNome);

      // Pré-seleciona o cliente se ele já estiver no cadastro
      if (dados.clienteNome && !usarNovoCliente) {
        const primeiroToken =
          normalizar(dados.clienteNome).split(" ")[0] || "###";
        const encontrado = clientes.find((c) =>
          normalizar(c.nome).includes(primeiroToken),
        );
        if (encontrado) setClienteId(encontrado.id);
      }
      if (dados.desconto > 0) setDesconto(dados.desconto);

      const semMatch = itensConvertidos.filter((i) => !i.produtoId).length;
      setImportInfo(
        `Orçamento ${dados.numeroOrcamento || "—"}${dados.clienteNome ? ` — ${dados.clienteNome}` : ""}: ${itensConvertidos.length} item(ns) identificado(s)${
          semMatch > 0
            ? ` — ${semMatch} precisa(m) de produto manual`
            : " — todos vinculados"
        }. Confira os valores antes de confirmar.`,
      );
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErro(
        `Falha ao ler o PDF: ${e?.message || "erro desconhecido"}. Preencha manualmente.`,
      );
    }
    setImportando(false);
    event.target.value = "";
  };

  // ---------- ADIÇÃO MANUAL DE ITEM ----------
  const adicionarItem = (produto: Produto) => {
    const existente = itens.find((it) => it.produtoId === produto.id);
    if (existente) {
      setItens(
        itens.map((it) =>
          it.produtoId === produto.id
            ? {
                ...it,
                quantidade: it.quantidade + qtdNovoItem,
                subtotal: (it.quantidade + qtdNovoItem) * it.precoUnit,
              }
            : it,
        ),
      );
    } else {
      setItens([
        ...itens,
        {
          produtoId: produto.id,
          nomePdf: produto.nome,
          quantidade: qtdNovoItem,
          precoUnit: precoNovoItem > 0 ? precoNovoItem : 0,
          subtotal: qtdNovoItem * (precoNovoItem > 0 ? precoNovoItem : 0),
        },
      ]);
    }
    setBuscaProduto("");
    setQtdNovoItem(1);
    setPrecoNovoItem(0);
    setMostrarDropdown(false);
  };

  const atualizarItem = (
    index: number,
    campo: "quantidade" | "precoUnit",
    valor: number,
  ) => {
    setItens(
      itens.map((it, i) =>
        i === index
          ? {
              ...it,
              [campo]: valor,
              subtotal:
                campo === "quantidade"
                  ? valor * it.precoUnit
                  : it.quantidade * valor,
            }
          : it,
      ),
    );
  };

  const atribuirProduto = (index: number, produtoId: string) => {
    const produto = produtos.find((p) => p.id === produtoId);
    setItens(
      itens.map((it, i) =>
        i === index
          ? { ...it, produtoId, nomePdf: produto ? produto.nome : it.nomePdf }
          : it,
      ),
    );
  };

  const removerItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  // ---------- CONFIRMAÇÃO DA VENDA ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (carregando) return;
    setErro(null);
    setSucesso(null);

    if (itens.length === 0) {
      setErro(
        "Adicione ao menos um item à venda (importando o PDF ou manualmente).",
      );
      return;
    }
    if (itensSemProduto > 0) {
      setErro(
        `${itensSemProduto} item(ns) sem produto vinculado — selecione o produto correspondente na lista.`,
      );
      return;
    }
    if (itens.some((it) => it.quantidade <= 0 || it.precoUnit <= 0)) {
      setErro(
        "Todos os itens precisam de quantidade e preço unitário maiores que zero.",
      );
      return;
    }

    setCarregando(true);
    try {
      // 1. Resolve o cliente, em ordem de prioridade:
      //    digitado manualmente > selecionado na lista > nome vindo do PDF (cadastra sozinho)
      let clienteFinalNome = "Cliente Avulso";
      if (usarNovoCliente && novoClienteNome.trim()) {
        clienteFinalNome = novoClienteNome.trim();
        const { error: errNovoCli } = await supabase
          .from("clientes")
          .insert({ nome: clienteFinalNome });
        if (errNovoCli) {
          console.warn(
            "Cliente novo não cadastrado (a venda segue com o nome):",
            errNovoCli.message,
          );
        }
      } else if (clienteId) {
        const cli = clientes.find((c) => c.id === clienteId);
        if (cli) clienteFinalNome = cli.nome;
      } else if (clientePdfNome) {
        clienteFinalNome = clientePdfNome;
        // Evita duplicado: cadastra só se o nome ainda não existir no cadastro
        const { data: cliExistente } = await supabase
          .from("clientes")
          .select("id, nome")
          .eq("nome", clienteFinalNome)
          .maybeSingle();
        if (cliExistente) {
          clienteFinalNome = cliExistente.nome;
        } else {
          const { data: novoCli, error: errPdfCli } = await supabase
            .from("clientes")
            .insert({ nome: clienteFinalNome })
            .select("id, nome")
            .single();
          if (errPdfCli) {
            console.warn(
              "Cliente do PDF não cadastrado (a venda segue com o nome):",
              errPdfCli.message,
            );
          } else if (novoCli) {
            setClientes((atual) =>
              [...atual, novoCli].sort((a, b) => a.nome.localeCompare(b.nome)),
            );
          }
        }
      }

      // 2. Monta a observação com os dados do orçamento (visível e filtrável no histórico)
      const partesObs: string[] = [];
      if (numeroOrcamento) partesObs.push(`Orçamento ${numeroOrcamento}`);
      if (desconto > 0) partesObs.push(`Desconto ${formatarBRL(desconto)}`);
      if (observacao.trim()) partesObs.push(observacao.trim());
      const observacaoFinal = partesObs.join(" | ") || null;

      // 3. Grava a venda nas colunas que o Histórico de Vendas lê
      const { data: vendaCriada, error: erroVenda } = await supabase
        .from("vendas")
        .insert({
          cliente: clienteFinalNome,
          forma_pagamento: formaPagamento,
          valor_total: Number(totalLiquido.toFixed(2)),
          observacao: observacaoFinal,
        })
        .select("id")
        .single();
      if (erroVenda) throw erroVenda;
      const vendaId = vendaCriada.id;

      // 4. Grava os itens
      const linhasItens = itens.map((it) => ({
        venda_id: vendaId,
        produto_id: it.produtoId,
        quantidade: it.quantidade,
        preco_unitario: it.precoUnit,
        subtotal: it.subtotal,
      }));
      const { error: erroItens } = await supabase
        .from("itens_venda")
        .insert(linhasItens);
      if (erroItens) throw erroItens;

      // 5. Desconta o estoque de cada item (produto final — sem efeito em insumos)
      for (const it of itens) {
        await registarMovimentacaoEstoque({
          produtoId: it.produtoId as string,
          tipo: "VENDA",
          quantidade: it.quantidade,
          observacao: `Venda #${String(vendaId).slice(0, 8)} — ${clienteFinalNome}`,
          sincronizarVelcro: false,
        });
      }

      setSucesso(
        `Venda registrada para ${clienteFinalNome}: ${itens.length} item(ns), total ${formatarBRL(totalLiquido)}. Estoque atualizado.`,
      );
      setItens([]);
      setDesconto(0);
      setObservacao("");
      setNumeroOrcamento(null);
      setClientePdfNome(null);
      setClienteId("");
      setUsarNovoCliente(false);
      setNovoClienteNome("");
      setImportInfo(null);
    } catch (err: unknown) {
      // Expõe o erro completo (código, mensagem, detalhe) na faixa vermelha e no console
      let detalhe = "";
      if (err instanceof Error) {
        detalhe = err.message;
      } else if (err && typeof err === "object") {
        const obj = err as Record<string, unknown>;
        detalhe = Object.keys(obj)
          .filter((k) => obj[k] !== null && obj[k] !== undefined)
          .map((k) => `${k}: ${String(obj[k])}`)
          .join(" | ");
      }
      if (!detalhe) detalhe = JSON.stringify(err) || String(err);
      console.error("Erro ao registrar venda [completo]:", err);
      setErro(`Erro ao registrar a venda — ${detalhe}`);
    }
    setCarregando(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-start">
      <div className="max-w-2xl w-full space-y-6">
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Registar Nova Venda
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              OrC Brasil - Controle Comercial
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/vendas")}
            className="px-3.5 py-2 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 cursor-pointer"
          >
            ← Voltar
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5"
        >
          {erro && (
            <div className="p-3.5 border border-red-500/30 bg-red-950/50 text-red-400 rounded-xl text-sm">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="p-3.5 border border-emerald-500/30 bg-emerald-950/50 text-emerald-400 rounded-xl text-sm">
              ✅ {sucesso}
            </div>
          )}

          {/* IMPORTAÇÃO DO PDF */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              IMPORTAR PEDIDO DO WHATSAPP (PDF)
            </label>
            <p className="text-[11px] text-slate-500">
              Carrega número do orçamento, cliente, itens e desconto. O cliente
              novo entra no cadastro automaticamente ao confirmar.
            </p>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleImportarPdf}
              disabled={importando}
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-400 text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:font-bold file:cursor-pointer cursor-pointer"
            />
            {importando && (
              <p className="text-xs text-blue-400">Lendo o PDF...</p>
            )}
            {importInfo && (
              <p className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2.5">
                📄 {importInfo}
              </p>
            )}
          </div>

          {/* CLIENTE */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              1. IDENTIFICAÇÃO DO CLIENTE
            </label>
            {!usarNovoCliente ? (
              <div className="flex gap-2">
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="flex-1 p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">
                    {clientePdfNome
                      ? `Cliente do PDF: ${clientePdfNome}`
                      : "Cliente Avulso"}
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUsarNovoCliente(true)}
                  className="px-3 py-2 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl border border-slate-700 cursor-pointer whitespace-nowrap"
                >
                  + Novo Cliente
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nome do novo cliente"
                  value={novoClienteNome}
                  onChange={(e) => setNovoClienteNome(e.target.value)}
                  className="flex-1 p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setUsarNovoCliente(false);
                    setNovoClienteNome("");
                  }}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Voltar à lista
                </button>
              </div>
            )}
          </div>

          {/* FORMA DE PAGAMENTO E DESCONTO */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                FORMA DE PAGAMENTO
              </label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO">Cartão</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="BOLETO">Boleto</option>
                <option value="TRANSFERENCIA">Transferência</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                DESCONTO (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
                className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* PESQUISA DE PRODUTOS (ADICIONAR MANUAL) */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              2. PESQUISA E SELEÇÃO DE PRODUTOS
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Digite ou Selecione o Produto (Ex: Yerba Display...)"
                value={buscaProduto}
                onFocus={() => setMostrarDropdown(true)}
                onChange={(e) => {
                  setBuscaProduto(e.target.value);
                  setMostrarDropdown(true);
                }}
                className="col-span-3 w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="number"
                min="1"
                value={qtdNovoItem}
                onChange={(e) => setQtdNovoItem(Number(e.target.value))}
                placeholder="Qtd"
                className="p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={precoNovoItem}
                onChange={(e) => setPrecoNovoItem(Number(e.target.value))}
                placeholder="Preço Unit. (R$)"
                className="p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  const alvo = produtosFiltrados[0];
                  if (alvo) adicionarItem(alvo);
                  else setErro("Nenhum produto corresponde à busca.");
                }}
                className="p-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors cursor-pointer"
              >
                Adicionar
              </button>
            </div>
            {mostrarDropdown && produtosFiltrados.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-slate-800">
                {produtosFiltrados.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => adicionarItem(p)}
                    className="p-3 text-sm hover:bg-slate-800/80 cursor-pointer flex justify-between items-center transition-colors"
                  >
                    <span className="font-semibold text-white">{p.nome}</span>
                    <span className="text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
                      Estoque: {p.estoque_atual}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ITENS DA VENDA */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              3. ITENS DA VENDA ({itens.length})
            </label>
            {itens.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 border border-slate-800 rounded-xl text-center">
                Nenhum item ainda — importe o PDF ou adicione manualmente acima.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                {itens.map((it, index) => {
                  const produtoVinculado = produtos.find(
                    (p) => p.id === it.produtoId,
                  );
                  return (
                    <div key={index} className="p-3 bg-slate-950/60 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {produtoVinculado ? (
                            <span className="text-sm font-semibold text-emerald-400">
                              {produtoVinculado.nome}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold text-amber-400">
                              ⚠️ {it.nomePdf}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removerItem(index)}
                          className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          Remover
                        </button>
                      </div>
                      {!produtoVinculado && (
                        <select
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            atribuirProduto(index, e.target.value)
                          }
                          className="w-full p-2 border border-amber-700/50 rounded-lg bg-slate-950 text-amber-300 text-xs outline-none"
                        >
                          <option value="">
                            — Selecione o produto do catálogo —
                          </option>
                          {produtos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <label className="text-[11px] text-slate-500">
                          Qtd
                          <input
                            type="number"
                            min="1"
                            value={it.quantidade}
                            onChange={(e) =>
                              atualizarItem(
                                index,
                                "quantidade",
                                Number(e.target.value),
                              )
                            }
                            className="w-full mt-1 p-2 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 outline-none"
                          />
                        </label>
                        <label className="text-[11px] text-slate-500">
                          Preço Unit. (R$)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.precoUnit}
                            onChange={(e) =>
                              atualizarItem(
                                index,
                                "precoUnit",
                                Number(e.target.value),
                              )
                            }
                            className="w-full mt-1 p-2 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 outline-none"
                          />
                        </label>
                        <div className="text-[11px] text-slate-500">
                          Subtotal
                          <div className="mt-1 p-2 border border-slate-800 rounded-lg bg-slate-900 text-slate-300 font-bold">
                            {formatarBRL(it.subtotal)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TOTAIS */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span>{formatarBRL(subtotalItens)}</span>
            </div>
            <div className="flex justify-between text-rose-400">
              <span>Desconto</span>
              <span>- {formatarBRL(desconto)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-emerald-400 pt-1 border-t border-slate-800">
              <span>Total Líquido</span>
              <span>{formatarBRL(totalLiquido)}</span>
            </div>
          </div>

          {/* OBSERVAÇÃO */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              OBSERVAÇÃO (OPCIONAL)
            </label>
            <input
              type="text"
              placeholder="Ex: pagamento combinado para 15/11..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-500">
              O número do orçamento e o desconto importados entram
              automaticamente na observação do histórico.
            </p>
          </div>

          <button
            type="submit"
            disabled={carregando || itens.length === 0 || itensSemProduto > 0}
            className="w-full py-3.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-950 disabled:opacity-50 cursor-pointer"
          >
            {carregando
              ? "Registrando venda..."
              : "Confirmar Venda e Descontar Estoque"}
          </button>
        </form>
      </div>
    </div>
  );
}
