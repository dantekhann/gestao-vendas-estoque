'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatarData } from '@/lib/formatters';

interface Produto {
  id: string;
  nome: string;
  preco_venda?: number;
  estoque_atual: number;
}

interface Movimentacao {
  id: string;
  produto_id: string;
  tipo: string;
  quantidade: number;
  observacao?: string;
  created_at: string;
  produtos?: Produto | Produto[] | null;
}

export default function MovimentacoesPage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
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
      if (data) {
        setMovimentacoes(data as Movimentacao[]);
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setErro(errorObj?.message || 'Erro ao carregar movimentações.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarMovimentacoes();
  }, [carregarMovimentacoes]);

  const movimentacoesFiltradas = movimentacoes.filter((m) => {
    const nomeProduto = Array.isArray(m.produtos)
      ? m.produtos[0]?.nome
      : m.produtos?.nome || '';

    const bateBusca = nomeProduto.toLowerCase().includes(filtroBusca.toLowerCase().trim()) ||
                      (m.observacao && m.observacao.toLowerCase().includes(filtroBusca.toLowerCase().trim()));

    const bateTipo = filtroTipo === 'TODOS' || m.tipo === filtroTipo;

    return bateBusca && bateTipo;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Movimentações de Stock</h1>
            <p className="text-sm text-slate-400">Registo de entradas, saídas, vendas e ajustes - OrC Brasil</p>
          </div>
          <div className="flex gap-2">
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
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none w-full sm:w-auto"
            >
              <option value="TODOS">Todos os Tipos</option>
              <option value="ENTRADA">ENTRADA</option>
              <option value="SAIDA">SAÍDA</option>
              <option value="VENDA">VENDA</option>
              <option value="AJUSTE">AJUSTE</option>
            </select>
          </div>
        </div>

        {/* Erro se houver */}
        {erro && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-lg text-sm">
            {erro}
          </div>
        )}

        {/* Tabela de Movimentações */}
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
                      const prodObj = Array.isArray(m.produtos) ? m.produtos[0] : m.produtos;
                      const nomeProduto = prodObj?.nome || 'Produto Desconhecido';

                      const badgeTipo =
                        m.tipo === 'ENTRADA'
                          ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                          : m.tipo === 'VENDA'
                          ? 'bg-blue-950/60 border-blue-800 text-blue-400'
                          : m.tipo === 'AJUSTE'
                          ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                          : 'bg-rose-950/60 border-rose-800 text-rose-400';

                      return (
                        <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-slate-300 whitespace-nowrap">
                            {formatarData(m.created_at)}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-100">{nomeProduto}</td>
                          <td className="p-3.5 text-center">
                            <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${badgeTipo}`}>
                              {m.tipo}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-bold text-white">
                            {m.tipo === 'ENTRADA' ? `+${m.quantidade}` : `-${m.quantidade}`} un
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