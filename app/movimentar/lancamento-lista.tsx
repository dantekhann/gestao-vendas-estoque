"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { registarMovimentacaoEstoque } from "@/lib/estoque";
import type { Produto } from "@/lib/types";

// Normaliza texto: minúsculas, sem acentos, sem emojis nem pontuação de enfeite
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s:=]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface LinhaInterpretada {
  original: string;
  alias: string;
  quantidade: number;
  opcoes: Produto[];
  produtoId: string | null;
  incluir: boolean;
  qualidade: "completo" | "parcial" | "sem";
}

// Lê a lista colada linha a linha e casa cada apelido com o produto do cadastro
function interpretarLista(
  texto: string,
  produtos: Produto[],
): LinhaInterpretada[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const saida: LinhaInterpretada[] = [];

  for (const linha of linhas) {
    const limpa = normalizar(linha).replace(
      /\s+(un|unidades|pares|pacotes)$/,
      "",
    );
    const m = limpa.match(/^(.+?)\s*[=:]\s*([\d.,]+)$/);

    if (!m) {
      saida.push({
        original: linha,
        alias: limpa,
        quantidade: 0,
        opcoes: [],
        produtoId: null,
        incluir: false,
        qualidade: "sem",
      });
      continue;
    }

    const alias = m[1].trim();
    const quantidade = Math.round(Number(m[2].replace(/[.,]/g, ""))) || 0;
    const termos = alias.split(/\s+/).filter((t) => t.length > 1);
    // Produto acabado vence: insumos (caixa, rótulo, frasco, essência, velcro)
    // só entram como opção quando nenhum acabado casar
    const ehInsumo = (p: Produto) => {
      const n = normalizar(p.nome);
      return (
        n.includes("essencia") ||
        /\bcaixa\b/.test(n) ||
        /\brotulo\b/.test(n) ||
        n.startsWith("frasco") ||
        n.includes("velcro")
      );
    };
    const ehAcabado = (p: Produto) => normalizar(p.nome).includes("unidade");

    const opcoes = produtos
      .map((p) => {
        const nomeNorm = normalizar(p.nome);
        return { p, score: termos.filter((t) => nomeNorm.includes(t)).length };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ia = ehInsumo(a.p) ? 1 : 0;
        const ib = ehInsumo(b.p) ? 1 : 0;
        if (ia !== ib) return ia - ib;
        const ua = ehAcabado(a.p) ? 1 : 0;
        const ub = ehAcabado(b.p) ? 1 : 0;
        if (ua !== ub) return ub - ua;
        return a.p.nome.length - b.p.nome.length;
      })
      .map((c) => c.p)
      .slice(0, 6);

    const melhor = opcoes[0] ?? null;
    const qualidade: LinhaInterpretada["qualidade"] =
      melhor && termos.length > 0 && quantidade > 0
        ? termos.every((t) => normalizar(melhor.nome).includes(t))
          ? "completo"
          : "parcial"
        : "sem";

    saida.push({
      original: linha,
      alias,
      quantidade,
      opcoes,
      produtoId: melhor?.id ?? null,
      incluir: qualidade !== "sem",
      qualidade,
    });
  }

  return saida;
}

export default function LancamentoLista() {
  const supabase = createClient();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaInterpretada[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);

  const interpretar = useCallback(async () => {
    const textoAtual = texto;
    setCarregando(true);
    setSucessoMsg(null);
    setFalhas([]);
    try {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, sku, estoque_atual")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      setProdutos((data ?? []) as Produto[]);
      setLinhas(interpretarLista(textoAtual, (data ?? []) as Produto[]));
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setFalhas([errorObj?.message || "Erro ao buscar produtos."]);
    } finally {
      setCarregando(false);
    }
  }, [texto, supabase]);

  const atualizarLinha = (
    indice: number,
    patch: Partial<LinhaInterpretada>,
  ) => {
    setLinhas((prev) =>
      prev.map((l, i) => (i === indice ? { ...l, ...patch } : l)),
    );
  };

  const lancar = async () => {
    const escolhidas = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.incluir && l.produtoId && l.quantidade > 0);
    if (escolhidas.length === 0) return;

    setLancando(true);
    setSucessoMsg(null);
    const erros: string[] = [];
    const okIdx: number[] = [];
    const dataHoje = new Date().toISOString().split("T")[0];

    for (const { l, i } of escolhidas) {
      try {
        await registarMovimentacaoEstoque({
          produtoId: l.produtoId as string,
          tipo: "ENTRADA",
          quantidade: l.quantidade,
          observacao: `[Data: ${dataHoje}] Entrada por colagem de lista: "${l.original}"`,
          sincronizarVelcro: false,
        });
        okIdx.push(i);
      } catch (err: unknown) {
        const errorObj = err as { message?: string };
        erros.push(
          `"${l.alias || l.original}": ${errorObj?.message || "erro"}`,
        );
      }
    }

    setLinhas((prev) => prev.filter((_, i) => !okIdx.includes(i)));
    if (okIdx.length > 0) {
      setSucessoMsg(`${okIdx.length} entrada(s) lançada(s) com sucesso.`);
      setTexto("");
    }
    setFalhas(erros);
    setLancando(false);
  };

  const limpar = () => {
    setTexto("");
    setLinhas([]);
    setSucessoMsg(null);
    setFalhas([]);
  };

  // useEffect manter apenas para silenciar lints caso não usado: removido
  const selecionadas = linhas.filter(
    (l) => l.incluir && l.produtoId && l.quantidade > 0,
  ).length;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">
          📥 Lançar por lista colada
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Cole a lista recebida (ex: bambu = 102 ✅). O sistema reconhece os
          apelidos, mostra uma prévia e lança todas as entradas de uma vez.
        </p>
      </div>

      {sucessoMsg && (
        <div className="p-3.5 border border-emerald-500/30 bg-emerald-950/50 text-emerald-400 rounded-xl text-sm">
          ✅ {sucessoMsg}
        </div>
      )}
      {falhas.length > 0 && (
        <div className="p-3.5 border border-red-500/30 bg-red-950/50 text-red-400 rounded-xl text-sm space-y-1">
          {falhas.map((f, i) => (
            <p key={i}>⚠️ {f}</p>
          ))}
        </div>
      )}

      <textarea
        rows={6}
        placeholder={
          "bambu = 102 ✅\ndoce = 89 ✅\ncravo = 85\nflor = 78\ncapim = 66"
        }
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={interpretar}
          disabled={carregando || texto.trim().length === 0}
          className="flex-1 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-950 disabled:opacity-50 cursor-pointer"
        >
          {carregando ? "Interpretando..." : "🔎 Interpretar lista"}
        </button>
        {linhas.length > 0 && (
          <button
            type="button"
            onClick={limpar}
            className="px-4 py-3 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700 cursor-pointer"
          >
            Limpar
          </button>
        )}
      </div>

      {linhas.length > 0 && (
        <div className="space-y-3">
          {linhas.map((l, i) => {
            const marcador =
              l.qualidade === "completo"
                ? {
                    borda: "border-emerald-900/50",
                    rotulo: "✅ reconhecido",
                    cor: "text-emerald-400",
                  }
                : l.qualidade === "parcial"
                  ? {
                      borda: "border-amber-900/50",
                      rotulo: "🟡 parcial",
                      cor: "text-amber-400",
                    }
                  : {
                      borda: "border-red-900/50",
                      rotulo: "🔴 não reconhecido",
                      cor: "text-red-400",
                    };
            const opcoes = l.opcoes.length > 0 ? l.opcoes : produtos;
            const produtoEscolhido = produtos.find((p) => p.id === l.produtoId);

            return (
              <div
                key={i}
                className={`p-3 rounded-xl border bg-slate-950/60 ${marcador.borda}`}
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-mono text-slate-300 truncate">
                    {l.original}
                  </span>
                  <span
                    className={`text-[11px] font-bold shrink-0 ${marcador.cor}`}
                  >
                    {marcador.rotulo}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_56px] sm:items-center">
                  <select
                    value={l.produtoId ?? ""}
                    onChange={(e) =>
                      atualizarLinha(i, { produtoId: e.target.value || null })
                    }
                    className="w-full p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Selecione o produto...</option>
                    {opcoes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={l.quantidade || ""}
                    onChange={(e) =>
                      atualizarLinha(i, {
                        quantidade: Math.round(Number(e.target.value)) || 0,
                      })
                    }
                    className="w-full p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={l.incluir}
                      onChange={(e) =>
                        atualizarLinha(i, { incluir: e.target.checked })
                      }
                      className="accent-emerald-500"
                    />
                    usar
                  </label>
                </div>
                {produtoEscolhido && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {produtoEscolhido.nome}. Estoque atual:{" "}
                    {produtoEscolhido.estoque_atual}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={lancar}
            disabled={lancando || selecionadas === 0}
            className="w-full py-3.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all shadow-lg shadow-emerald-950 disabled:opacity-50 cursor-pointer"
          >
            {lancando ? "Lançando..." : `📥 Lançar ${selecionadas} entrada(s)`}
          </button>
        </div>
      )}
    </div>
  );
}
