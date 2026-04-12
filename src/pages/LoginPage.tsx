import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';

const USERNAME_MAP: Record<string, string> = {
  apichardo: 'apichardo@construprotect.com',
  lazar: 'lazar@construprotect.com',
  dazar: 'dazar@construprotect.com',
};

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const isSignUp = false;
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('cp_remember');
    if (saved) {
      const { username: u, remember: r } = JSON.parse(saved);
      setUsername(u);
      setRemember(r);
    }
  }, []);

  const resolveEmail = (input: string): string => {
    const lower = input.trim().toLowerCase();
    return USERNAME_MAP[lower] || (lower.includes('@') ? lower : `${lower}@construprotect.com`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (remember) {
        localStorage.setItem('cp_remember', JSON.stringify({ username, remember: true }));
      } else {
        localStorage.removeItem('cp_remember');
      }
      const email = resolveEmail(username);
      if (isSignUp) {
        await signUp(email, password, fullName);
        toast.success('Cuenta creada.');
      } else {
        await signIn(email, password);
        toast.success('Sesión iniciada');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <span className="text-5xl block">🏗️</span>
          <h1 className="text-3xl font-bold text-foreground">ConstruProtect OS</h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? 'Crear cuenta' : 'Iniciar sesión en el sistema'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-card border border-border p-6">
          {isSignUp && (
            <Input
              placeholder="Nombre completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="h-11"
            />
          )}
          <Input
            placeholder="Usuario o email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
            className="h-11"
          />
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!isSignUp && (
            <div className="flex items-center gap-2">
              <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">Recordar usuario</label>
            </div>
          )}
          <Button type="submit" className="w-full h-11 text-sm" disabled={loading}>
            {loading ? 'Cargando...' : isSignUp ? 'Registrarse' : 'Entrar'}
          </Button>
        </form>
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          </p>
          {!isSignUp && (
            <p className="text-[10px] text-muted-foreground/60">
              Usuarios: apichardo, lazar, dazar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
