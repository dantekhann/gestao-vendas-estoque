'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Produto {
  id: string;
  nome: string;
  preco_venda: number;
  estoque_atual: number;
}

interface ItemVenda {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

const LISTA_CLIENTES = [
  "Cliente Avulso",
  "4eVINTE Head Shop (DF)",
  "Abreu Distribuidora (RJ)",
  "Adoro Mato (RJ)",
  "Aladdin Brasília (DF)",
  "Aladdin Goias (GYN)",
  "Atacadao do Tabaco (DF)",
  "B&M Distribuição (DF)",
  "Barboza e Mazon Comercio de Tabacaria (Palmas - TO)",
  "Best Price (DF)",
  "Blend Distribuidora (DF)",
  "Cajuru Tabacaria (SP)",
  "Conveniencia - 309 Sul (DF)",
  "DeBoa Tabacaria (RJ)",
  "Dirijo Tabacaria (DF)",
  "Distribuidora Coringa (GO)",
  "DISTRIBUIDORA E PETISCARIA 215 NORTE (DF)",
  "Distribuidora One - RJ",
  "Dollar Bills (Itabuna - Bahia)",
  "Dom Bosco Pizzaria (DF)",
  "Dos Crias Tabacaria (ES)",
  "Emporio Iguacu (DF)",
  "Emporio Zingaro (DF)",
  "Empório Zingaro de Alimentos LTDA EPP",
  "ESTACAO MEIA UM",
  "FK TABACARIA (DF)",
  "Fumazila (BH)",
  "GS TABACARIA (DF)",
  "Havana Tabacaria (DF)",
  "Headzup Tabacaria (DF)",
  "Hikari Distribuidora (RJ)",
  "Hood Tabacaria (DF)",
  "Hookah Lounge (DF)",
  "Ice O Lattor HeadShop (GO)",
  "Isso é um Cachimbo (BA)",
  "JA Distribuidora",
  "Jimmy Distribuidor (DF)",
  "JV Alves Conveniência (DF)",
  "L&L Distribuidora",
  "LB Tabacaria (MA)",
  "LR Distribuição (DF)",
  "LUNATIC TABACARIA",
  "Mandala Hookah (DF)",
  "Manga Rosa (SP)",
  "Maria Fumaca Distribuidor (DF)",
  "Mercado Reis (DF)",
  "MERCEARIA REI LTDA",
  "Na Onda Tabacaria (DF)",
  "Oasis Companhia (RS)",
  "Original Beco Underground (RJ)",
  "Pamonha Doce (GO)",
  "Perseu Gomes (DF)",
  "Posto 303 Sul (DF)",
  "Prime Tobacco (SP)",
  "Red Eyes OG (MS)",
  "Rodrigo Borges Tabacaria (DF)",
  "RTZ TABACARIA",
  "Sailing Pub Tabacaria",
  "Sandoval Bebidas (DF)",
  "Senhora Baforada (DF)",
  "Space Box (GYN)",
  "Tabacaria Bongada (SP)",
  "Tabacaria Cristal (DF)",
  "Tabacaria Cristal (RIACHO) (DF)",
  "Tabacaria Divina Fumaça (BA)",
  "Tabacaria do Duque (RJ)",
  "Tabacaria Gamão (DF)",
  "Tabacaria Palheiros (MG)",
  "Tabacaria Rodoviaria Plano (DF)",
  "Tabacaria RR (DF)",
  "Tabacaria Universitária (GO)",
  "Tacco Tabacaria (DF)",
  "Time Bomb (DF)",
  "Tio Chá (Nilson menegussi Junior)",
  "TUAREG TABACARIA",
  "Varejo",
  "Vini (RJ)",
  "Xolas Hookah (DF)"
];

export default function NovaVendaPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  const [cliente, setCliente] = useState<string>('Cliente Avulso');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [desconto, setDesconto] = useState<string>('0');
  const [dataVenda, setDataVenda] = useState<string>(new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState<string>('');
  
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');
  const [quantidadeItem, setQuantidadeItem] = useState<string>('1');
  const [precoUnitarioItem, setPrecoUnitarioItem] = useState<string>('0');

  useEffect(() => {
    async function carregarProdutos() {
      try {
        setCarregando(true);
        const { data, error } = await supabase
          .from('produtos')
          .select('id, nome, preco_venda, estoque_atual')
          .order('nome', { ascending: true });

        if (error) throw error;
        if (data) setProdutos(data);
      } catch (err: unknown) {
        const errObj = err as Record<string, any>;
        const mensagem = errObj?.message || errObj?.details || 'Erro ao carregar produtos.';
        setErro(mensagem);
      } finally {
        setCarregando(false);
      }
    }
    carregarProdutos();
  }, []);

  const handleSelecionarProduto = (id: string) => {
    setProdutoSelecionadoId(id);
    const prod = produtos.find((p) => p.id === id);
    if (prod) {
      setPrecoUnitarioItem(String(prod.preco_venda || 0));
    }
  };

  const adicionarItem = () => {
    if (!produtoSelecionadoId) {
      alert('Selecione um produto.');
      return;
    }

    const qtd = parseInt(quantidadeItem, 10);
    const precoU = parseFloat(precoUnitarioItem);

    if (isNaN(qtd) || qtd <= 0) {
      alert('Insira uma quantidade válida.');
      return;
    }
    if (isNaN(precoU) || precoU < 0) {
      alert('Insira um preço unitário válido.');
      return;
    }

    const produto = produtos.find((p) => p.id === produtoSelecionadoId);
    if (!produto) return;

    if (qtd > produto.estoque_atual) {
      alert(`Estoque insuficiente! Disponível: ${produto.estoque_atual}`);
      return;
    }

    const indexExistente = itens.findIndex((i) => i.produto_id === produto.id);
    if (indexExistente >= 0) {
      const novosItens = [...itens];
      const novaQtd = novosItens[indexExistente].quantidade + qtd;
      if (novaQtd > produto.estoque_atual) {
        alert(`Quantidade total excede o estoque disponível (${produto.estoque_atual}).`);
        return;
      }
      novosItens[indexExistente].quantidade = novaQtd;
      novosItens[indexExistente].preco_unitario = precoU;
      novosItens[indexExistente].subtotal = novaQtd * precoU;
      setItens(novosItens);
    } else {
      setItens([
        ...itens,
        {
          produto_id: produto.id,
          nome: produto.nome,
          quantidade: qtd,
          preco_unitario: precoU,
          subtotal: qtd * precoU,
        },
      ]);
    }

    setProdutoSelecionadoId('');
    setQuantidadeItem('1');
    setPrecoUnitarioItem('0');
  };

  const atualizarItemQuantidade = (produto_id: string, novaQtd: number) => {
    setItens(
      itens.map((item) => {
        if (item.produto_id === produto_id) {
          const q = Math.max(1, novaQtd);
          return {
            ...item,
            quantidade: q,
            subtotal: q * item.preco_unitario,
          };
        }
        return item;
      })
    );
  };

  const atualizarItemPreco = (produto_id: string, novoPreco: number) => {
    setItens(
      itens.map((item) => {
        if (item.produto_id === produto_id) {
          const p = Math.max(0, novoPreco);
          return {
            ...item,
            preco_unitario: p,
            subtotal: item.quantidade * p,
          };
        }
        return item;
      })
    );
  };

  const removerItem = (produto_id: string) => {
    setItens(itens.filter((i) => i.produto_id !== produto_id));
  };

  const subtotalGeral = itens.reduce((acc, item) => acc + item.subtotal, 0);
  const descontoNum = parseFloat(desconto) || 0;
  const totalFinal = Math.max(0, subtotalGeral - descontoNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itens.length === 0) {
      alert('Adicione pelo menos um item à venda.');
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const { data: vendaData, error: vendaError } = await supabase
        .from('vendas')
        .insert([
          {
            cliente,
            forma_pagamento: formaPagamento,
            valor_total: totalFinal,
            observacao: observacoes,
            created_at: `${dataVenda}T12:00:00.000Z`,
          },
        ])
        .select()
        .single();

      if (vendaError) throw vendaError;
      const vendaId = vendaData.id;

      for (const item of itens) {
        const { error: itemError } = await supabase.from('itens_venda').insert([
          {
            venda_id: vendaId,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario,
            subtotal: item.subtotal,
          },
        ]);
        if (itemError) throw itemError;

        const produtoOriginal = produtos.find((p) => p.id === item.produto_id);
        const estoqueAtual = produtoOriginal ? produtoOriginal.estoque_atual : 0;
        const novoEstoque = Math.max(0, estoqueAtual - item.quantidade);

        const { error: prodError } = await supabase
          .from('produtos')
          .update({ estoque_atual: novoEstoque })
          .eq('id', item.produto_id);

        if (prodError) throw prodError;
      }

      alert('Venda registada com sucesso!');
      router.push('/vendas');
      router.refresh();
    } catch (err: unknown) {
      const errObj = err as Record<string, any>;
      
      const mensagem = 
        errObj?.message || 
        errObj?.error_description || 
        errObj?.details || 
        (errObj ? JSON.stringify(errObj, Object.getOwnPropertyNames(errObj), 2) : 'Erro desconhecido ao finalizar venda.');
        
      setErro(mensagem);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-md">
          <div>
            <h1 className="text-2xl font-bold text-white">Registar Nova Venda</h1>
            <p className="text-sm text-slate-400">OrC Brasil - Controlo Comercial</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/vendas')}
            className="px-4 py-2 text-sm font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 cursor-pointer"
          >
            ← Voltar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {erro && (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm break-words whitespace-pre-wrap">
              <strong>Erro ao registar a venda:</strong>
              <br />
              {erro}
            </div>
          )}

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-3">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase text-center">
              1. Identificação do Cliente
            </h2>
            <div>
              <label className="block text-[10px] font-bold tracking-widest text-slate-400 mb-1.5 text-center uppercase">
                SELECIONE O CLIENTE
              </label>
              <select
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full p-3.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-base outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-center cursor-pointer"
              >
                {LISTA_CLIENTES.map((cli, idx) => (
                  <option key={idx} value={cli} className="bg-slate-950 text-slate-100 text-sm py-1">
                    {cli}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">2. Seleção de Produtos</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-medium text-slate-400 mb-1">Produto</label>
                <select
                  value={produtoSelecionadoId}
                  onChange={(e) => handleSelecionarProduto(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione um produto...</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} (Estoque: {p.estoque_atual})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Qtd</label>
                <input
                  type="number"
                  min="1"
                  value={quantidadeItem}
                  onChange={(e) => setQuantidadeItem(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Preço Unit. (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoUnitarioItem}
                  onChange={(e) => setPrecoUnitarioItem(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={adicionarItem}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors text-sm shadow-sm cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">3. Itens Adicionados</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
                  <tr>
                    <th className="p-3">PRODUTO</th>
                    <th className="p-3 text-center">QTD</th>
                    <th className="p-3 text-right">PREÇO UNIT. (R$)</th>
                    <th className="p-3 text-right">SUBTOTAL</th>
                    <th className="p-3 text-center">AÇÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500 text-xs uppercase tracking-wider">
                        Nenhum produto adicionado ao pedido.
                      </td>
                    </tr>
                  ) : (
                    itens.map((item) => (
                      <tr key={item.produto_id} className="hover:bg-slate-800/50">
                        <td className="p-3 font-medium text-slate-200">{item.nome}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => atualizarItemQuantidade(item.produto_id, parseInt(e.target.value) || 1)}
                            className="w-20 p-1.5 border border-slate-700 rounded bg-slate-950 text-slate-100 text-center text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.preco_unitario}
                            onChange={(e) => atualizarItemPreco(item.produto_id, parseFloat(e.target.value) || 0)}
                            className="w-28 p-1.5 border border-slate-700 rounded bg-slate-950 text-emerald-400 font-semibold text-right text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-400">
                          R$ {item.subtotal.toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removerItem(item.produto_id)}
                            className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-950/40 rounded border border-rose-900/50 cursor-pointer"
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

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">4. Pagamento e Fechamento</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Forma de Pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="OUTROS">Outros</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Desconto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Data da Venda</label>
                <input
                  type="date"
                  value={dataVenda}
                  onChange={(e) => setDataVenda(e.target.value)}
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Observações</label>
              <textarea
                rows={2}
                placeholder="Observações do pedido..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="pt-4 border-t border-slate-800 text-right space-y-1">
              <div className="text-xs text-slate-400">
                Subtotal: R$ {subtotalGeral.toFixed(2)} | Desconto: R$ {descontoNum.toFixed(2)}
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                Total Final: R$ {totalFinal.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={salvando || itens.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors shadow-lg disabled:opacity-50 cursor-pointer text-base uppercase tracking-wider"
          >
            {salvando ? 'A concluir venda...' : 'Concluir Venda'}
          </button>
        </form>

      </div>
    </div>
  );
}