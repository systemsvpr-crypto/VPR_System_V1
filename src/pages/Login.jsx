import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { loginUser } from '../services/authService';
import { PAGES, USER_ROLES } from '../constants';
import vprLogo from '../../assets/vpr_logo.png';


const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  useEffect(() => {
    // Clear language hint on load
    localStorage.removeItem('hasSeenLanguageHint');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const user = await loginUser(username, password);

      toast.success('Login successful!');

      // Compatibility object
      const userForStore = {
        ...user,
        Name: user.full_name,
        Admin: (user.role && USER_ROLES.slice(0, -1).some(r => r.toLowerCase() === user.role.toLowerCase())) ? 'Yes' : 'No'
      };

      localStorage.setItem('user', JSON.stringify(userForStore));
      login(userForStore);

      navigate(`/${PAGES[0].id}`, { replace: true });

    } catch (err) {
      console.error('Login exception:', err);
      toast.error(err.message || 'An unexpected error occurred during login');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-50 items-center justify-center relative overflow-hidden p-12">
        <div className="absolute inset-0 z-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(var(--primary) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="relative z-10 flex items-center justify-center w-full max-w-sm">
          <img 
            src={vprLogo} 
            alt="VPR Logo" 
            draggable="false"
            className="w-full h-auto max-h-[400px] object-contain select-none pointer-events-none" 
          />
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="max-w-[420px] w-full space-y-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-4 bg-primary/10 px-5 py-3.5 rounded-2xl border border-primary/20 mb-6">
              <div className="rounded-lg border border-primary/20 p-1 bg-white shadow-sm flex items-center justify-center">
                <img 
                  src={vprLogo} 
                  alt="VPR Logo" 
                  draggable="false"
                  className="h-12 w-12 rounded-md object-contain select-none pointer-events-none" 
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xl xl:text-2xl font-extrabold tracking-tight uppercase whitespace-nowrap">
                  <span className="text-slate-900">VPR</span>{' '}
                  <span className="text-blue-600">Systems</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-400 tracking-[0.2em] uppercase">Enterprise Suite</span>
              </div>
            </div>
            <p className="text-sm text-slate-500">Please enter your details to sign in.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <InputField
              id="username" label="Username" type="text"
              value={username} onChange={e => setUsername(e.target.value)}
              icon={User} placeholder="Enter your username"
            />
            <InputField
              id="password" label="Password" type={showPassword ? "text" : "password"}
              value={password} onChange={e => setPassword(e.target.value)}
              icon={Lock} placeholder="••••••••"
              rightIcon={showPassword ? EyeOff : Eye}
              onRightIconClick={() => setShowPassword(!showPassword)}
            />

            <button
              type="submit"
              disabled={submitting}
              className={`w-full flex justify-center py-3.5 px-4 rounded-xl shadow-lg shadow-primary/20 text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 transform hover:-translate-y-0.5 ${submitting ? 'opacity-70 cursor-not-allowed hover:bg-primary/80 hover:translate-y-0' : ''}`}
            >
              {submitting ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="animate-spin h-4 w-4" />
                  <span>Signing in...</span>
                </div>
              ) : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const InputField = ({ id, label, type, value, onChange, icon: Icon, placeholder, rightIcon: RightIcon, onRightIconClick }) => (
  <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
    <div className="relative group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
      </div>
      <input
        id={id}
        name={id}
        type={type}
        required
        value={value}
        onChange={onChange}
        className={`block w-full pl-10 ${RightIcon ? 'pr-10' : 'pr-3'} py-3 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm bg-slate-50/50 focus:bg-white`}
        placeholder={placeholder}
      />
      {RightIcon && (
        <button
          type="button"
          onClick={onRightIconClick}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
        >
          <RightIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  </div>
);

export default Login;
