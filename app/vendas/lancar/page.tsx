"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registarMovimentacaoEstoque } from "@/lib/estoque";
import {
  extrairDadosDoPdf,
  extrairTextoDoPdf,
  encontrarMelhorProduto,
  formatarBRL,
  normalizar,
  type ProdutoCatalogo,
} from "@/lib/pdf-orcamento";

// ORCAMENTO = não é venda, não desconta estoque (vira venda pelo "Converter" no Histórico)
// "-" = venda real com pagamento não identificado (desconta; identifica depois na Edição)
const FORMAS_PAGAMENTO = [
  "PIX",
  "CARTAO",
  "DINHEIRO",
  "BOLETO",
  "TRANSFERENCIA",
  "ORCAMENTO",
  "-",
];
const ROTULO_PAGAMENTO: Record<string, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
  ORCAMENTO: "Orçamento (não desconta estoque)",
  "-": "— (pagamento não identificado)",
};
function ehOrcamento(forma: string): boolean {
  return forma === "ORCAMENTO";
}

// Classes reutilizadas (mesma aparência, menos repetição)
const clsLabel =
  "block text-xs font-semibold uppercase tracking-wider text-slate-400";
const clsInput =
  "w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500";
const clsItemInput =
  "w-full mt-1 p-2 border border-slate-700 rounded-lg bg-slate-900 text-slate-100 outline-none";
const clsModalInput =
  "w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 outline-none";

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

export default function LancarVendaPage() {
  const router = useRouter();
  const supabase = createClient();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [novoClienteNome, setNovoClienteNome] = useState<string>("");
  const [usarNovoCliente, setUsarNovoCliente] = useState<boolean>(false);
  const [clientePdfNome, setClientePdfNome] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [desconto, setDesconto] = useState<number>(0);
  const [tarifa, setTarifa] = useState<number>(0);
  const [frete, setFrete] = useState<number>(0);
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
  const totalLiquido = Math.max(0, subtotalItens - desconto - tarifa - frete);
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
  const adicionarItem = (produto: ProdutoCatalogo) => {
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

  // ---------- CONFIRMAÇÃO DA VENDA / ORÇAMENTO ----------
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
    const eOrcamento = ehOrcamento(formaPagamento);
    setCarregando(true);
    try {
      // 1. Resolve o cliente: digitado > selecionado na lista > nome do PDF (cadastra sozinho)
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
      // 2. Observação com orçamento e deduções (visível e filtrável no histórico)
      const partesObs: string[] = [];
      if (numeroOrcamento) partesObs.push(`Orçamento ${numeroOrcamento}`);
      if (desconto > 0) partesObs.push(`Desconto ${formatarBRL(desconto)}`);
      if (tarifa > 0) partesObs.push(`Tarifa ${formatarBRL(tarifa)}`);
      if (frete > 0) partesObs.push(`Frete ${formatarBRL(frete)}`);
      if (observacao.trim()) partesObs.push(observacao.trim());
      const observacaoFinal = partesObs.join(" | ") || null;
      // 3. Grava a venda
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
      // 5. Desconta o estoque — EXCETO quando é orçamento
      if (!eOrcamento) {
        for (const it of itens) {
          await registarMovimentacaoEstoque({
            produtoId: it.produtoId as string,
            tipo: "VENDA",
            quantidade: it.quantidade,
            observacao: `Venda #${String(vendaId).slice(0, 8)} — ${clienteFinalNome}`,
            sincronizarVelcro: false,
          });
        }
      }
      setSucesso(
        eOrcamento
          ? `Orçamento registrado para ${clienteFinalNome}: ${itens.length} item(ns), total ${formatarBRL(totalLiquido)}. Estoque NÃO descontado — use "Converter" no Histórico para virar venda.`
          : `Venda registrada para ${clienteFinalNome}: ${itens.length} item(ns), total ${formatarBRL(totalLiquido)}. Estoque atualizado.`,
      );
      setItens([]);
      setDesconto(0);
      setTarifa(0);
      setFrete(0);
      setObservacao("");
      setNumeroOrcamento(null);
      setClientePdfNome(null);
      setClienteId("");
      setUsarNovoCliente(false);
      setNovoClienteNome("");
      setImportInfo(null);
    } catch (err: unknown) {
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

  // Deduções exibidas juntas na seção 4 (desconto, tarifa, frete)
  const deducoes: [string, number, (n: number) => void][] = [
    ["DESCONTO (R$)", desconto, setDesconto],
    ["TARIFA (R$)", tarifa, setTarifa],
    ["FRETE (R$)", frete, setFrete],
  ];

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
            <label className={clsLabel}>
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

          {/* 1. CLIENTE */}
          <div className="space-y-1.5">
            <label className={clsLabel}>1. IDENTIFICAÇÃO DO CLIENTE</label>
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
                  className={clsInput}
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

          {/* 2. PESQUISA E SELEÇÃO DE PRODUTOS */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className={clsLabel}>
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
                className={clsInput}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={precoNovoItem}
                onChange={(e) => setPrecoNovoItem(Number(e.target.value))}
                placeholder="Preço Unit. (R$)"
                className={clsInput}
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
          {/* 3. ITENS DA VENDA */}
          <div className="space-y-1.5">
            <label className={clsLabel}>
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
                            className={clsItemInput}
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
                            className={clsItemInput}
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

          {/* 4. FORMA DE PAGAMENTO E DEDUÇÕES */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={clsLabel}>4. FORMA DE PAGAMENTO</label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className={clsInput}
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {ROTULO_PAGAMENTO[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {deducoes.map(([rotulo, valor, setValor]) => (
                <div key={rotulo} className="space-y-1.5">
                  <label className={clsLabel}>{rotulo}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valor}
                    onChange={(e) => setValor(Number(e.target.value))}
                    className={clsInput}
                  />
                </div>
              ))}
            </div>
            {ehOrcamento(formaPagamento) && (
              <div className="p-3 border border-amber-500/30 bg-amber-950/40 text-amber-400 rounded-xl text-xs">
                💡 Orçamento não desconta estoque. Para virar venda, use o botão
                "Converter" no Histórico de Vendas — aí sim o estoque é
                descontado.
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
            <div className="flex justify-between text-rose-400">
              <span>Tarifa</span>
              <span>- {formatarBRL(tarifa)}</span>
            </div>
            <div className="flex justify-between text-rose-400">
              <span>Frete</span>
              <span>- {formatarBRL(frete)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-emerald-400 pt-1 border-t border-slate-800">
              <span>Total Líquido</span>
              <span>{formatarBRL(totalLiquido)}</span>
            </div>
          </div>

          {/* OBSERVAÇÃO */}
          <div className="space-y-1.5">
            <label className={clsLabel}>OBSERVAÇÃO (OPCIONAL)</label>
            <input
              type="text"
              placeholder="Ex: pagamento combinado para 15/11..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className={clsModalInput}
            />
            <p className="text-[11px] text-slate-500">
              O número do orçamento e as deduções entram automaticamente na
              observação do histórico.
            </p>
          </div>

          <button
            type="submit"
            disabled={carregando || itens.length === 0 || itensSemProduto > 0}
            className={
              ehOrcamento(formaPagamento)
                ? "w-full py-3.5 text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all shadow-lg shadow-amber-950 disabled:opacity-50 cursor-pointer"
                : "w-full py-3.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-950 disabled:opacity-50 cursor-pointer"
            }
          >
            {carregando
              ? "Registrando..."
              : ehOrcamento(formaPagamento)
                ? "Confirmar Orçamento (não desconta estoque)"
                : "Confirmar Venda e Descontar Estoque"}
          </button>
        </form>
      </div>
    </div>
  );
}
