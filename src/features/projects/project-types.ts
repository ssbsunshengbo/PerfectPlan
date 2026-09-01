export const projectStatuses = ["active", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export type ProjectRecord = {
  color: string | null;
  createdAt: string;
  id: string;
  name: string;
  sortOrder: number;
  status: ProjectStatus;
  updatedAt: string;
};
