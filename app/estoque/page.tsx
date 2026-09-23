'use client';

import { useState } from 'react';
import TabelaProdutos from '@/app/components/TabelaProdutos';
import ModalNovoProduto from './ModalNovoProduto';

interface Props {
  produtos: any[];
}

export default function PaginaEstoque({ produtos }: Props) {
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho com o botão de Adicionar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Gestão de Estoque</h1>
          <p className="text-xs text-slate-400">Controlo de matérias-primas, embalagens e produtos finais da OrC Brasil.</p>
        </div>
        
        <button
          onClick={() => setModalAberto(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-emerald-950/20"
        >
          + Novo Produto
        </button>
      </div>

      {/* Tabela de Produtos */}
      <TabelaProdutos produtos={produtos} />

      {/* Modal de Cadastro de Novo Produto */}
      <ModalNovoProduto 
        isOpen={modalAberto} 
        onClose={() => setModalAberto(false)} 
      />
    </div>
  );
}