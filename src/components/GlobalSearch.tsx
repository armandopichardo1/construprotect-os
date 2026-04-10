import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Briefcase, Package, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'contact' | 'deal' | 'product';
  title: string;
  subtitle: string;
}

const TYPE_CONFIG = {
  contact: { icon: User, label: 'Contacto', color: 'text-primary', route: '/crm' },
  deal: { icon: Briefcase, label: 'Deal', color: 'text-accent', route: '/crm' },
  product: { icon: Package, label: 'Producto', color: 'text-warning', route: '/productos' },
};

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query.trim()), 250);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const doSearch = async (q: string) => {
    setLoading(true);
    const like = `%${q}%`;

    const [contacts, deals, products] = await Promise.all([
      supabase.from('contacts').select('id, contact_name, company_name, segment').or(`contact_name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
      supabase.from('deals').select('id, title, value_usd, stage, contacts(contact_name)').or(`title.ilike.${like},project_name.ilike.${like}`).limit(5),
      supabase.from('products').select('id, name, sku, brand, category').or(`name.ilike.${like},sku.ilike.${like},brand.ilike.${like}`).limit(5),
    ]);

    const mapped: SearchResult[] = [];

    (contacts.data || []).forEach(c => mapped.push({
      id: c.id, type: 'contact',
      title: c.contact_name,
      subtitle: [c.company_name, c.segment].filter(Boolean).join(' · ') || '—',
    }));

    (deals.data || []).forEach(d => mapped.push({
      id: d.id, type: 'deal',
      title: d.title,
      subtitle: `$${Number(d.value_usd || 0).toLocaleString()} · ${(d.contacts as any)?.contact_name || d.stage}`,
    }));

    (products.data || []).forEach(p => mapped.push({
      id: p.id, type: 'product',
      title: p.name,
      subtitle: [p.sku, p.brand, p.category].filter(Boolean).join(' · '),
    }));

    setResults(mapped);
    setSelectedIdx(-1);
    setOpen(mapped.length > 0);
    setLoading(false);
  };

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery('');
    navigate(TYPE_CONFIG[r.type].route);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIdx >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar contactos, deals, productos..."
        className="h-8 text-xs pl-8 pr-8 rounded-xl bg-muted/50 border-transparent focus:border-border"
      />
      {query && (
        <button onClick={() => { setQuery(''); setOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
          {loading && <p className="text-[10px] text-muted-foreground p-3">Buscando...</p>}
          {!loading && results.length === 0 && <p className="text-[10px] text-muted-foreground p-3">Sin resultados</p>}
          {results.map((r, idx) => {
            const cfg = TYPE_CONFIG[r.type];
            const Icon = cfg.icon;
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                  idx === selectedIdx && 'bg-muted/50'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 shrink-0', cfg.color)} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.subtitle}</p>
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0">{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
