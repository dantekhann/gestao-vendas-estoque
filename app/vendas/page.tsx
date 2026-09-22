'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Venda {
  id: string;
  data_venda?: string;
  cliente_nome: string;
  forma_pagamento: string;
  valor_total: number;
  observacao?: string;
}

interface Cliente {
  id: string;
  nome: string;
}

export default function HistoricoVendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Estados dos Filtros
  const [filtroCliente, setFiltroCliente] = useState<string>('');
  const [filtroPagamento, setFiltroPagamento] = useState<string>('');

  useEffect(() => {
    let ativo = true;

    async function carregarDados() {
      try {
        setCarregando(true);
        setErro(null);

        // 1. Busca as vendas
        const { data: dataVendas, error: errorVendas } = await supabase
          .from('vendas')
          .select('id, cliente_nome, forma_pagamento, valor_total, observacao')
          .order('id', { ascending: false });

        if (errorVendas) throw errorVendas;

        // 2. Busca a lista de clientes para o dropdown de filtro
        const { data: dataClientes, error: errorClientes } = await supabase
          .from('clientes')
          .select('id, nome')
          .order('nome', { ascending: true });

        if (errorClientes) {
          console.warn('Aviso ao carregar clientes para o filtro:', errorClientes);
        }

        if (ativo) {
          if (dataVendas) setVendas(dataVendas);
          if (dataClientes) setClientes(dataClientes);
        }
      } catch (err: any) {
        if (ativo) {
          const mensagem = err?.message || 'Erro ao carregar dados.';
          setErro(mensagem);
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarDados();

    return () => {
      ativo = false;
    };
  }, []);

  // Formatação segura de data caso exista data_venda
  const formatarData = (venda: Venda) => {
    if (!venda.data_venda) return '—';
    return new Date(venda.data_venda).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Função para apagar venda no Supabase
  const handleExcluirVenda = async (id: string) => {
    const confirmacao = window.confirm('Tem certeza de que deseja excluir este registro de venda?');
    if (!confirmacao) return;

    try {
      setExcluindoId(id);

      // Apaga os itens vinculados primeiro na tabela de itens
      await supabase.from('itens_venda').delete().eq('venda_id', id);

      const { error } = await supabase
        .from('vendas')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Atualiza a lista na tela
      setVendas((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(`Erro ao excluir venda: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // Lógica dos filtros em tempo real
  const vendasFiltradas = vendas.filter((venda) => {
    const nomeClienteAtual = (venda.cliente_nome || 'Cliente Avulso').trim().toLowerCase();
    
    const bateCliente =
      filtroCliente === '' ||
      (filtroCliente === 'Cliente Avulso' && (!venda.cliente_nome || venda.cliente_nome === 'Cliente Avulso')) ||
      nomeClienteAtual === filtroCliente.toLowerCase().trim();

    const batePagamento = filtroPagamento === '' || venda.forma_pagamento === filtroPagamento;

    return bateCliente && batePagamento;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Histórico de Vendas</h1>
            <p className="text-sm text-slate-400">Consulta de pedidos lançados - OrC Brasil</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              ← Painel Principal
            </Link>
            <Link
              href="/vendas/nova"
              className="flex-1 sm:flex-none text-center px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-sm"
            >
              + Nova Venda
            </Link>
          </div>
        </div>

        {/* Painel com Filtros e Tabela */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <h2 className="text-lg font-semibold text-slate-200">
              Pedidos Cadastrados
            </h2>

            {/* Dropdowns de Filtro */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <select
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os Clientes</option>
                <option value="Cliente Avulso">Cliente Avulso</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
              </select>

              <select
                value={filtroPagamento}
                onChange={(e) => setFiltroPagamento(e.target.value)}
                className="p-2 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas as Formas de Pgto</option>
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="BOLETO">Boleto</option>
                <option value="FATURADO">Faturado</option>
              </select>
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
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Cliente</th>
                    <th className="p-3.5">Forma de Pagamento</th>
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
                    vendasFiltradas.map((venda) => (
                      <tr key={venda.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 text-slate-300 text-sm font-medium">
                          {formatarData(venda)}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-100">
                          {venda.cliente_nome || 'Cliente Avulso'}
                        </td>
                        <td className="p-3.5 text-slate-300 text-sm">
                          <span className="px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-xs font-semibold text-slate-300">
                            {venda.forma_pagamento}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400 text-sm">
                          {venda.observacao || '—'}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-400 text-base">
                          R$ {venda.valor_total ? Number(venda.valor_total).toFixed(2) : '0.00'}
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleExcluirVenda(venda.id)}
                            disabled={excluindoId === venda.id}
                            className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 border border-red-800/50 text-red-400 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {excluindoId === venda.id ? '...' : 'Excluir'}
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
    </div>
  );
}