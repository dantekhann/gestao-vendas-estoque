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
}

interface ItemCarrinho {
  produto_id: string;
  nome: string;
  sku: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export default function NovaVendaPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoSelId, setProdutoSelId] = useState('');
  const [qtd, setQtd] = useState(1);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [cliente, setCliente] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function carregarProdutos() {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, sku, nome, preco_venda, estoque_atual')
        .order('nome');
      
      if (error) {
        alert(`Erro ao carregar lista de produtos: ${error.message}`);
      } else if (data) {
        setProdutos(data);
      }
    }
    carregarProdutos();
  }, []);

  const adicionarAoCarrinho = () => {
    if (!produtoSelId) {
      alert('Selecione um produto para adicionar ao carrinho.');
      return;
    }

    const prod = produtos.find((p) => p.id === produtoSelId);
    if (!prod) return;

    if (qtd <= 0) {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    if (qtd > prod.estoque_atual) {
      alert(`Stock insuficiente! Apenas ${prod.estoque_atual} unidades disponíveis do produto ${prod.nome}.`);
      return;
    }

    const itemExistente = carrinho.find((i) => i.produto_id === prod.id);

    if (itemExistente) {
      const novaQtd = itemExistente.quantidade + qtd;
      if (novaQtd > prod.estoque_atual) {
        alert(`Stock insuficiente! Apenas ${prod.estoque_atual} unidades disponíveis.`);
        return;
      }
      setCarrinho(
        carrinho.map((i) =>
          i.produto_id === prod.id
            ? { ...i, quantidade: novaQtd, subtotal: novaQtd * i.preco_unitario }
            : i
        )
      );
    } else {
      setCarrinho([
        ...carrinho,
        {
          produto_id: prod.id,
          nome: prod.nome,
          sku: prod.sku,
          quantidade: qtd,
          preco_unitario: Number(prod.preco_venda),
          subtotal: qtd * Number(prod.preco_venda),
        },
      ]);
    }

    setProdutoSelId('');
    setQtd(1);
  };

  const removerDoCarrinho = (index: number) => {
    setCarrinho(carrinho.filter((_, i) => i !== index));
  };

  const valorTotal = carrinho.reduce((acc, item) => acc + item.subtotal, 0);

  const finalizarVenda = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cliente.trim()) {
      alert('Por favor, informe o nome do cliente ou empresa antes de finalizar.');
      return;
    }

    if (carrinho.length === 0) {
      alert('Adicione pelo menos um produto ao carrinho.');
      return;
    }

    setSalvando(true);

    try {
      // 1. Criar Registo da Venda na tabela 'vendas'
      const { data: venda, error: errVenda } = await supabase
        .from('vendas')
        .insert([
          {
            cliente_nome: cliente.trim(),
            forma_pagamento: formaPagamento,
            valor_total: valorTotal,
            observacao: observacao.trim() || null,
          },
        ])
        .select()
        .single();

      if (errVenda) {
        alert(`Erro na tabela VENDAS: ${errVenda.message} (${errVenda.details || errVenda.hint || ''})`);
        setSalvando(false);
        return;
      }

      if (!venda) {
        alert('Erro ao gerar registo de venda no banco de dados.');
        setSalvando(false);
        return;
      }

      // 2. Criar os itens na tabela 'itens_venda'
      const itensParaInserir = carrinho.map((item) => ({
        venda_id: venda.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: Number(item.preco_unitario),
        subtotal: Number(item.subtotal),
      }));

      const { error: errItens } = await supabase.from('itens_venda').insert(itensParaInserir);
      if (errItens) {
        alert(`Erro na tabela ITENS_VENDA: ${errItens.message} (${errItens.details || ''})`);
        setSalvando(false);
        return;
      }

      // 3. Registar as baixas na tabela 'movimentacoes_estoque' (acionando o trigger do Supabase)
      const movimentacoes = carrinho.map((item) => ({
        produto_id: item.produto_id,
        tipo: 'SAIDA',
        quantidade: item.quantidade,
        observacao: `Venda #${venda.id.slice(0, 8)} - ${cliente.trim()}`,
      }));

      const { error: errMov } = await supabase.from('movimentacoes_estoque').insert(movimentacoes);
      if (errMov) {
        alert(`Erro na tabela MOVIMENTACOES: ${errMov.message} (${errMov.details || ''})`);
        setSalvando(false);
        return;
      }

      alert('Venda realizada com sucesso!');
      window.location.href = '/';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      alert(`Erro inesperado ao finalizar venda: ${msg}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Topo / Cabeçalho */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400">Registar Nova Venda</h1>
            <p className="text-xs text-slate-400">Painel de Lançamento de Pedidos</p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.assign('/');
            }}
            className="bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
          >
            ← Voltar ao Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Seleção de Produtos e Carrinho */}
          <div className="lg:col-span-2 space-y-4 bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              1. Selecionar Produtos
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Produto</label>
                <select
                  value={produtoSelId}
                  onChange={(e) => setProdutoSelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione um item...</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.sku}) — R$ {Number(p.preco_venda).toFixed(2)} [Stock: {p.estoque_atual}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Qtd.</label>
                <input
                  type="number"
                  min="1"
                  value={qtd}
                  onChange={(e) => setQtd(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={adicionarAoCarrinho}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-xs transition-colors"
                >
                  + Adicionar
                </button>
              </div>
            </div>

            {/* Lista do Carrinho */}
            <div className="mt-6 border-t border-slate-800 pt-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-3">Itens no Pedido</h3>
              {carrinho.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Nenhum item adicionado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {carrinho.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-200">{item.nome}</p>
                        <p className="text-slate-500 font-mono">
                          {item.quantidade}x R$ {item.preco_unitario.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-emerald-400 font-bold">
                          R$ {item.subtotal.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removerDoCarrinho(idx)}
                          className="text-red-400 hover:text-red-300 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Dados do Pedido e Pagamento */}
          <form onSubmit={finalizarVenda} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              2. Dados do Pedido
            </h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Nome do Cliente / Empresa <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Distribuidora Silva, Tabacaria Central..."
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Forma de Pagamento</label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="PIX">Pix</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="BOLETO">Boleto Bancário</option>
                <option value="FATURADO">Faturado / A Prazo</option>
                <option value="DINHEIRO">Dinheiro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Observações</label>
              <textarea
                rows={2}
                placeholder="Observações do pedido ou prazo de entrega..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="border-t border-slate-800 pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Total a Pagar:</span>
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  R$ {valorTotal.toFixed(2)}
                </span>
              </div>

              <button
                type="submit"
                disabled={salvando || carrinho.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {salvando ? 'A processar...' : '✓ Finalizar Venda'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}