'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ItemVenda {
  id: string;
  produto_id?: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  produtos?: {
    nome: string;
  } | {
    nome: string;
  }[] | null;
}

interface Venda {
  id: string;
  cliente_nome: string;
  forma_pagamento: string;
  valor_total: number;
  observacao?: string;
  itens_venda?: ItemVenda[];
}

export default function HistoricoVendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Estados de Filtros
  const [filtroCliente, setFiltroCliente] = useState<string>('');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [filtroBusca, setFiltroBusca] = useState<string>('');

  async function carregarVendas() {
    try {
      setCarregando(true);
      setErro(null);

      // Buscamos e ordenamos pelas mais recentes utilizando a data extraída ou ID decrescente
      const { data, error } = await supabase
        .from('vendas')
        .select(`
          id,
          cliente_nome,
          forma_pagamento,
          valor_total,
          observacao,
          itens_venda (
            id,
            quantidade,
            preco_unitario,
            subtotal,
            produtos (
              nome
            )
          )
        `)
        .order('id', { ascending: false });

      if (error) throw error;

      if (data) {
        // Ordenação extra no front-end baseada na data extraída do campo [Data: YYYY-MM-DD] 
        // para garantir perfeição cronológica mesmo que os IDs variem
        const vendasOrdenadas = data.sort((a, b) => {
          const getData = (obs?: string) => {
            if (!obs) return '0000-00-00';
            const match = obs.match(/\[Data:\s*([\d-]+)\]/);
            return match ? match[1] : '0000-00-00';
          };
          return getData(b.observacao).localeCompare(getData(a.observacao));
        });

        setVendas(vendasOrdenadas);
      }
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar histórico de vendas.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarVendas();
  }, []);

  const handleExcluirVenda = async (venda: Venda) => {
    const confirmar = window.confirm(
      `Tem certeza que pretende excluir a venda #${venda.id.slice(0, 8)} (${venda.cliente_nome})? O estoque dos itens será devolvido automaticamente.`
    );

    if (!confirmar) return;

    try {
      setExcluindoId(venda.id);

      if (venda.itens_venda && venda.itens_venda.length > 0) {
        for (const item of venda.itens_venda) {
          const prodId = item.produto_id;
          if (prodId) {
            const { data: prodData } = await supabase
              .from('produtos')
              .select('estoque_atual')
              .eq('id', prodId)
              .single();

            if (prodData) {
              const novoEstoque = (prodData.estoque_atual || 0) + item.quantidade;
              await supabase
                .from('produtos')
                .update({ estoque_atual: novoEstoque })
                .eq('id', prodId);
            }
          }
        }
      }

      await supabase
        .from('movimentacoes_estoque')
        .delete()
        .ilike('observacao', `%Venda #${venda.id.slice(0, 8)}%`);

      await supabase
        .from('itens_venda')
        .delete()
        .eq('venda_id', venda.id);

      const { error: deleteErr } = await supabase
        .from('vendas')
        .delete()
        .eq('id', venda.id);

      if (deleteErr) throw deleteErr;

      setVendas((prev) => prev.filter((v) => v.id !== venda.id));
      alert('Venda excluída e estoque revertido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir venda:', err);
      alert(`Erro ao excluir: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setExcluindoId(null);
    }
  };

  const formatarLinhaVenda = (venda: Venda) => {
    let dataIso = '';
    let dataStr = '—';
    let obsLimpa = venda.observacao || '—';

    if (venda.observacao) {
      const match = venda.observacao.match(/\[Data:\s*([\d-]+)\]/);
      if (match) {
        dataIso = match[1];
        const [ano, mes, dia] = dataIso.split('-');
        dataStr = `${dia}/${mes}/${ano}`;
        obsLimpa = venda.observacao.replace(/\[Data:\s*[\d-]+\]/, '').trim();
      }
    }

    return { dataIso, dataStr, obsLimpa: obsLimpa || '—' };
  };

  const vendasFiltradas = vendas.filter((venda) => {
    const cliente = venda.cliente_nome || '';
    const obs = venda.observacao || '';
    const { dataIso } = formatarLinhaVenda(venda);

    const bateBusca = 
      cliente.toLowerCase().includes(filtroBusca.toLowerCase().trim()) ||
      obs.toLowerCase().includes(filtroBusca.toLowerCase().trim());

    const bateCliente = filtroCliente === '' || cliente === filtroCliente;
    const batePagamento = filtroPagamento === '' || venda.forma_pagamento === filtroPagamento;
    const bateDataInicio = !filtroDataInicio || (dataIso && dataIso >= filtroDataInicio);
    const bateDataFim = !filtroDataFim || (dataIso && dataIso <= filtroDataFim);

    return bateBusca && bateCliente && batePagamento && bateDataInicio && bateDataFim;
  });

  const listaClientesUnicos = Array.from(new Set(vendas.map((v) => v.cliente_nome))).sort();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Vendas</h1>
            <p className="text-sm text-slate-400">Consulta de pedidos lançados - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/vendas/nova"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm"
            >
              + Nova Venda
            </Link>
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-5">
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5">
            <h2 className="text-lg font-semibold text-slate-200">Filtros de Pesquisa</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Buscar (Cliente/Obs)</label>
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cliente</label>
                <select
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os Clientes</option>
                  {listaClientesUnicos.map((cli) => (
                    <option key={cli} value={cli}>{cli}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Forma de Pagamento</label>
                <select
                  value={filtroPagamento}
                  onChange={(e) => setFiltroPagamento(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas as Formas</option>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="FATURADO">Faturado</option>
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

            {(filtroBusca || filtroCliente || filtroPagamento || filtroDataInicio || filtroDataFim) && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setFiltroBusca('');
                    setFiltroCliente('');
                    setFiltroPagamento('');
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
              Carregando histórico de vendas...
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
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Forma Pgto</th>
                    <th className="p-3.5">Observação</th>
                    <th className="p-3.5 text-right">Valor Total</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {vendasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 font-medium">
                        Nenhuma venda encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    vendasFiltradas.map((venda) => {
                      const { dataStr, obsLimpa } = formatarLinhaVenda(venda);
                      const estaExcluindo = excluindoId === venda.id;

                      return (
                        <tr key={venda.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 text-sm font-medium text-slate-300 whitespace-nowrap">
                            {dataStr}
                          </td>
                          <td className="p-3.5 font-semibold text-slate-100">
                            {venda.cliente_nome}
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded border text-xs font-semibold bg-blue-950/60 border-blue-800/60 text-blue-400">
                              {venda.forma_pagamento}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-400 text-sm">
                            {obsLimpa}
                          </td>
                          <td className="p-3.5 text-right font-bold text-emerald-400">
                            R$ {Number(venda.valor_total || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleExcluirVenda(venda)}
                              disabled={estaExcluindo}
                              title="Excluir venda"
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