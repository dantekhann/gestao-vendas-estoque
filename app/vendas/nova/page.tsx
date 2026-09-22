'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface Produto {
  id: string;
  sku: string;
  nome: string;
  preco_venda: number;
  estoque_atual: number;
  tipo: string;
}

interface ItemCarrinho {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export default function NovaVendaPage() {
  const router = useRouter();

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);

  // Estados de Carregamento
  const [carregandoProdutos, setCarregandoProdutos] = useState<boolean>(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  // Dados da Venda
  const [clienteNome, setClienteNome] = useState<string>('Cliente Avulso');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [desconto, setDesconto] = useState<number>(0);
  const [observacao, setObservacao] = useState<string>('');
  const [carregandoVenda, setCarregandoVenda] = useState<boolean>(false);

  // Carrega produtos ordenados pelo maior estoque e filtra RIGOROSAMENTE PRODUTO_FINAL
  useEffect(() => {
    let montado = true;

    async function carregarProdutos() {
      try {
        setCarregandoProdutos(true);
        setErroCarregamento(null);

        const { data, error } = await supabase
          .from('produtos')
          .select('id, sku, nome, preco_venda, estoque_atual, tipo')
          .order('estoque_atual', { ascending: false });

        if (error) throw error;

        if (montado && data) {
          // Filtro estrito: ignora NULLs e valida PRODUTO_FINAL / PRODUTO FINAL
          const produtosFinais = data.filter((p) => {
            if (!p.tipo) return false;
            const tipoTratado = String(p.tipo).toUpperCase().replace(/_/g, ' ').trim();
            return tipoTratado === 'PRODUTO FINAL';
          });

          setProdutos(produtosFinais);
        }
      } catch (err: any) {
        console.error('Erro ao conectar com Supabase:', err);
        if (montado) {
          setErroCarregamento(err.message || 'Erro ao carregar lista de produtos.');
        }
      } finally {
        if (montado) {
          setCarregandoProdutos(false);
        }
      }
    }

    carregarProdutos();

    return () => {
      montado = false;
    };
  }, []);

  const adicionarAoCarrinho = () => {
    if (!produtoSelecionadoId) {
      alert('Selecione um produto.');
      return;
    }

    const produto = produtos.find((p) => p.id === produtoSelecionadoId);
    if (!produto) return;

    if (quantidade <= 0) {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    if (quantidade > produto.estoque_atual) {
      alert(`Quantidade desejada maior que o estoque atual (${produto.estoque_atual} un).`);
      return;
    }

    const itemExistente = carrinho.find((item) => item.produto_id === produto.id);

    if (itemExistente) {
      const novaQtd = itemExistente.quantidade + quantidade;
      if (novaQtd > produto.estoque_atual) {
        alert(`Quantidade total no carrinho ultrapassa o estoque disponível (${produto.estoque_atual} un).`);
        return;
      }

      setCarrinho(
        carrinho.map((item) =>
          item.produto_id === produto.id
            ? {
                ...item,
                quantidade: novaQtd,
                subtotal: novaQtd * item.preco_unitario,
              }
            : item
        )
      );
    } else {
      setCarrinho([
        ...carrinho,
        {
          produto_id: produto.id,
          nome: produto.nome,
          quantidade: quantidade,
          preco_unitario: produto.preco_venda,
          subtotal: quantidade * produto.preco_venda,
        },
      ]);
    }

    setProdutoSelecionadoId('');
    setQuantidade(1);
  };

  const removerDoCarrinho = (produto_id: string) => {
    setCarrinho(carrinho.filter((item) => item.produto_id !== produto_id));
  };

  const subtotalGeral = carrinho.reduce((acc, item) => acc + item.subtotal, 0);
  const totalComDesconto = Math.max(0, subtotalGeral - desconto);

  const finalizarVenda = async () => {
    if (carrinho.length === 0) {
      alert('O carrinho está vazio.');
      return;
    }

    setCarregandoVenda(true);

    try {
      const { data: vendaData, error: vendaError } = await supabase
        .from('vendas')
        .insert([
          {
            cliente_nome: clienteNome || 'Cliente Avulso',
            forma_pagamento: formaPagamento,
            valor_total: totalComDesconto,
            observacao: observacao,
          },
        ])
        .select()
        .single();

      if (vendaError) throw vendaError;

      const itensParaInserir = carrinho.map((item) => ({
        venda_id: vendaData.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        subtotal: item.subtotal,
      }));

      const { error: itensError } = await supabase
        .from('itens_venda')
        .insert(itensParaInserir);

      if (itensError) throw itensError;

      const movimentacoes = carrinho.map((item) => ({
        produto_id: item.produto_id,
        tipo: 'SAIDA',
        quantidade: item.quantidade,
        observacao: `Venda #${vendaData.id.slice(0, 8)} - ${clienteNome}`,
      }));

      const { error: movError } = await supabase
        .from('movimentacoes_estoque')
        .insert(movimentacoes);

      if (movError) throw movError;

      alert('Venda realizada com sucesso!');
      router.push('/vendas');
    } catch (error: any) {
      alert(`Erro ao finalizar venda: ${error.message}`);
    } finally {
      setCarregandoVenda(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Nova Venda</h1>
            <p className="text-sm text-slate-400">Módulo Comercial - OrC Brasil</p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            Voltar
          </button>
        </div>

        {/* Painel 1: Seleção de Produtos */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
            1. Seleção de Produtos
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Produto
              </label>
              {carregandoProdutos ? (
                <div className="p-2.5 border border-slate-800 rounded-lg bg-slate-950 text-slate-500 text-sm animate-pulse">
                  Carregando lista de produtos...
                </div>
              ) : erroCarregamento ? (
                <div className="p-2.5 border border-red-500/30 bg-red-950/50 text-red-400 text-sm rounded-lg">
                  {erroCarregamento}
                </div>
              ) : (
                <select
                  value={produtoSelecionadoId}
                  onChange={(e) => setProdutoSelecionadoId(e.target.value)}
                  className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="" className="text-slate-500 bg-slate-900">Selecione um produto...</option>
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id} className="text-slate-100 bg-slate-900 font-medium py-1">
                      {produto.nome} ({produto.estoque_atual} un em estoque)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                min="1"
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={adicionarAoCarrinho}
              disabled={carregandoProdutos}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-lg font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* Painel 2: Tabela do Carrinho */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
          <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
            2. Itens Adicionados
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Produto</th>
                  <th className="p-3.5 text-center">Qtd</th>
                  <th className="p-3.5 text-right">Preço Unit.</th>
                  <th className="p-3.5 text-right">Subtotal</th>
                  <th className="p-3.5 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {carrinho.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-6 text-slate-500 font-medium">
                      Nenhum produto adicionado ao pedido.
                    </td>
                  </tr>
                ) : (
                  carrinho.map((item) => (
                    <tr key={item.produto_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-semibold text-slate-100">{item.nome}</td>
                      <td className="p-3.5 text-center text-slate-200 font-medium">{item.quantidade}</td>
                      <td className="p-3.5 text-right text-slate-300">
                        R$ {item.preco_unitario.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-right font-bold text-white">
                        R$ {item.subtotal.toFixed(2)}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => removerDoCarrinho(item.produto_id)}
                          className="text-red-400 hover:text-red-300 text-sm font-semibold hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Painel 3: Pagamento e Finalização */}
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-6">
          <h2 className="text-lg font-semibold text-slate-200 border-b border-slate-800 pb-2">
            3. Pagamento e Finalização
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Nome do Cliente
              </label>
              <input
                type="text"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: João da Silva"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Forma de Pagamento
              </label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="PIX" className="bg-slate-900">PIX</option>
                <option value="DINHEIRO" className="bg-slate-900">Dinheiro</option>
                <option value="CARTAO_CREDITO" className="bg-slate-900">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO" className="bg-slate-900">Cartão de Débito</option>
                <option value="BOLETO" className="bg-slate-900">Boleto</option>
                <option value="FATURADO" className="bg-slate-900">Faturado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Desconto (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(Number(e.target.value))}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1">
                Observações
              </label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full p-2.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Observações do pedido..."
              />
            </div>
          </div>

          {/* Resumo Financeiro */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1 text-right">
            <div className="text-sm font-medium text-slate-400">
              Subtotal: <span className="font-semibold text-slate-200">R$ {subtotalGeral.toFixed(2)}</span>
            </div>
            {desconto > 0 && (
              <div className="text-sm font-medium text-red-400">
                Desconto: <span>- R$ {desconto.toFixed(2)}</span>
              </div>
            )}
            <div className="text-2xl font-extrabold text-white pt-1">
              Total Final: R$ {totalComDesconto.toFixed(2)}
            </div>
          </div>

          <button
            onClick={finalizarVenda}
            disabled={carregandoVenda || carrinho.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-lg font-bold text-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {carregandoVenda ? 'Finalizando Venda...' : 'Concluir Venda'}
          </button>
        </div>

      </div>
    </div>
  );
}