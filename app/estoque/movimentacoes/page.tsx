'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Movimentacao {
  id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  quantidade: number;
  produtos?: {
    nome: string;
  };
  produto_nome?: string;
}

export default function HistoricoMovimentacoesPage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState<string>('');

  useEffect(() => {
    let ativo = true;

    async function carregarMovimentacoes() {
      try {
        setCarregando(true);
        setErro(null);

        // Busca apenas as colunas garantidas da tabela
        const { data, error } = await supabase
          .from('movimentacoes_estoque')
          .select(`
            id,
            tipo,
            quantidade,
            produtos (
              nome
            )
          `)
          .order('id', { ascending: false });

        if (error) {
          throw error;
        }

        if (ativo && data) {
          setMovimentacoes(data);
        }
      } catch (err: any) {
        if (ativo) {
          setErro(err?.message || 'Erro ao carregar histórico de movimentações.');
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarMovimentacoes();

    return () => {
      ativo = false;
    };
  }, []);

  // Filtragem em tempo real
  const movimentacoesFiltradas = movimentacoes.filter((mov) => {
    const nomeProduto = mov.produtos?.nome || mov.produto_nome || '';

    const bateBusca = nomeProduto.toLowerCase().includes(filtroBusca.toLowerCase().trim());
    const bateTipo = filtroTipo === '' || mov.tipo === filtroTipo;

    return bateBusca && bateTipo;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Movimentações</h1>
            <p className="text-sm text-slate-400">Auditoria de Entradas e Saídas de Estoque - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
          </div>
        </div>

        {/* Painel com Filtros e Tabela */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              Registros de Estoque
            </h2>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <input
                type="text"
                placeholder="Buscar por produto..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os Tipos</option>
                <option value="ENTRADA">Entrada</option>
                <option value="SAIDA">Saída</option>
              </select>
            </div>
          </div>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              Carregando movimentações...
            </div>
          ) : erro ? (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-center text-sm">
              {erro}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Cód. Registro</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5 text-center">Quantidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {movimentacoesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8 text-slate-500 font-medium">
                        Nenhuma movimentação de estoque encontrada.
                      </td>
                    </tr>
                  ) : (
                    movimentacoesFiltradas.map((mov) => {
                      const isEntrada = mov.tipo === 'ENTRADA';
                      return (
                        <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-mono text-xs text-slate-400">
                            #{String(mov.id).slice(0, 8)}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                                isEntrada
                                  ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                                  : 'bg-red-950/60 border-red-800/60 text-red-400'
                              }`}
                            >
                              {mov.tipo}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold text-slate-100">
                            {mov.produtos?.nome || mov.produto_nome || 'Produto não especificado'}
                          </td>
                          <td
                            className={`p-3.5 text-center font-bold text-base ${
                              isEntrada ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {isEntrada ? `+${mov.quantidade}` : `-${mov.quantidade}`}
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