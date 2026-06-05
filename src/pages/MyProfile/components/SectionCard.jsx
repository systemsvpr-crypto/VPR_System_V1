const SectionCard = ({ title, icon: Icon, children }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
      <div className="bg-primary/10 p-2 rounded-lg">
        <Icon className="text-primary" size={20} />
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

export default SectionCard;
