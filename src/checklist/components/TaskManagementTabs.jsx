import { ClipboardCheck } from "lucide-react";
import { motion } from "framer-motion";

export default function TaskManagementTabs({ activeTab, setActiveTab, allowedTabs }) {
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const designation = (localStorage.getItem("designation") || "").toLowerCase();
  const isMachineOperator =
    designation.includes("machin") ||
    designation.includes("operat") ||
    designation.includes("oprat");

  const allTabs = [
    {
      id: "checklist",
      label: "Checklist",
      icon: ClipboardCheck,
      color: "text-blue-600",
      activeColor: "bg-blue-600",
    },
    {
      id: "delegation",
      label: "Delegation",
      icon: ClipboardCheck,
      color: "text-blue-600",
      activeColor: "bg-blue-600",
    },
  ];

  const tabs = allTabs.filter((tab) => {
    if (allowedTabs && !allowedTabs.includes(tab.id)) return false;
    if (role === "hod") {
      if (tab.id === "checklist" || tab.id === "delegation") return true;
      if (tab.id === "repair" && isMachineOperator) return true;
      return false;
    }
    return true;
  });

  return (
    <div className="bg-white/40 backdrop-blur-md rounded-2xl p-1.5 border border-gray-100/80 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-start">
        {/* Navigation Tabs */}
        <div className="w-full lg:w-auto overflow-hidden">
          <div className="flex bg-gray-100/50 p-1 rounded-xl relative overflow-x-auto no-scrollbar max-w-max">
            {tabs.map((tab) => {
              const normalizedActive = activeTab.toLowerCase();
              const normalizedId = tab.id.toLowerCase();
              const isActive =
                normalizedActive === normalizedId ||
                (normalizedActive === "default" &&
                  normalizedId === "checklist");
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                                        relative flex items-center justify-center gap-2.5 py-2 px-6 rounded-lg text-xs font-bold transition-all duration-500 whitespace-nowrap min-w-[100px] md:min-w-[120px] z-10
                                        ${isActive ? "text-white" : "text-gray-500 hover:text-blue-600"}
                                    `}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPillGlobal"
                      className={`absolute inset-0 rounded-lg shadow-md z-[-1] ${tab.activeColor}`}
                      transition={{
                        type: "spring",
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                    />
                  )}
                  <Icon
                    size={isActive ? 17 : 16}
                    className={`${isActive ? "text-white" : tab.color} transition-colors duration-300`}
                  />
                  <span className="relative">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
