'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  estoque_atual: number;
}

interface Movimentacao {
  id: string;
  produto_id?: string;
  tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE';
  quantidade: number;
  observacao?: string;
  created_at?: string;
  produtos?: Produto & {
    nome: string;
  };
  produto_nome?: string;
}

export default function HistoricoMovimentacoesPage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Estados de Filtro
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

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
          created_at,
          produtos (
            id,
            nome,
            estoque_atual
          )
        `)
        .order('id', { ascending: false });

      if (error) throw error;
      if (data) setMovimentacoes(data);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar histórico.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarMovimentacoes();
  }, []);

  // Função para excluir um lançamento e ajustar o estoque de volta
  const handleExcluir = async (mov: Movimentacao) => {
    const confirmar = window.confirm(
      `Tem certeza que pretendes excluir esta movimentação de ${mov.tipo} (${mov.quantidade} un)? O estoque do produto será recalculado.`
    );

    if (!confirmar) return;

    try {
      setExcluindoId(mov.id);

      // 1. Se o produto existir e tivermos o ID, ajustamos o estoque de forma reversa
      const produtoId = mov.produto_id || (mov.produtos as any)?.id;
      if (produtoId) {
        // Busca o estoque atualizado do produto no banco para evitar conflito
        const { data: prodData, error: prodErr } = await supabase
          .from('produtos')
          .select('estoque_atual')
          .eq('id', produtoId)
          .single();

        if (!prodErr && prodData) {
          let estoqueAtual = prodData.estoque_atual || 0;

          // Reversão matemática da operação excluída
          if (mov.tipo === 'ENTRADA') {
            estoqueAtual -= mov.quantidade; // Remove o que tinha entrado
          } else if (mov.tipo === 'SAIDA') {
            estoqueAtual += mov.quantidade; // Devolve o que tinha saído
          }
          // Nota: 'AJUSTE' manual puro é mais complexo de reverter sem o histórico anterior, 
          // por isso focamos em abater/devolver a quantidade movimentada se necessário.

          await supabase
            .from('produtos')
            .update({ estoque_atual: estoqueAtual })
            .eq('id', produtoId);
        }
      }

      // 2. Apaga o registo da tabela movimentacoes_estoque
      const { error: deleteError } = await supabase
        .from('movimentacoes_estoque')
        .delete()
        .eq('id', mov.id);

      if (deleteError) throw deleteError;

      // Atualiza a lista localmente
      setMovimentacoes((prev) => prev.filter((item) => item.id !== mov.id));
      alert('Movimentação excluída e estoque atualizado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      alert(`Erro ao excluir: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // Extrai a data limpa e a observação
  const formatarLinha = (mov: Movimentacao) => {
    let dataIso = '';
    let dataStr = '—';
    let obsLimpa = mov.observacao || '—';

    if (mov.observacao) {
      const match = mov.observacao.match(/\[Data:\s*([\d-]+)\]/);
      if (match) {
        dataIso = match[1]; // YYYY-MM-DD
        const [ano, mes, dia] = dataIso.split('-');
        dataStr = `${dia}/${mes}/${ano}`;
        obsLimpa = mov.observacao.replace(/\[Data:\s*[\d-]+\]/, '').trim();
      }
    }

    if (!dataIso && mov.created_at) {
      dataIso = mov.created_at.split('T')[0];
      const [ano, mes, dia] = dataIso.split('-');
      dataStr = `${dia}/${mes}/${ano}`;
    }

    return { dataIso, dataStr, obsLimpa: obsLimpa || '—' };
  };

  // Filtragem avançada
  const movimentacoesFiltradas = movimentacoes.filter((mov) => {
    const nomeProduto = mov.produtos?.nome || mov.produto_nome || '';
    const obsMov = mov.observacao || '';
    const { dataIso } = formatarLinha(mov);

    const bateBusca = 
      nomeProduto.toLowerCase().includes(filtroBusca.toLowerCase().trim()) ||
      obsMov.toLowerCase().includes(filtroBusca.toLowerCase().trim());

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
            <p className="text-sm text-slate-400">Auditoria de Entradas e Saídas de Estoque - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/estoque/movimentar"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
            >
              + Lançar Movimentação
            </Link>
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
          </div>
        </div>

        {/* Painel com Filtros e Tabela */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-5">
          
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5">
            <h2 className="text-lg font-semibold text-slate-200">Filtros de Pesquisa</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Produto / Observação</label>
                <input
                  type="text"
                  placeholder="Ex: Água, Tabaco..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tipo de Operação</label>
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
                    <th className="p-3.5">Data</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Produto</th>
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
                      const isEntrada = mov.tipo === 'ENTRADA';
                      const isAjuste = mov.tipo === 'AJUSTE';
                      const { dataStr, obsLimpa } = formatarLinha(mov);
                      const estaExcluindo = excluindoId === mov.id;

                      return (
                        <tr key={mov.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-sm font-medium text-slate-300 whitespace-nowrap">
                            {dataStr}
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                                isEntrada
                                  ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                                  : isAjuste
                                  ? 'bg-amber-950/60 border-amber-800/60 text-amber-400'
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
                              isEntrada ? 'text-emerald-400' : isAjuste ? 'text-amber-400' : 'text-red-400'
                            }`}
                          >
                            {isEntrada ? `+${mov.quantidade}` : isAjuste ? `= ${mov.quantidade}` : `-${mov.quantidade}`}
                          </td>
                          <td className="p-3.5 text-slate-400 text-sm">
                            {obsLimpa}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleExcluir(mov)}
                              disabled={estaExcluindo}
                              title="Excluir lançamento"
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