"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  listarMetasProducao,
  atualizarMetaProducao,
  type MetaProducao,
} from "@/lib/producao";

type Mensagem = { tipo: "ok" | "info" | "erro"; texto: string } | null;

export default function ProducaoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [metas, setMetas] = useState<MetaProducao[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setCarregando(false);
    });
  }, [supabase, router]);

  const carregar = useCallback(async () => {
    try {
      const lista = await listarMetasProducao();
      setMetas(lista);
      setValores(
        Object.fromEntries(
          lista.map(
            (m) => [m.id, String(m.quantidade_alvo)] as [string, string],
          ),
        ),
      );
      if (lista.length === 0) {
        setMensagem({
          tipo: "erro",
          texto:
            "Nenhuma meta encontrada — rode o SQL de criação da tabela metas_producao.",
        });
      }
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: `Erro ao carregar: ${err instanceof Error ? err.message : "desconhecido"}`,
      });
    }
  }, []);

  useEffect(() => {
    if (!carregando) void carregar();
  }, [carregando, carregar]);

  async function salvar(meta: MetaProducao) {
    const bruto = (valores[meta.id] ?? "").trim();
    const numero = Number(bruto.replace(/\./g, "").replace(",", "."));
    if (bruto === "" || Number.isNaN(numero)) {
      setMensagem({ tipo: "erro", texto: "Digite um número válido." });
      return;
    }

    setSalvandoId(meta.id);
    setMensagem(null);
    try {
      const resultado = await atualizarMetaProducao(meta, numero);

      if (resultado.produziu > 0) {
        setMensagem({
          tipo: "ok",
          texto: `✅ Produção registrada: ${resultado.produziu} unidade(s) de ${meta.nome_produto} lançadas no estoque.`,
        });
      } else if (resultado.aumentouDemanda) {
        setMensagem({
          tipo: "info",
          texto: `ℹ️ Meta atualizada (${meta.quantidade_alvo} → ${numero}): demanda maior não lança produção.`,
        });
      } else {
        setMensagem({ tipo: "info", texto: "Nada mudou — o valor é o mesmo." });
      }

      await carregar();
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: `Erro ao salvar: ${err instanceof Error ? err.message : "desconhecido"}`,
      });
    } finally {
      setSalvandoId(null);
    }
  }

  if (carregando) {
    return <p className="p-8 text-center text-slate-400">Carregando…</p>;
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Precisa Produzir</h1>
        <p className="mt-1 text-sm text-slate-400">
          Quando o número <strong className="text-amber-400">diminui</strong>, a
          diferença é lançada como produção — com desconto da caixa
          correspondente. Quando{" "}
          <strong className="text-slate-200">aumenta</strong>, só a meta é
          atualizada.
        </p>
      </header>

      {mensagem && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            mensagem.tipo === "ok"
              ? "border-green-800 bg-green-950/60 text-green-300"
              : mensagem.tipo === "info"
                ? "border-blue-800 bg-blue-950/60 text-blue-300"
                : "border-red-800 bg-red-950/60 text-red-300"
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      <section className="space-y-4">
        {metas.map((meta) => (
          <div
            key={meta.id}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg"
          >
            <h2 className="text-sm font-medium text-slate-400">
              {meta.nome_produto}
            </h2>
            <p className="mt-1 text-4xl font-bold tracking-tight text-amber-400">
              {meta.quantidade_alvo.toLocaleString("pt-BR")}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              precisa produzir • atualizado em{" "}
              {new Date(meta.atualizado_em).toLocaleString("pt-BR")}
            </p>

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={valores[meta.id] ?? ""}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [meta.id]: e.target.value }))
                }
                className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                placeholder="Novo nº"
              />
              <button
                onClick={() => salvar(meta)}
                disabled={salvandoId === meta.id}
                className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoId === meta.id ? "Salvando…" : "Atualizar"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
