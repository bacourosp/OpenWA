import cron from 'node-cron';
import { config } from './config.js';
import { runNasdaqReport } from './nasdaq.js';

/**
 * Schedules the daily NASDAQ fundamental report at DAILY_REPORT_CRON in DAILY_REPORT_TZ
 * (default: 07:00 America/New_York, Mon–Fri).
 */
export function startSchedulers(): void {
  if (config.dailyReportChats.length === 0) {
    console.warn('[scheduler] DAILY_REPORT_CHATS vacío → no se programa el informe NASDAQ.');
    return;
  }
  if (!cron.validate(config.dailyReportCron)) {
    console.error(`[scheduler] DAILY_REPORT_CRON inválido: "${config.dailyReportCron}" → no programado.`);
    return;
  }

  cron.schedule(
    config.dailyReportCron,
    () => {
      console.log('[scheduler] disparando informe NASDAQ diario');
      runNasdaqReport().catch((err) => console.error('[scheduler] informe NASDAQ falló:', err));
    },
    { timezone: config.dailyReportTz },
  );

  console.log(
    `[scheduler] informe NASDAQ programado: cron="${config.dailyReportCron}" tz=${config.dailyReportTz} ` +
      `→ ${config.dailyReportChats.join(', ')}`,
  );
}
