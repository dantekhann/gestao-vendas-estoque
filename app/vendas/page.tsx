'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Venda {
  id: string;
  cliente?: string;
  forma_pagamento?: string;
  valor_total: number;
  observacao?: string;
  created_at?: string;
}

export default function HistoricoVendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  // Estados de Filtro
  const [filtroBusca, setFiltroBusca] = useState<string>('');
  const [filtroCliente, setFiltroCliente] = useState<string>('');
  const [filtroFormaPgto, setFiltroFormaPgto] = useState<string>('');
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('');
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');

  // Estados do Popup (Modal) de Edição
  const [modalAberto, setModalAberto] = useState<boolean>(false);
  const [vendaEditando, setVendaEditando] = useState<Venda | null>(null);
  const [editCliente, setEditCliente] = useState<string>('');
  const [editFormaPgto, setEditFormaPgto] = useState<string>('');
  const [editValorTotal, setEditValorTotal] = useState<number>(0);
  const [editObservacao, setEditObservacao] = useState<string>('');
  const [editData, setEditData] = useState<string>('');
  const [salvando, setSalvando] = useState<boolean>(false);

  async function carregarVendas() {
    try {
      setCarregando(true);
      setErro(null);

      const { data, error } = await supabase
        .from('vendas')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      if (data) setVendas(data);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao carregar histórico de vendas.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarVendas();
  }, []);

  const abrirModalEdicao = (venda: Venda) => {
    setVendaEditando(venda);
    setEditCliente(venda.cliente || '');
    setEditFormaPgto(venda.forma_pagamento || 'PIX');
    setEditValorTotal(venda.valor_total || 0);
    setEditObservacao(venda.observacao || '');
    
    if (venda.created_at) {
      setEditData(venda.created_at.split('T')[0]);
    } else {
      setEditData('');
    }

    setModalAberto(true);
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendaEditando) return;

    try {
      setSalvando(true);

      const dadosAtualizados: any = {
        cliente: editCliente,
        forma_pagamento: editFormaPgto,
        valor_total: Number(editValorTotal),
        observacao: editObservacao,
      };

      if (editData) {
        const horaOriginal = vendaEditando.created_at ? vendaEditando.created_at.split('T')[1] || '00:00:00.000Z' : '00:00:00.000Z';
        dadosAtualizados.created_at = `${editData}T${horaOriginal}`;
      }

      const { error } = await supabase
        .from('vendas')
        .update(dadosAtualizados)
        .eq('id', vendaEditando.id);

      if (error) throw error;

      setVendas((prev) =>
        prev.map((v) =>
          v.id === vendaEditando.id
            ? { ...v, ...dadosAtualizados }
            : v
        )
      );

      setModalAberto(false);
      setVendaEditando(null);
      alert('Venda atualizada com sucesso!');
    } catch (err: any) {
      console.error('Erro ao atualizar venda:', err);
      alert(`Erro ao atualizar: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id: string) => {
    if (!window.confirm('Tens a certeza que pretendes excluir esta venda?')) return;

    try {
      const { error } = await supabase.from('vendas').delete().eq('id', id);
      if (error) throw error;

      setVendas((prev) => prev.filter((v) => v.id !== id));
    } catch (err: any) {
      alert(`Erro ao excluir venda: ${err.message}`);
    }
  };

  const formatarData = (created_at?: string) => {
    if (!created_at) return '—';
    try {
      const dataStr = created_at.split('T')[0];
      const [ano, mes, dia] = dataStr.split('-');
      if (!ano || !mes || !dia) return '—';
      return `${dia}/${mes}/${ano}`;
    } catch {
      return '—';
    }
  };

  const vendasFiltradas = vendas.filter((v) => {
    const cliente = (v.cliente || '').toLowerCase();
    const obs = (v.observacao || '').toLowerCase();
    const termo = filtroBusca.toLowerCase().trim();

    const bateBusca = cliente.includes(termo) || obs.includes(termo);
    const bateCliente = filtroCliente === '' || v.cliente === filtroCliente;
    const bateFormaPgto = filtroFormaPgto === '' || v.forma_pagamento === filtroFormaPgto;

    let dataIso = '';
    if (v.created_at) {
      dataIso = v.created_at.split('T')[0];
    }
    const bateDataInicio = !filtroDataInicio || (dataIso && dataIso >= filtroDataInicio);
    const bateDataFim = !filtroDataFim || (dataIso && dataIso <= filtroDataFim);

    return bateBusca && bateCliente && bateFormaPgto && bateDataInicio && bateDataFim;
  });

  const clientesUnicos = Array.from(new Set(vendas.map((v) => v.cliente).filter(Boolean)));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Vendas</h1>
            <p className="text-sm text-slate-400">Consulta de pedidos lançados - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* ATENÇÃO: Verifique se o seu ficheiro de lançamento está em app/vendas/lancar/page.tsx ou app/vendas/nova/page.tsx */}
            <Link
              href="/vendas/lancar"
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

        {/* Filtros e Tabela */}
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
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Cliente</label>
                <select
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Todos os Clientes</option>
                  {clientesUnicos.map((cli) => (
                    <option key={cli} value={cli}>{cli}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Forma de Pagamento</label>
                <select
                  value={filtroFormaPgto}
                  onChange={(e) => setFiltroFormaPgto(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Todas as Formas</option>
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data Início</label>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={(e) => setFiltroDataInicio(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data Fim</label>
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={(e) => setFiltroDataFim(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
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
                    <th className="p-3.5">Valor Total</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {vendasFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500 font-medium">
                        Nenhuma venda encontrada.
                      </td>
                    </tr>
                  ) : (
                    vendasFiltradas.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 text-sm font-medium text-slate-300 whitespace-nowrap">
                          {formatarData(v.created_at)}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-100">
                          {v.cliente || 'Cliente Avulso'}
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-1 bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-bold">
                            {v.forma_pagamento || 'PIX'}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400 text-sm">
                          {v.observacao || '—'}
                        </td>
                        <td className="p-3.5 font-bold text-emerald-400">
                          R$ {Number(v.valor_total || 0).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => abrirModalEdicao(v)}
                            className="px-2.5 py-1.5 bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 hover:text-blue-300 border border-blue-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleExcluir(v.id)}
                            className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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

      {/* POPUP / MODAL DE EDIÇÃO */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">Editar Venda</h2>
              <button
                onClick={() => setModalAberto(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSalvarEdicao} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={editCliente}
                    onChange={(e) => setEditCliente(e.target.value)}
                    className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Data da Venda
                  </label>
                  <input
                    type="date"
                    value={editData}
                    onChange={(e) => setEditData(e.target.value)}
                    className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={editFormaPgto}
                    onChange={(e) => setEditFormaPgto(e.target.value)}
                    className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PIX">PIX</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="CARTAO">Cartão</option>
                    <option value="BOLETO">Boleto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Valor Total (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editValorTotal}
                    onChange={(e) => setEditValorTotal(Number(e.target.value))}
                    className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Observação
                </label>
                <textarea
                  rows={3}
                  value={editObservacao}
                  onChange={(e) => setEditObservacao(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-xl bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="px-4 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="px-5 py-2.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-lg shadow-blue-950 disabled:opacity-50 cursor-pointer"
                >
                  {salvando ? 'A salvar...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}