'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  nome: string;
  estoque_atual: number;
}

interface Movimentacao {
  id: string;
  produto_id?: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE';
  quantidade: number;
  observacao?: string;
  created_at?: string;
  produtos?: Produto | Produto[] | null;
  produto_nome?: string;
}

export default function MovimentacoesEstoquePage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Estados de Filtros
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState<string>('');

  async function carregarMovimentacoes() {
    try {
      setCarregando(true);
      setErro(null);

      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select(`
          id,
          produto_id,
          tipo,
          quantidade,
          observacao,
          produtos (
            id,
            nome,
            estoque_atual
          )
        `)
        .order('id', { ascending: false });

      if (error) throw error;

      if (data) {
        // Ordenação inteligente baseada na data extraída do campo [Data: YYYY-MM-DD] na observação
        const movsOrdenadas = data.sort((a, b) => {
          const getData = (obs?: string) => {
            if (!obs) return '0000-00-00';
            const match = obs.match(/\[Data:\s*([\d-]+)\]/);
            return match ? match[1] : '0000-00-00';
          };
          return getData(b.observacao).localeCompare(getData(a.observacao));
        });

        setMovimentacoes(movsOrdenadas);
      }
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar movimentações de estoque.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarMovimentacoes();
  }, []);

  // Função segura para extrair o nome do produto (seja objeto ou array vindo do Supabase)
  const getNomeProduto = (mov: Movimentacao) => {
    if (Array.isArray(mov.produtos)) {
      return mov.produtos[0]?.nome || mov.produto_nome || 'Produto não especificado';
    }
    if (mov.produtos && typeof mov.produtos === 'object') {
      return mov.produtos.nome || mov.produto_nome || 'Produto não especificado';
    }
    return mov.produto_nome || 'Produto não especificado';
  };

  // Função para excluir movimentação e reverter o estoque
  const handleExcluirMovimentacao = async (mov: Movimentacao) => {
    const nomeProd = getNomeProduto(mov);
    const confirmar = window.confirm(
      `Tens a certeza que pretendes excluir esta movimentação de ${mov.tipo} (${mov.quantidade}x ${nomeProd})? O estoque será revertido.`
    );

    if (!confirmar) return;

    try {
      setExcluindoId(mov.id);

      const produtoId =
        mov.produto_id ||
        (Array.isArray(mov.produtos) ? mov.produtos[0]?.id : (mov.produtos as Produto)?.id);

      if (produtoId) {
        // Busca estoque atual do produto
        const { data: prodData } = await supabase
          .from('produtos')
          .select('estoque_atual')
          .eq('id', produtoId)
          .single();

        if (prodData) {
          let novoEstoque = prodData.estoque_atual || 0;

          // Se a movimentação excluída foi ENTRADA, removemos do estoque
          // Se foi SAIDA, devolvemos ao estoque
          if (mov.tipo === 'ENTRADA') {
            novoEstoque -= mov.quantidade;
          } else if (mov.tipo === 'SAIDA') {
            novoEstoque += mov.quantidade;
          }

          await supabase
            .from('produtos')
            .update({ estoque_atual: Math.max(0, novoEstoque) })
            .eq('id', produtoId);
        }
      }

      // Apaga o registo da movimentação
      const { error: deleteErr } = await supabase
        .from('movimentacoes_estoque')
        .delete()
        .eq('id', mov.id);

      if (deleteErr) throw deleteErr;

      setMovimentacoes((prev) => prev.filter((m) => m.id !== mov.id));
      alert('Movimentação excluída e estoque revertido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir movimentação:', err);
      alert(`Erro ao excluir: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // Formata a linha extraindo a data do padrão [Data: YYYY-MM-DD]
  const formatarLinhaMovimentacao = (mov: Movimentacao) => {
    let dataIso = '';
    let dataStr = '—';
    let obsLimpa = mov.observacao || '—';

    if (mov.observacao) {
      const match = mov.observacao.match(/\[Data:\s*([\d-]+)\]/);
      if (match) {
        dataIso = match[1];
        const [ano, mes, dia] = dataIso.split('-');
        dataStr = `${dia}/${mes}/${ano}`;
        obsLimpa = mov.observacao.replace(/\[Data:\s*[\d-]+\]/, '').trim();
      }
    }

    return { dataIso, dataStr, obsLimpa: obsLimpa || '—' };
  };

  // Filtragem avançada
  const movimentacoesFiltradas = movimentacoes.filter((mov) => {
    const nomeProd = getNomeProduto(mov).toLowerCase();
    const obs = (mov.observacao || '').toLowerCase();
    const { dataIso } = formatarLinhaMovimentacao(mov);

    const bateBusca =
      nomeProd.includes(filtroBusca.toLowerCase().trim()) ||
      obs.includes(filtroBusca.toLowerCase().trim());

    const bateTipo = filtroTipo === '' || mov.tipo === filtroTipo;
    const bateDataInicio = !filtroDataInicio || (dataIso && dataIso >= filtroDataInicio);
    const bateDataFim = !filtroDataFim || (dataIso && dataIso <= filtroDataFim);

    return bateBusca && bateTipo && bateDataInicio && bateDataFim;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Movimentações</h1>
            <p className="text-sm text-slate-400">Auditoria de entradas e saídas de estoque - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
  href="/estoque/movimentar"
  className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
>
  + Ajuste Manual
</Link>
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
          </div>
        </div>

        {/* Filtros e Tabela */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-5">
          
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5">
            <h2 className="text-lg font-semibold text-slate-200">Filtros de Pesquisa</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Buscar (Produto/Obs)</label>
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Movimentação</label>
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os Tipos</option>
                  <option value="ENTRADA">Entrada</option>
                  <option value="SAIDA">Saída</option>
                  <option value="AJUSTE">Ajuste</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data Início</label>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={(e) => setFiltroDataInicio(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data Fim</label>
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={(e) => setFiltroDataFim(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

            </div>

            {(filtroBusca || filtroTipo || filtroDataInicio || filtroDataFim) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFiltroBusca('');
                    setFiltroTipo('');
                    setFiltroDataInicio('');
                    setFiltroDataFim('');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  Limpar Filtros
                </button>
              </div>
            )}
          </div>

          {carregando ? (
            <div className="p-8 text-center text-slate-400 animate-pulse bg-slate-950/50 rounded-lg border border-slate-800">
              Carregando histórico de movimentações...
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
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5 text-center">Quantidade</th>
                    <th className="p-3.5">Observação</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {movimentacoesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 font-medium">
                        Nenhuma movimentação encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    movimentacoesFiltradas.map((mov) => {
                      const { dataStr, obsLimpa } = formatarLinhaMovimentacao(mov);
                      const nomeProduto = getNomeProduto(mov);
                      const estaExcluindo = excluindoId === mov.id;

                      const badgeColor =
                        mov.tipo === 'ENTRADA'
                          ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                          : mov.tipo === 'SAIDA'
                          ? 'bg-red-950/60 border-red-800/60 text-red-400'
                          : 'bg-amber-950/60 border-amber-800/60 text-amber-400';

                      return (
                        <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-sm font-medium text-slate-300 whitespace-nowrap">
                            {dataStr}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-100">
                            {nomeProduto}
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2.5 py-1 rounded border text-xs font-semibold ${badgeColor}`}>
                              {mov.tipo}
                            </span>
                          </td>
                          <td className="p-3.5 text-center font-bold text-white">
                            {mov.quantidade}
                          </td>
                          <td className="p-3.5 text-slate-400 text-sm">
                            {obsLimpa}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleExcluirMovimentacao(mov)}
                              disabled={estaExcluindo}
                              title="Excluir movimentação"
                              className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/50 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {estaExcluindo ? 'A apagar...' : 'Excluir'}
                            </button>
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