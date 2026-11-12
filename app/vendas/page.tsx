"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatarData } from "@/lib/formatters";

interface ItemVendaDetalhe {
  id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  produtos?: { nome: string } | Array<{ nome: string }> | null;
}

interface Venda {
  id: string;
  cliente: string;
  forma_pagamento: string;
  valor_total: number;
  observacao?: string;
  created_at: string;
  itens_venda?: ItemVendaDetalhe[];
}

// Formas de pagamento (códigos gravados no banco):
// ORCAMENTO = não é venda, não desconta estoque (vira venda pelo botão Converter)
// "-" = venda real com pagamento não identificado (desconta; identifica depois na edição)
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
  ORCAMENTO: "Orçamento",
  "-": "— (não identificado)",
};

function normalizarForma(forma: string): string {
  return (forma || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function rotuloPagamento(forma: string): string {
  return ROTULO_PAGAMENTO[normalizarForma(forma)] ?? forma;
}

function ehOrcamento(forma: string): boolean {
  return normalizarForma(forma) === "ORCAMENTO";
}

// ISO → formato aceito pelo input datetime-local, no horário local
function toInputData(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function VendasPage() {
  const supabase = createClient();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroBusca, setFiltroBusca] = useState<string>("");
  const [filtroPagamento, setFiltroPagamento] = useState<string>("todos");
  const [vendaSelecionada, setVendaSelecionada] = useState<Venda | null>(null);
  const [vendaEditando, setVendaEditando] = useState<Venda | null>(null);
  const [editCliente, setEditCliente] = useState("");
  const [editPagamento, setEditPagamento] = useState("");
  const [editData, setEditData] = useState("");
  const [editObservacao, setEditObservacao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const carregarVendas = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);
      const { data, error } = await supabase
        .from("vendas")
        .select(
          `
          *,
          itens_venda (
            id,
            produto_id,
            quantidade,
            preco_unitario,
            subtotal,
            produtos (nome)
          )
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setVendas(data);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setErro(errObj?.message || "Erro ao carregar lista de vendas.");
    } finally {
      setCarregando(false);
    }
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (isMounted) await carregarVendas();
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [carregarVendas]);

  const handleExcluirVenda = async (vendaId: string) => {
    const confirmar = window.confirm(
      "Tem certeza absoluta que deseja excluir esta venda? O estoque dos itens vendidos será devolvido automaticamente.",
    );
    if (!confirmar) return;
    try {
      const { error } = await supabase.rpc("estornar_e_excluir_venda", {
        p_venda_id: vendaId,
      });
      if (error) throw error;
      window.alert("Venda excluída e estoque estornado com sucesso!");
      await carregarVendas();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      window.alert(
        "Erro ao excluir venda e estornar estoque: " +
          (errObj?.message || "Erro desconhecido"),
      );
    }
  };

  // Ajusta o estoque de 1 item SEM as sincronizações de produção — venda não é produção
  const ajustarEstoqueItem = async (
    produtoId: string,
    quantidade: number,
    tipo: "VENDA" | "ENTRADA",
    observacao: string,
  ) => {
    const { data: produto, error: erroBusca } = await supabase
      .from("produtos")
      .select("id, estoque_atual")
      .eq("id", produtoId)
      .single();
    if (erroBusca) throw erroBusca;
    const estoqueAtual = Number(produto?.estoque_atual) || 0;
    const novoEstoque =
      tipo === "VENDA"
        ? Math.max(0, estoqueAtual - quantidade)
        : estoqueAtual + quantidade;
    const { error: erroMov } = await supabase
      .from("movimentacoes_estoque")
      .insert({ produto_id: produtoId, tipo, quantidade, observacao });
    if (erroMov) throw erroMov;
    const { error: erroUpdate } = await supabase
      .from("produtos")
      .update({ estoque_atual: novoEstoque })
      .eq("id", produtoId);
    if (erroUpdate) throw erroUpdate;
  };

  const abrirEdicao = (venda: Venda) => {
    setVendaEditando(venda);
    setEditCliente(venda.cliente || "");
    setEditPagamento(normalizarForma(venda.forma_pagamento));
    setEditData(toInputData(venda.created_at));
    setEditObservacao(venda.observacao || "");
  };

  const handleSalvarEdicao = async () => {
    if (!vendaEditando) return;
    setSalvandoEdicao(true);
    try {
      const formaAnterior = normalizarForma(vendaEditando.forma_pagamento);
      const formaNova = normalizarForma(editPagamento);
      const eraOrcamento = ehOrcamento(formaAnterior);
      const viraOrcamento = ehOrcamento(formaNova);

      if (eraOrcamento && !viraOrcamento) {
        const ok = window.confirm(
          "Converter este orçamento em venda?\nO estoque dos itens será DESCONTADO.",
        );
        if (!ok) return;
      }
      if (!eraOrcamento && viraOrcamento) {
        const ok = window.confirm(
          "Transformar esta venda em orçamento?\nO estoque dos itens será DEVOLVIDO.",
        );
        if (!ok) return;
      }

      // 1. Dados gerais (cliente, forma de pagamento, data, observação)
      const { error: erroUpdate } = await supabase
        .from("vendas")
        .update({
          cliente: editCliente.trim() || vendaEditando.cliente,
          forma_pagamento: formaNova,
          observacao: editObservacao.trim() || null,
          ...(editData ? { created_at: new Date(editData).toISOString() } : {}),
        })
        .eq("id", vendaEditando.id);
      if (erroUpdate) throw erroUpdate;

      // 2. Orçamento → venda real: desconta o estoque dos itens
      if (eraOrcamento && !viraOrcamento) {
        for (const item of vendaEditando.itens_venda ?? []) {
          if (!item.produto_id) continue;
          await ajustarEstoqueItem(
            item.produto_id,
            item.quantidade,
            "VENDA",
            "Conversão de orçamento em venda",
          );
        }
        window.alert("Orçamento convertido em venda — estoque descontado.");
      }

      // 3. Venda real → orçamento: devolve o estoque dos itens
      if (!eraOrcamento && viraOrcamento) {
        for (const item of vendaEditando.itens_venda ?? []) {
          if (!item.produto_id) continue;
          await ajustarEstoqueItem(
            item.produto_id,
            item.quantidade,
            "ENTRADA",
            "Venda convertida em orçamento (devolução de estoque)",
          );
        }
        window.alert("Venda convertida em orçamento — estoque devolvido.");
      }

      setVendaEditando(null);
      await carregarVendas();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      window.alert(
        "Erro ao salvar edição: " + (errObj?.message || "Erro desconhecido"),
      );
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const vendasFiltradas = vendas.filter((v) => {
    const termo = filtroBusca.toLowerCase().trim();
    const bateBusca =
      v.cliente.toLowerCase().includes(termo) ||
      (v.observacao ? v.observacao.toLowerCase().includes(termo) : false);
    let batePagamento = true;
    if (filtroPagamento !== "todos") {
      batePagamento =
        normalizarForma(v.forma_pagamento) === normalizarForma(filtroPagamento);
    }
    return bateBusca && batePagamento;
  });

  // Orçamento não é receita — o faturamento conta só vendas reais
  const totalFaturado = vendasFiltradas
    .filter((v) => !ehOrcamento(v.forma_pagamento))
    .reduce((acc, v) => acc + (v.valor_total || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Histórico de Vendas
            </h1>
            <p className="text-sm text-slate-400">
              OrC Brasil - Controle Comercial e Faturamento
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Link
              href="/vendas/lancar"
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-center shadow-sm"
            >
              + Registar Nova Venda
            </Link>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 text-center"
            >
              ← Painel
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Total de Vendas Listadas
            </span>
            <div className="text-2xl font-bold text-white mt-1">
              {vendasFiltradas.length}
            </div>
          </div>
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Faturamento Filtrado (sem orçamentos)
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              R$ {totalFaturado.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-200">
              Registo de Transações
            </h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <select
                value={filtroPagamento}
                onChange={(e) => setFiltroPagamento(e.target.value)}
                className="p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none"
              >
                <option value="todos">Todas as Formas de Pagamento</option>
                <option value="PIX">PIX</option>
                <option value="CARTAO">Cartão</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="BOLETO">Boleto</option>
                <option value="TRANSFERENCIA">Transferência</option>
                <option value="ORCAMENTO">Orçamento</option>
                <option value="-">— (não identificado)</option>
              </select>
              <input
                type="text"
                placeholder="Pesquisar por cliente ou obs..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none w-full sm:w-64"
              />
            </div>
          </div>

          {erro && (
            <div className="p-4 bg-red-950/50 border border-red-500/30 text-red-400 rounded-lg text-sm">
              {erro}
            </div>
          )}

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              A carregar vendas...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Pagamento</th>
                    <th className="p-3.5">Observação / Itens</th>
                    <th className="p-3.5 text-right">Valor Total</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {vendasFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center p-8 text-slate-500"
                      >
                        Nenhuma venda encontrada.
                      </td>
                    </tr>
                  ) : (
                    vendasFiltradas.map((venda) => (
                      <tr
                        key={venda.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-3.5 text-slate-300 whitespace-nowrap">
                          {formatarData(venda.created_at)}
                        </td>
                        <td className="p-3.5 font-semibold text-white">
                          {venda.cliente}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                              ehOrcamento(venda.forma_pagamento)
                                ? "bg-amber-950/60 border-amber-700/50 text-amber-400"
                                : venda.forma_pagamento === "-"
                                  ? "bg-slate-800 border-slate-600 text-slate-400 italic"
                                  : "bg-slate-800 border-slate-700 text-slate-300"
                            }`}
                          >
                            {rotuloPagamento(venda.forma_pagamento)}
                          </span>
                        </td>
                        <td
                          className="p-3.5 text-slate-300 max-w-xs truncate"
                          title={venda.observacao || ""}
                        >
                          {venda.observacao || "—"}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-400 whitespace-nowrap">
                          R$ {(venda.valor_total || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setVendaSelecionada(venda)}
                            className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900 text-blue-400 border border-blue-800/50 rounded text-xs font-semibold cursor-pointer"
                          >
                            Detalhes
                          </button>
                          {ehOrcamento(venda.forma_pagamento) && (
                            <button
                              type="button"
                              onClick={() => abrirEdicao(venda)}
                              className="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-900 text-amber-400 border border-amber-800/50 rounded text-xs font-semibold cursor-pointer"
                            >
                              Converter
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => abrirEdicao(venda)}
                            className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/50 rounded text-xs font-semibold cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExcluirVenda(venda.id)}
                            className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/50 rounded text-xs font-semibold cursor-pointer"
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {vendaSelecionada && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Detalhes da Venda
                </h3>
                <p className="text-xs text-slate-400">
                  Cliente:{" "}
                  <span className="text-emerald-400 font-semibold">
                    {vendaSelecionada.cliente}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVendaSelecionada(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex justify-between">
                <span>Data:</span>
                <span className="font-medium text-white">
                  {formatarData(vendaSelecionada.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Forma de Pagamento:</span>
                <span className="font-medium text-white">
                  {rotuloPagamento(vendaSelecionada.forma_pagamento)}
                </span>
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Itens do Pedido:
                </span>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 max-h-48 overflow-y-auto">
                  {vendaSelecionada.itens_venda &&
                  vendaSelecionada.itens_venda.length > 0 ? (
                    vendaSelecionada.itens_venda.map((item) => {
                      const nomeProd = Array.isArray(item.produtos)
                        ? item.produtos[0]?.nome
                        : item.produtos?.nome;
                      return (
                        <div
                          key={item.id}
                          className="flex justify-between items-center text-xs border-b border-slate-800/60 pb-1.5 last:border-0"
                        >
                          <div>
                            <span className="font-semibold text-white">
                              {nomeProd || "Produto"}
                            </span>
                            <span className="text-slate-400 ml-2">
                              ({item.quantidade}x R${" "}
                              {item.preco_unitario.toFixed(2)})
                            </span>
                          </div>
                          <span className="font-bold text-emerald-400">
                            R$ {item.subtotal.toFixed(2)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-slate-500">
                      Sem itens registados em detalhe.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-base font-bold">
                <span className="text-slate-200">Valor Total:</span>
                <span className="text-emerald-400">
                  R$ {(vendaSelecionada.valor_total || 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setVendaSelecionada(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {vendaEditando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Editar Venda / Orçamento
                </h3>
                <p className="text-xs text-slate-400">
                  Cliente:{" "}
                  <span className="text-emerald-400 font-semibold">
                    {vendaEditando.cliente}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVendaEditando(null)}
                className="text-slate-400 hover:text-white text-sm font-bold px-3 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {ehOrcamento(vendaEditando.forma_pagamento) && (
                <div className="p-3 bg-amber-950/40 border border-amber-700/40 text-amber-400 rounded-lg text-xs">
                  💡 Este registro é um <strong>orçamento</strong> (não
                  descontou estoque). Ao salvar com uma forma de pagamento real
                  (ou "—"), ele é convertido em venda e o estoque é descontado.
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Cliente
                </label>
                <input
                  type="text"
                  value={editCliente}
                  onChange={(e) => setEditCliente(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={editPagamento}
                  onChange={(e) => setEditPagamento(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 outline-none"
                >
                  {(FORMAS_PAGAMENTO.includes(editPagamento)
                    ? FORMAS_PAGAMENTO
                    : [editPagamento, ...FORMAS_PAGAMENTO]
                  ).map((f) => (
                    <option key={f} value={f}>
                      {rotuloPagamento(f)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Data da Venda
                </label>
                <input
                  type="datetime-local"
                  value={editData}
                  onChange={(e) => setEditData(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Observação
                </label>
                <textarea
                  value={editObservacao}
                  onChange={(e) => setEditObservacao(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 outline-none"
                />
              </div>
              {!ehOrcamento(vendaEditando.forma_pagamento) &&
                ehOrcamento(editPagamento) && (
                  <div className="p-3 bg-amber-950/40 border border-amber-700/40 text-amber-400 rounded-lg text-xs">
                    ⚠️ Mudar de venda para <strong>Orçamento</strong> devolve o
                    estoque dos itens.
                  </div>
                )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVendaEditando(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarEdicao}
                disabled={salvandoEdicao}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                {salvandoEdicao ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
