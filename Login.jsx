import { useState } from 'react';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Mail, User, Loader2 } from 'lucide-react';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        // REGISTER: Kirim email, password, DAN full_name
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }, // Penting!
        });
        if (error) throw error;
        alert('Pendaftaran berhasil! Silakan login.');
        setIsSignUp(false);
      } else {
        // LOGIN
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate('/dashboard');
      }
    } catch (error) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">
          Aplikasi Guru
        </h1>
        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Nama Lengkap
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-3 text-gray-400"
                  size={18}
                />
                <input
                  className="w-full pl-10 p-2 border rounded"
                  type="text"
                  placeholder="Nama Guru"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                className="w-full pl-10 p-2 border rounded"
                type="email"
                placeholder="email@sekolah.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Kata Sandi
            </label>
            <div className="relative">
              <KeyRound
                className="absolute left-3 top-3 text-gray-400"
                size={18}
              />
              <input
                className="w-full pl-10 p-2 border rounded"
                type="password"
                placeholder="******"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <button
            className="w-full bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700 flex justify-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : isSignUp ? (
              'Daftar Akun'
            ) : (
              'Masuk'
            )}
          </button>
        </form>
        <div className="mt-4 text-center text-sm">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-600 font-bold hover:underline"
          >
            {isSignUp
              ? 'Sudah punya akun? Login'
              : 'Belum punya akun? Daftar dulu dong..'}
          </button>
        </div>
      </div>
    </div>
  );
}
