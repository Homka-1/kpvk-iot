import { startStand } from './support/stand.ts';

/** Поднимает приёмочный стенд перед сценариями и останавливает API после них. */
export default async function globalSetup(): Promise<() => void> {
  const { stop } = await startStand();
  return stop;
}
