// Page frame for checklist pages inside VPR's Layout. The module's pages
// were written to wrap themselves in the old standalone suite's
// AdminLayout (sidebar + header + badges); inside VPR the sidebar/header
// come from VPR, so this only provides the content container.
// (The original AdminLayout.jsx is kept in the folder, unused.)

const ChecklistLayout = ({ children }) => (
  <div className="flex flex-col flex-1 min-h-0 w-full">{children}</div>
);

export default ChecklistLayout;
