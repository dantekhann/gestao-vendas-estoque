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
  categoria?: string | null;
  tipo?: string | null;
  classificacao?: string | null;
  ativo?: boolean | null;
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

export default function NovaVendaPage() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [listaClientes, setListaClientes] = useState<string[]>(['Cliente Avulso']);
  const [, setCarregando] = useState<boolean>(true);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string | null>(null);

  const [cliente, setCliente] = useState<string>('Cliente Avulso');
  const [formaPagamento, setFormaPagamento] = useState<string>('PIX');
  const [desconto, setDesconto] = useState<string>('0');
  const [dataVenda, setDataVenda] = useState<string>(new Date().toISOString().split('T')[0]);
  const [observacoes, setObservacoes] = useState<string>('');
  
  const [itens, setItens] = useState<ItemVenda[]>([]);
  
  const [termoBuscaProduto, setTermoBuscaProduto] = useState<string>('');
  const [produtoSelecionadoId, setProdutoSelecionadoId] = useState<string>('');
  const [quantidadeItem, setQuantidadeItem] = useState<string>('1');
  const [precoUnitarioItem, setPrecoUnitarioItem] = useState<string>('0');

  // Estados para o Modal de Novo Cliente
  const [mostrarModalCliente, setMostrarModalCliente] = useState<boolean>(false);
  const [novoClienteNome, setNovoClienteNome] = useState<string>('');
  const [salvandoCliente, setSalvandoCliente] = useState<boolean>(false);

  useEffect(() => {
    async function carregarDadosIniciais() {
      try {
        setCarregando(true);

        // 1. Carregar Produtos
        const { data: prodData, error: prodError } = await supabase
          .from('produtos')
          .select('id, nome, categoria, tipo, classificacao, ativo, preco_venda, estoque_atual')
          .eq('classificacao', 'Produto Finalizado')
          .order('nome', { ascending: true });

        if (prodError) throw prodError;
        if (prodData) {
          const produtosValidos = prodData.filter((p) => {
            if (p.ativo === false) return false;
            const catTipo = (p.categoria || p.tipo || '').toUpperCase();
            const nomeProd = (p.nome || '').toUpperCase();
            if (
              catTipo.includes('OCULTO') || 
              catTipo.includes('INATIVO') || 
              catTipo.includes('FALSE') ||
              nomeProd.includes('OCULTO') ||
              nomeProd.includes('INATIVO')
            ) {
              return false;
            }
            return true;
          });
          setProdutos(produtosValidos);
        }

        // 2. Carregar Clientes do Supabase
        const { data: cliData, error: cliError } = await supabase
          .from('clientes')
          .select('nome')
          .order('nome', { ascending: true });

        if (!cliError && cliData && cliData.length > 0) {
          const nomesSupabase = cliData.map((c: { nome: string }) => c.nome).filter(Boolean);
          const unicos = Array.from(new Set(['Cliente Avulso', ...nomesSupabase]));
          setListaClientes(unicos);
        }

      } catch (err: unknown) {
        const errObj = err as Record<string, unknown>;
        const mensagem = (errObj?.message as string) || (errObj?.details as string) || 'Erro ao carregar dados iniciais.';
        setErro(mensagem);
      } finally {
        setCarregando(false);
      }
    }
    carregarDadosIniciais();
  }, []);

  const handleCadastrarNovoCliente = async () => {
    const nomeLimpo = novoClienteNome.trim();
    if (!nomeLimpo) {
      alert('Digite o nome do cliente.');
      return;
    }

    try {
      setSalvandoCliente(true);
      const { error } = await supabase
        .from('clientes')
        .insert([{ nome: nomeLimpo }]);

      if (error) throw error;

      const novaLista = Array.from(new Set([...listaClientes, nomeLimpo])).sort();
      setListaClientes(novaLista);
      setCliente(nomeLimpo);
      setNovoClienteNome('');
      setMostrarModalCliente(false);
      alert('Cliente cadastrado com sucesso!');
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      alert('Erro ao salvar cliente no Supabase: ' + ((errObj?.message as string) || JSON.stringify(errObj)));
    } finally {
      setSalvandoCliente(false);
    }
  };

  const handleImportarPdfWhatsApp = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;

    const matchData = fileName.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (matchData) {
      const [, dia, mes, ano] = matchData;
      setDataVenda(`${ano}-${mes}-${dia}`);
    }

    try {
      const arrayBuffer = await file.arrayBuffer();

      // @ts-expect-error window.pdfjsLib is loaded externally
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          script.onload = () => {
            // @ts-expect-error window.pdfjsLib global
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(true);
          };
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // @ts-expect-error window.pdfjsLib global
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      
      const linhasTexto: string[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const items = textContent.items as Array<{ str: string; transform: number[] }>;

        const linhasMap: { [y: string]: string[] } = {};
        items.forEach((item) => {
          if (!item.str || !item.str.trim()) return;
          const yCoord = Math.round(item.transform[5] / 8) * 8; 
          if (!linhasMap[yCoord]) linhasMap[yCoord] = [];
          linhasMap[yCoord].push(item.str.trim());
        });

        const coordenadasY = Object.keys(linhasMap).map(Number).sort((a, b) => b - a);
        coordenadasY.forEach((y) => {
          linhasTexto.push(linhasMap[y].join(' '));
        });
      }

      let clienteEncontrado: string | null = null;
      for (const linha of linhasTexto) {
        const linhaNorm = linha.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (linhaNorm.length < 3) continue;

        const matchCli = listaClientes.find((cli) => {
          const cliNorm = cli.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (cliNorm === 'cliente avulso' || cliNorm === 'varejo') return false;
          return linhaNorm.includes(cliNorm) || cliNorm.includes(linhaNorm);
        });

        if (matchCli) {
          clienteEncontrado = matchCli;
          break;
        }
      }

      if (!clienteEncontrado) {
        for (const linha of linhasTexto.slice(0, 15)) {
          if (linha.includes('Distribuidora') || linha.includes('Tabacaria') || linha.includes('Ltda') || linha.includes('(SP)') || linha.includes('(RJ)') || linha.includes('(DF)')) {
            if (!linha.includes('ORC BRASIL')) {
              clienteEncontrado = linha.trim();
              break;
            }
          }
        }
      }

      if (clienteEncontrado) {
        if (!listaClientes.includes(clienteEncontrado)) {
          try {
            await supabase.from('clientes').insert([{ nome: clienteEncontrado }]);
            const novaLista = Array.from(new Set([...listaClientes, clienteEncontrado])).sort();
            setListaClientes(novaLista);
          } catch (e) {
            console.error("Erro ao auto-cadastrar cliente:", e);
          }
        }
        setCliente(clienteEncontrado);
      }

      const itensMapeados: ItemVenda[] = [];

      linhasTexto.forEach((linha) => {
        const linhaNorm = linha.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (linhaNorm.includes('total') || linhaNorm.includes('desconto')) return;

        produtos.forEach((prod) => {
          if (itensMapeados.some(i => i.produto_id === prod.id)) return;

          const nomeP = prod.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const palavrasChave = nomeP.split(' ').filter(p => p.length > 2);
          if (palavrasChave.length === 0) return;

          const matchCompleto = palavrasChave.every(palavra => linhaNorm.includes(palavra));

          if (matchCompleto) {
            const numerosEncontrados = linha.match(/(\d{1,3}(?:\.\d{3})*,\d{2})|(\d+)/g);
            let quantidade = 1;

            if (numerosEncontrados && numerosEncontrados.length > 0) {
              const nums = numerosEncontrados.map(n => parseFloat(n.replace(/\./g, '').replace(',', '.')));
              const qtdCandidata = nums.find(n => n > 0 && n < 1000);
              if (qtdCandidata !== undefined) {
                quantidade = qtdCandidata;
              }
            }

            let precoUnitario = prod.preco_venda;
            const precosNoPdf = linha.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
            if (precosNoPdf && precosNoPdf.length >= 1) {
              const precoExtraido = parseFloat(precosNoPdf[0].replace(/\./g, '').replace(',', '.'));
              if (!isNaN(precoExtraido) && precoExtraido > 0) {
                precoUnitario = precoExtraido;
              }
            }

            const subtotal = quantidade * precoUnitario;

            itensMapeados.push({
              produto_id: prod.id,
              nome: prod.nome,
              quantidade: quantidade,
              preco_unitario: precoUnitario,
              subtotal: subtotal
            });
          }
        });
      });

      let descontoEncontrado = '0';
      for (const t of linhasTexto) {
        if (t.toLowerCase().includes('desconto')) {
          const matchVal = t.match(/([\d\.]+,\d{2})|(\d+)/g);
          if (matchVal) {
            const ultimoNum = matchVal[matchVal.length - 1].replace(/\./g, '').replace(',', '.');
            const numVal = parseFloat(ultimoNum);
            if (!isNaN(numVal) && numVal > 0 && numVal < 10000) {
              descontoEncontrado = String(numVal);
              break;
            }
          }
        }
      }
      setDesconto(descontoEncontrado);

      if (itensMapeados.length > 0) {
        setItens(itensMapeados);
        alert(`PDF importado com sucesso!\nCliente: ${clienteEncontrado || 'Não detetado'}\nDesconto: R$ ${descontoEncontrado}\n${itensMapeados.length} item(ns) importados.`);
      } else {
        alert("Não foi possível extrair os itens com exatidão. Adicione-os manualmente abaixo.");
      }

    } catch (err) {
      console.error("Erro ao ler PDF:", err);
      alert("Erro ao processar o conteúdo interno do PDF.");
    }
  };

  const handleInputChangeProduto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorDigitado = e.target.value;
    setTermoBuscaProduto(valorDigitado);

    const prodEncontrado = produtos.find(
      (p) => p.nome.toLowerCase() === valorDigitado.toLowerCase()
    );

    if (prodEncontrado) {
      setProdutoSelecionadoId(prodEncontrado.id);
      setPrecoUnitarioItem(String(prodEncontrado.preco_venda || 0));
    } else {
      setProdutoSelecionadoId('');
    }
  };

  const handleSelecionarPorDatalist = (valorDigitado: string) => {
    setTermoBuscaProduto(valorDigitado);
    const prod = produtos.find((p) => p.nome.toLowerCase() === valorDigitado.toLowerCase());
    if (prod) {
      setProdutoSelecionadoId(prod.id);
      setPrecoUnitarioItem(String(prod.preco_venda || 0));
    } else {
      setProdutoSelecionadoId('');
    }
  };

  const adicionarItem = () => {
    let produto = produtos.find((p) => p.id === produtoSelecionadoId);

    if (!produto && termoBuscaProduto.trim() !== '') {
      produto = produtos.find((p) => p.nome.toLowerCase() === termoBuscaProduto.trim().toLowerCase());
    }

    if (!produto) {
      alert('Selecione um produto válido da lista.');
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

    if (qtd > produto.estoque_atual) {
      alert(`Estoque insuficiente! Disponível: ${produto.estoque_atual}`);
      return;
    }

    const indexExistente = itens.findIndex((i) => i.produto_id === produto!.id);
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

    setTermoBuscaProduto('');
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

      const resumoProdutos = itens
        .map((i) => `${i.quantidade}x ${i.nome}`)
        .join(', ');
      
      const observacaoFinal = observacoes.trim() !== '' 
        ? `${resumoProdutos} | Obs: ${observacoes.trim()}` 
        : resumoProdutos;

      const { data: vendaData, error: vendaError } = await supabase
        .from('vendas')
        .insert([
          {
            cliente,
            forma_pagamento: formaPagamento,
            valor_total: totalFinal,
            observacao: observacaoFinal,
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

        const { error: movError } = await supabase.from('movimentacoes').insert([
          {
            produto_id: item.produto_id,
            tipo: 'VENDA',
            quantidade: item.quantidade,
            observacao: cliente,
            created_at: `${dataVenda}T12:00:00.000Z`,
          },
        ]);
        
        if (movError) {
          throw new Error(`Erro ao registar movimentação para o produto ${item.nome}: ${movError.message}`);
        }
      }

      alert('Venda registada e lançada com sucesso!');
      router.push('/vendas');
      router.refresh();
    } catch (err: unknown) {
      console.error("Erro completo:", err);
      const errObj = err as Record<string, unknown>;
      
      const mensagemDetalhada = 
        (errObj?.message as string) || 
        (errObj?.error_description as string) || 
        (errObj?.details as string) || 
        JSON.stringify(errObj, null, 2);
        
      setErro(mensagemDetalhada);
      alert("Erro do Supabase: " + mensagemDetalhada);
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

        <div className="bg-gradient-to-r from-emerald-950/40 to-blue-950/40 p-5 rounded-xl border border-emerald-500/30 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">
              Importar Pedido do WhatsApp (PDF)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecione o PDF baixado para carregar cliente, data, desconto e produtos exatos na ordem correta.
            </p>
          </div>
          <label className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-sm text-center cursor-pointer transition-colors shadow-sm whitespace-nowrap">
            📂 Selecionar PDF
            <input
              type="file"
              accept=".pdf"
              onChange={handleImportarPdfWhatsApp}
              className="hidden"
            />
          </label>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {erro && (
            <div className="p-4 border border-red-500/30 bg-red-950/50 text-red-400 rounded-lg text-sm whitespace-pre-wrap">
              <strong>Erro ao registar a venda:</strong>
              <br />
              {erro}
            </div>
          )}

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-4">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase text-center">
              1. Identificação do Cliente
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-9">
                <label className="block text-[10px] font-bold tracking-widest text-slate-400 mb-1.5 uppercase">
                  SELECIONE O CLIENTE
                </label>
                <select
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full p-3.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-base outline-none focus:ring-2 focus:ring-blue-500 font-semibold cursor-pointer"
                >
                  {listaClientes.map((cli, idx) => (
                    <option key={idx} value={cli} className="bg-slate-950 text-slate-100 text-sm py-1">
                      {cli}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={() => setMostrarModalCliente(true)}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer shadow-sm"
                >
                  + Novo Cliente
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-md space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">2. Pesquisa e Seleção de Produtos</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-6">
                <label className="block text-xs font-medium text-slate-400 mb-1">Digite ou Selecione o Produto</label>
                <input
                  type="text"
                  list="lista-produtos"
                  value={termoBuscaProduto}
                  onChange={handleInputChangeProduto}
                  onBlur={(e) => handleSelecionarPorDatalist(e.target.value)}
                  placeholder="Ex: Yerba Display..."
                  className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="lista-produtos">
                  {produtos.map((p) => (
                    <option key={p.id} value={p.nome}>
                      Estoque: {p.estoque_atual} | R$ {p.preco_venda.toFixed(2)}
                    </option>
                  ))}
                </datalist>
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
              <label className="block text-xs font-medium text-slate-400 mb-1">Observações Adicionais</label>
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

      {/* MODAL PARA ADICIONAR NOVO CLIENTE */}
      {mostrarModalCliente && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Cadastrar Novo Cliente</h3>
            <p className="text-xs text-slate-400">
              O nome inserido será guardado diretamente na base de dados (tabela <code className="text-indigo-400 font-mono">clientes</code>) e ficará disponível para futuras vendas.
            </p>
            
            <input
              type="text"
              placeholder="Nome da Loja / Distribuidora..."
              value={novoClienteNome}
              onChange={(e) => setNovoClienteNome(e.target.value)}
              className="w-full p-3.5 border border-slate-700 rounded-lg bg-slate-950 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMostrarModalCliente(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={salvandoCliente}
                onClick={handleCadastrarNovoCliente}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold cursor-pointer shadow-sm disabled:opacity-50"
              >
                {salvandoCliente ? 'A guardar...' : 'Guardar e Selecionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}