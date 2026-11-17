'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatarData } from '@/lib/formatters';

const PREFIXO_CONSUMO = 'CONSUMO_PRODUCAO';

interface Produto {
  id: string;
  nome: string;
  estoque_atual?: number;
}

interface Movimentacao {
  id: string;
  produto_id: string;
  tipo: string;
  quantidade: number;
  observacao?: string | null;
  created_at: string;
  produtos?: Produto | Produto[] | null;
}

type FiltroTipo = 'TODOS' | 'ENTRADA' | 'SAIDA' | 'VENDA' | 'AJUSTE' | 'CONSUMO';

function produtoDe(m: Movimentacao): Produto | null {
  if (Array.isArray(m.produtos)) return m.produtos[0] ?? null;
  return m.produtos ?? null;
}

function ehConsumo(m: Movimentacao): boolean {
  return (m.observacao ?? '').startsWith(PREFIXO_CONSUMO);
}

function unidadeDe(nome: string): 'g' | 'un' {
  return nome.toLowerCase().includes('granel') ? 'g' : 'un';
}

export default function MovimentacoesPage() {
  const supabase = createClient();
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TODOS');
  const [filtroBusca, setFiltroBusca] = useState<string>('');

  const carregarMovimentacoes = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('*, produtos (id, nome, estoque_atual)')
        .order('created_at', { ascending: false })
        .range(0, 199);

      if (error) throw error;
      if (data) setMovimentacoes(data as Movimentacao[]);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErro(errorObj?.message || 'Erro ao carregar movimentações.');
    } finally {
      setCarregando(false);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarMovimentacoes();
  }, [carregarMovimentacoes]);

  const termo = filtroBusca.toLowerCase().trim();

  const movimentacoesFiltradas = movimentacoes.filter((m) => {
    const nomeProduto = produtoDe(m)?.nome ?? '';
    const obs = m.observacao ?? '';

    const bateBusca =
      !termo ||
      nomeProduto.toLowerCase().includes(termo) ||
      obs.toLowerCase().includes(termo);

    const bateTipo =
      filtroTipo === 'TODOS' ||
      (filtroTipo === 'CONSUMO' ? ehConsumo(m) : m.tipo === filtroTipo);

    return bateBusca && bateTipo;
  });

  // Total de tabaco granel consumido na produção (no filtro atual, em gramas)
  const tabacoConsumidoG = movimentacoesFiltradas
    .filter((m) => ehConsumo(m) && unidadeDe(produtoDe(m)?.nome ?? '') === 'g')
    .reduce((soma, m) => soma + Number(m.quantidade || 0), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Movimentações de Stock</h1>
            <p className="text-sm text-slate-400">Registo de entradas, saídas, vendas, consumo de produção e ajustes - OrC Brasil</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/movimentar"
              className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
            >
              + Novo Lançamento
            </Link>
            <Link
              href="/produtos"
              className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Gestão de Produtos
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md flex flex-col sm:flex-row justify-between gap-3">
          <input
            type="text"
            placeholder="Pesquisar por produto ou observação..."
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            className="p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none w-full sm:w-80"
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
              className="p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none w-full sm:w-auto"
            >
              <option value="TODOS">Todos os Tipos</option>
              <option value="ENTRADA">ENTRADA</option>
              <option value="SAIDA">SAÍDA</option>
              <option value="VENDA">VENDA</option>
              <option value="AJUSTE">AJUSTE</option>
              <option value="CONSUMO">CONSUMO DE PRODUÇÃO</option>
            </select>
          </div>
        </div>

        {/* Resumo do consumo de tabaco */}
        {tabacoConsumidoG > 0 && (
          <div className="bg-violet-950/40 p-4 rounded-xl border border-violet-800 text-sm text-violet-200">
            Tabaco granel consumido na produção (filtro atual):{' '}
            <strong>{tabacoConsumidoG.toLocaleString('pt-BR')} g</strong>{' '}
            ({(tabacoConsumidoG / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg)
          </div>
        )}

        {/* Erro se houver */}
        {erro && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-lg text-sm">
            {erro}
          </div>
        )}

        {/* Tabela */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
            Registo de Movimentos ({movimentacoesFiltradas.length} itens)
          </h2>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              A carregar histórico...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Item / Produto</th>
                    <th className="p-3.5 text-center">Tipo</th>
                    <th className="p-3.5 text-center">Quantidade</th>
                    <th className="p-3.5">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {movimentacoesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-6 text-slate-500">
                        Nenhuma movimentação registada.
                      </td>
                    </tr>
                  ) : (
                    movimentacoesFiltradas.map((m) => {
                      const nomeProduto = produtoDe(m)?.nome || 'Produto Desconhecido';
                      const unidade = unidadeDe(nomeProduto);
                      const consumo = ehConsumo(m);

                      const badgeTipo = consumo
                        ? 'bg-violet-950/60 border-violet-800 text-violet-300'
                        : m.tipo === 'ENTRADA'
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                          : m.tipo === 'VENDA'
                            ? 'bg-blue-950/60 border-blue-800 text-blue-400'
                            : m.tipo === 'AJUSTE'
                              ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                              : 'bg-rose-950/60 border-rose-800 text-rose-400';

                      const rotuloTipo = consumo ? 'CONSUMO' : m.tipo;
                      const sinal = m.tipo === 'ENTRADA' ? '+' : '-';

                      return (
                        <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-slate-300 whitespace-nowrap">
                            {formatarData(m.created_at)}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-100">{nomeProduto}</td>
                          <td className="p-3.5 text-center">
                            <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${badgeTipo}`}>
                              {rotuloTipo}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-bold text-white whitespace-nowrap">
                            {sinal}
                            {Number(m.quantidade).toLocaleString('pt-BR')} {unidade}
                          </td>
                          <td className="p-3.5 text-slate-400 text-xs">
                            {m.observacao || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}