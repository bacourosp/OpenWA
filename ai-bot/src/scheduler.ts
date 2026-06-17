import cron from 'node-cron';
import { config } from './config.js';
import { runNasdaqAnalysis } from './jobs/nasdaq-analysis.js';
import { runTradingTips } from './jobs/trading-tips.js';
import { runNewsShare } from './jobs/news-share.js';

interface JobDef {
  name: string;
  run: (targets: string[]) => Promise<unknown>;
  block: { startHour: number; startMin: number; windowMin: number };
  days: string;
  testDelaySec: number; // stagger in test mode so messages don't arrive all at once
  enabled: boolean;
}

const JOBS: JobDef[] = [
  {
    name: 'nasdaq-analysis',
    run: runNasdaqAnalysis,
    block: config.nasdaqAnalysisBlock,
    days: config.nasdaqAnalysisDays,
    testDelaySec: 0,
    enabled: true,
  },
  {
    name: 'trading-tips',
    run: runTradingTips,
    block: config.tradingTipsBlock,
    days: config.tradingTipsDays,
    testDelaySec: 90,
    enabled: true,
  },
  {
    name: 'news-share',
    run: runNewsShare,
    block: config.newsShareBlock,
    days: config.newsShareDays,
    testDelaySec: 180,
    enabled: false, // pendiente de afinar el prompt
  },
];

function fire(job: JobDef, targets: string[], delayMs = 0): void {
  const go = () => {
    console.log(`[scheduler] disparando ${job.name} → ${targets.join(', ')}`);
    job.run(targets).catch((err) => console.error(`[scheduler] ${job.name} error:`, err));
  };
  delayMs > 0 ? setTimeout(go, delayMs) : go();
}

export function startSchedulers(): void {
  const targets = config.testMode
    ? ([config.testGroupId].filter(Boolean) as string[])
    : config.productionGroups;

  if (targets.length === 0) {
    console.warn('[scheduler] Sin grupos destino — jobs no programados. Configura TEST_GROUP_ID o PRODUCTION_GROUPS.');
    return;
  }

  const activeJobs = JOBS.filter((j) => j.enabled);
  if (activeJobs.length === 0) {
    console.warn('[scheduler] Todos los jobs están deshabilitados.');
    return;
  }

  if (config.testMode) {
    // TEST MODE: todos los jobs activos cada 5 min, escalonados para no llegar al mismo tiempo.
    console.log(`[scheduler] MODO TEST activo — jobs cada 5 min → ${targets.join(', ')}`);
    for (const job of activeJobs) {
      cron.schedule(
        '*/5 * * * *',
        () => fire(job, targets, job.testDelaySec * 1000),
        { timezone: config.schedulerTz },
      );
      console.log(`[scheduler]   ${job.name}: cada 5 min (delay +${job.testDelaySec}s)`);
    }
    return;
  }

  // PRODUCTION MODE: cada job usa su bloque horario + offset aleatorio dentro de la ventana.
  for (const job of activeJobs) {
    const { startHour, startMin, windowMin } = job.block;
    const cronExpr = `${startMin} ${startHour} * * ${job.days}`;

    if (!cron.validate(cronExpr)) {
      console.error(`[scheduler] cron inválido para ${job.name} ("${cronExpr}") — saltado.`);
      continue;
    }

    cron.schedule(
      cronExpr,
      () => {
        // Random delay within the window so messages don't always fire at the same minute.
        const delayMs = Math.random() * windowMin * 60_000;
        const fireInMin = Math.round(delayMs / 60_000);
        console.log(`[scheduler] ${job.name} → en ~${fireInMin} min`);
        fire(job, targets, delayMs);
      },
      { timezone: config.schedulerTz },
    );

    const pad = (n: number) => String(n).padStart(2, '0');
    const endMin = (startHour * 60 + startMin + windowMin) % 60;
    const endHour = Math.floor((startHour * 60 + startMin + windowMin) / 60);
    console.log(
      `[scheduler] ${job.name}: ${pad(startHour)}:${pad(startMin)}–${pad(endHour)}:${pad(endMin)} ` +
        `días=${job.days} tz=${config.schedulerTz} → ${targets.join(', ')}`,
    );
  }
}
