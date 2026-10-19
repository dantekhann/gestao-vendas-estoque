"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ItemDia {
  nome: string;
  quantidade: number;
}

interface DiaHistorico {
  chave: string; // "2026-10-19"
  data: string;  // "dom, 19/10"
  itens: ItemDia[];
  total: number;
}

function formatarDia(chave: string): string {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function HistoricoProducao() {
  const [dias, setDias] = useState<DiaHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function carregar() {
      try {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
        seteDiasAtras.setHours(0, 0, 0, 0);

        const [resProdutos, resMetas, resMovs] = await Promise.all([
          supabase.from("produtos").select("id, nome"),
          supabase.from("metas_producao").select("produto_id"),
          supabase.from("movimentacoes_estoque").select("*"),
        ]);

        if (resProdutos.error) throw resProdutos.error;
        if (resMetas.error) throw resMetas.error;
        if (resMovs.error) throw resMovs.error;

        const nomePorId = new Map<string, string>();
        for (const p of (resProdutos.data ?? []) as Record<string, unknown>[]) {
          nomePorId.set(String(p.id), String(p.nome ?? "Produto"));
        }

        // Mesma regra do relatório: produção = produto que tem meta
        const idsComMeta = new Set(
          ((resMetas.data ?? []) as Record<string, unknown>[]).map((m) =>
            String(m.produto_id)
          )
        );

        // Agrupa por dia → produto
        const porDia = new Map<string, Map<string, number>>();

        for (const mov of (resMovs.data ?? []) as Record<string, unknown>[]) {
          let data: Date | null = null;
          for (const campo of ["created_at", "criado_em", "data", "data_movimentacao"]) {
            const valor = mov[campo];
            if (valor) {
              const d = new Date(String(valor));
              if (!Number.isNaN(d.getTime())) {
                data = d;
                break;
              }
            }
          }
          if (!data || data < seteDiasAtras) continue;

          const tipo = String(mov.tipo ?? "").toUpperCase();
          if (!tipo.includes("ENTRADA")) continue;

          const id = String(mov.produto_id);
          if (!idsComMeta.has(id)) continue;

          // Estorno de venda excluída não é produção
          const obs = String(mov.observacao ?? "").toLowerCase();
          if (obs.includes("estorno")) continue;

          const qtd = Number(mov.quantidade) || 0;

          const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
          if (!porDia.has(chave)) porDia.set(chave, new Map());
          const produtosDoDia = porDia.get(chave)!;
          produtosDoDia.set(id, (produtosDoDia.get(id) ?? 0) + qtd);
        }

        const lista: DiaHistorico[] = [...porDia.entries()]
          .map(([chave, produtos]) => {
            const itens = [...produtos.entries()].map(([id, quantidade]) => ({
              nome: nomePorId.get(id) ?? "Produto",
              quantidade,
            }));
            return {
              chave,
              data: formatarDia(chave),
              itens,
              total: itens.reduce((s, i) => s + i.quantidade, 0),
            };
          })
          .sort((a, b) => b.chave.localeCompare(a.chave)); // mais recente primeiro

        setDias(lista);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "desconhecido");
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
  }, []);

  if (carregando) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
        <p className="text-sm text-slate-500">Carregando histórico…</p>
      </section>
    );
  }

  const totalSemana = dias.reduce((s, d) => s + d.total, 0);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        📅 Produção — últimos 7 dias
      </h2>

      {erro && <p className="mt-2 text-sm text-red-300">Erro ao carregar: {erro}</p>}

      {!erro && dias.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Nenhuma produção nos últimos 7 dias.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {dias.map((dia) => (
          <div
            key={dia.chave}
            className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
          >
            <p className="text-sm font-semibold text-slate-200">
              {dia.data} — {dia.total.toLocaleString("pt-BR")} un.
            </p>
            <ul className="mt-1 space-y-0.5">
              {dia.itens.map((item) => (
                <li key={item.nome} className="text-xs text-slate-400">
                  • {item.nome}: {item.quantidade.toLocaleString("pt-BR")} un.
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {totalSemana > 0 && (
        <p className="mt-3 border-t border-slate-800 pt-3 text-sm font-bold text-amber-400">
          Total dos últimos 7 dias: {totalSemana.toLocaleString("pt-BR")} un.
        </p>
      )}
    </section>
  );
}