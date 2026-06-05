import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const InfoField = ({
  label, icon: Icon, name, value, onChange,
  type = "text", required = false, disabled = false,
  isEditing = true, options = null, placeholder = null
}) => {
  const [showPassword, setShowPassword] = useState(false);

  if (!isEditing || disabled) {
    let displayValue = value;
    if (type === 'date' && value) displayValue = new Date(value).toLocaleDateString('en-GB');
    if (type === 'password') displayValue = '••••••••';

    return (
      <div className="group">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 group-hover:border-slate-300 transition-colors">
          <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className={`text-sm font-medium ${!value ? 'text-slate-400 italic' : 'text-slate-700'}`}>
            {displayValue || 'Not set'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>

        {type === 'select' ? (
          <Select name={name} value={value || ''} onValueChange={(val) => onChange({ target: { name, value: val } })}>
            <SelectTrigger className="w-full pl-10 h-10">
              <SelectValue placeholder={placeholder || `Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{label}</SelectLabel>
                {options?.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : type === 'textarea' ? (
          <Textarea name={name} value={value || ''} onChange={onChange}
            className="w-full pl-10 py-2.5 min-h-[100px]"
            placeholder={placeholder || `Enter ${label}`} />
        ) : (
          <>
            <Input type={type === 'password' ? (showPassword ? 'text' : 'password') : type}
              name={name} value={value || ''}
              onChange={(e) => { if (type === 'password' && !showPassword) setShowPassword(true); onChange(e); }}
              className="w-full pl-10 pr-10 h-10"
              placeholder={placeholder || `Enter ${label}`} />
            {type === 'password' && (
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-primary transition-colors">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InfoField;
