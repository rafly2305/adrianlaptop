export type Role = 'super_admin' | 'branch_admin' | 'inventory_staff' | 'sales' | 'service_staff' | 'finance' | 'hr';

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin / CEO', branch_admin: 'Admin Cabang', inventory_staff: 'Staf Inventory',
  sales: 'Sales', service_staff: 'Customer Service / Warranty', finance: 'Finance', hr: 'HR',
};

const ALL: Role[] = ['super_admin', 'branch_admin', 'inventory_staff', 'sales', 'service_staff', 'finance', 'hr'];
const OPS: Role[] = ALL.filter((r) => r !== 'hr');

export const PERMS = {
  'dashboard.view': ALL,
  'inventory.view': OPS,
  'inventory.write': ['super_admin', 'branch_admin', 'inventory_staff'],
  'pos.sell': ['super_admin', 'branch_admin', 'sales'],
  'sales.view': ['super_admin', 'branch_admin', 'sales', 'finance', 'service_staff'],
  'sales.void': ['super_admin', 'branch_admin'],
  'sales.return': ['super_admin', 'branch_admin', 'sales'],
  'service.view': ['super_admin', 'branch_admin', 'service_staff', 'sales'],
  'service.write': ['super_admin', 'branch_admin', 'service_staff'],
  'service.create': ['super_admin', 'branch_admin', 'service_staff', 'sales'],
  'reports.view': ['super_admin', 'branch_admin', 'finance'],
  'audit.view': ['super_admin', 'branch_admin'],
  'settings.manage': ['super_admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Perm = keyof typeof PERMS;

export function can(role: Role | null | undefined, perm: Perm): boolean {
  return !!role && (PERMS[perm] as readonly Role[]).includes(role);
}
