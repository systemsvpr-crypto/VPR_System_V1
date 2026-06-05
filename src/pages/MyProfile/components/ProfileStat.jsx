const ProfileStat = ({ label, value, uppercase }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={`font-semibold text-slate-800 ${uppercase ? 'uppercase' : ''}`}>
      {value}
    </span>
  </div>
);

export default ProfileStat;
