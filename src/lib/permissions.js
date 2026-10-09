/**
 * Centralized Role & Permission Validation for VPR System
 * 
 * Rules:
 * - SUPER ADMIN & ADMIN: Can perform Edit and Delete actions across all modules.
 * - USER: Read-only / processing access only; CANNOT edit or delete existing records.
 */

export const canEditOrDelete = (user) => {
  if (!user) return false;
  const role = String(user.role || '').trim().toUpperCase();
  return (
    role === 'ADMIN' ||
    role === 'SUPER ADMIN' ||
    role === 'SUPER_ADMIN' ||
    role === 'SUPERADMIN' ||
    user.Admin === 'Yes'
  );
};

export const canEdit = (user) => canEditOrDelete(user);
export const canDelete = (user) => canEditOrDelete(user);
