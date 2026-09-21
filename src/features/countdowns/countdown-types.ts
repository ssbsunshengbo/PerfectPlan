export const countdownThemes = ["dusk", "ocean", "moss", "rose", "violet"] as const;

export type CountdownTheme = (typeof countdownThemes)[number];

export type CountdownRecord = {
  createdAt: string;
  id: string;
  targetDate: string;
  theme: CountdownTheme;
  title: string;
  updatedAt: string;
};
