import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileText, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  expenseId: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}

export function ReceiptUpload({ expenseId, currentUrl, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Archivo máximo 5MB'); return; }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${expenseId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: true });
    if (error) { toast.error('Error al subir archivo'); setUploading(false); return; }

    // Store the storage path (not a public URL) since bucket is private
    const storagePath = path;

    // Update expense record with the storage path
    await supabase.from('expenses').update({ receipt_url: storagePath }).eq('id', expenseId);

    onUploaded(publicUrl);
    toast.success('Recibo subido');
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
      {currentUrl ? (
        <a href={currentUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <FileText className="w-3 h-3" /> Ver recibo <ExternalLink className="w-2.5 h-2.5" />
        </a>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Upload className="w-3 h-3" />
          {uploading ? 'Subiendo...' : 'Adjuntar'}
        </button>
      )}
    </div>
  );
}
