/* ------------------------------------------------------------------ */
/*  Color Grading – FFmpeg colorbalance-based look pipeline           */
/*  Maps VideoIR style metadata to FFmpeg filter parameters.          */
/*  No external LUT files required – pure filter chain grading.       */
/* ------------------------------------------------------------------ */

export interface ColorGradeParams {
  colorbalance: string;
  eq?: string;
}

const NEUTRAL_GRADE: ColorGradeParams = { colorbalance: 'rs=0:gs=0:bs=0' };

const TEMPERATURE_GRADES: Record<string, ColorGradeParams> = {
  warm: {
    colorbalance: 'rs=0.06:gs=0.02:bs=-0.08:rm=0.04:gm=0.01:bm=-0.05',
    eq: 'contrast=1.03:brightness=0.01',
  },
  cool: {
    colorbalance: 'rs=-0.06:gs=-0.01:bs=0.08:rm=-0.04:gm=0.0:bm=0.05',
    eq: 'contrast=1.04:brightness=-0.01',
  },
  neutral: {
    colorbalance: 'rs=0:gs=0:bs=0',
  },
};

const STYLE_GRADES: Record<string, Partial<ColorGradeParams>> = {
  cinematic: {
    colorbalance: 'rh=-0.03:gh=-0.01:bh=0.04',
    eq: 'contrast=1.08:brightness=-0.02:saturation=1.1',
  },
  anime: {
    eq: 'contrast=1.12:saturation=1.25:brightness=0.02',
  },
  watercolor: {
    eq: 'contrast=0.92:saturation=0.85:brightness=0.03',
  },
  documentary: {
    colorbalance: 'rs=-0.02:gs=0:bs=0.02',
    eq: 'contrast=1.05:saturation=0.9',
  },
  flat: {
    eq: 'contrast=0.95:saturation=1.15:brightness=0.01',
  },
  realistic: {
    eq: 'contrast=1.02:saturation=1.0',
  },
};

export function buildColorGradeFilter(
  colorTemperature: string,
  visualStyle: string,
): string {
  const filters: string[] = [];

  const tempGrade = TEMPERATURE_GRADES[colorTemperature] ?? TEMPERATURE_GRADES.neutral ?? NEUTRAL_GRADE;
  if (tempGrade.colorbalance && tempGrade.colorbalance !== 'rs=0:gs=0:bs=0') {
    filters.push(`colorbalance=${tempGrade.colorbalance}`);
  }

  const styleLower = visualStyle.toLowerCase();
  const styleKey = Object.keys(STYLE_GRADES).find(k => styleLower.includes(k));
  const styleGrade = styleKey ? STYLE_GRADES[styleKey] : undefined;
  if (styleGrade?.colorbalance) {
    filters.push(`colorbalance=${styleGrade.colorbalance}`);
  }

  const eqStr = styleGrade?.eq ?? tempGrade.eq;
  if (eqStr) {
    filters.push(`eq=${eqStr}`);
  }

  return filters.join(',');
}

export function hasColorGrading(colorTemperature: string, visualStyle: string): boolean {
  return buildColorGradeFilter(colorTemperature, visualStyle).length > 0;
}
